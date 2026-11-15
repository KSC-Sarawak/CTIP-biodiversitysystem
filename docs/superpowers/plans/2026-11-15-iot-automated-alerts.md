# Automated IoT Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sensor readings raise alerts by themselves. A reading that breaks a node's rule (CTIP-38) or a node that goes silent (CTIP-76) creates an alert, and officers and admins are told in the app and by push, never with coordinates (CTIP-77). Today nothing creates alerts: `ingestTelemetry` only stores readings.

**Architecture:** A pure rule function in `services/api/src/alertRules.js` decides which alerts a batch of readings raises. `ingestTelemetry` calls it and inserts the alerts with the server key. A database function raises "node silent" alerts. It runs every 5 minutes through `pg_cron` when that is switched on, and the API also runs it (at most once a minute) on telemetry and when staff list alerts, as `purge_deleted_users()` already does. The existing `trg_notify_on_alert_created` trigger makes the in-app notifications; the API adds push.

**Tech Stack:** Express + Zod, supabase-js with the service key, Postgres (`plpgsql`, optional `pg_cron`), Expo push, `node:test` + supertest.

**Spec:** Jira CTIP-38 (threshold rules, rules run in the API when telemetry arrives), CTIP-76 (silent node alert after a configurable time; node shown online again when readings resume), CTIP-77 (officers notified quickly; no coordinates). Project brief Area 4: "Threat detection and automated alerts". These tickets are Norman's: agree with him before starting.

## Global Constraints

Rule keys live in `sensor_nodes.thresholds`, a JSON object of numbers or null, already editable by admins through `PATCH /sensor-nodes/:id`. A missing or null key means the rule is off, except where a default is given.

| key | alert `type` | raised when | severity |
|---|---|---|---|
| `motion` (default 1 = on; 0 = off) | `motion` | `motion_detected === true` | high |
| `distance_change_cm` | `distance_change` | \|distance_cm − previous distance_cm\| ≥ value | high |
| `temp_max` / `temp_min` | `temperature` | temperature > max or < min | medium |
| `humidity_max` / `humidity_min` | `humidity` | humidity > max or < min | medium |
| `moisture_min` | `soil_dry` | soil_moisture < value | medium |
| `silent_minutes` (default 15) | `node_silent` | `last_seen` older than value (and the node is active or offline) | high |

- **One open alert per node and type:** while an `open` or `acknowledged` alert of that type exists for the node, no new one is made. This stops a flood every 5 seconds.
- `alerts.reading` holds `{ message, value, limit, ts }`. `message` is plain words, such as "Soil moisture 12% is below the 20% limit". It never holds `lat`, `lng` or any coordinate. The same goes for the notification title and body, and the push text.
- In-app notifications go to every active officer and admin (the current trigger). Routing per node or severity is CTIP-48, not this plan.
- A failure to evaluate rules, insert an alert or send a push never fails the telemetry request: the readings are already stored. Log it and answer 202.
- The node is marked `offline` by the silent check and set back to `active` by the next telemetry, which answers CTIP-76 "shown online again".
- The contract (`packages/api-contract/openapi.yaml`) describes the threshold keys and alert types; that change needs a second person's review.
- Commit straight to `main`. Commit messages carry no Claude author or session lines.

## Review Focus

1. **A batch of 100 readings that all break the same rule:** exactly one alert, carrying the first breaking reading.
2. **A node with no `thresholds` at all** (every current node): only the motion rule applies, and nothing throws.
3. **First reading after install** (no previous distance): the distance rule does not fire.
4. **A node that was retired:** it never gets a silent alert, and its telemetry is still 404, as now.
5. **Coordinates in a reading** (the gateway may send `lat`/`lng`): the stored `reading` JSON and every notification text hold no coordinate.

---

### Task 1: Rule evaluation (CTIP-38)

**Files:**
- Create: `services/api/src/alertRules.js`
- Test: `services/api/test/alert-rules.test.js`

**Interfaces:**
- Produces:
  - `RULE_DEFAULTS = { motion: 1, silent_minutes: 15 }`
  - `evaluateReadings({ thresholds, readings, previousDistance, openTypes }) -> NewAlert[]`, where `readings` is sorted by `ts`, `previousDistance` is a number or null, `openTypes` is a `Set` of alert types already open for the node, and `NewAlert = { type, severity, reading: { message, value, limit, ts } }`. At most one per type; never a type in `openTypes`.
  - `alertMessage(type, value, limit) -> string`

- [ ] **Step 1: Write the failing tests**

```js
test('motion raises one high alert even with no thresholds set', () => {
  const out = evaluateReadings({ thresholds: null, readings: [r({ motion_detected: true })], previousDistance: null, openTypes: new Set() });
  assert.deepEqual(out.map((a) => [a.type, a.severity]), [['motion', 'high']]);
});
test('motion can be switched off with motion: 0', ...);
test('100 dry readings make exactly one soil_dry alert, from the first', ...);   // moisture_min 20, soil_moisture 10..; reading.ts equals the first ts
test('distance change uses the previous reading and does not fire on the first ever', ...); // previousDistance null -> []; 45 then 10 with distance_change_cm 20 -> one
test('no alert of a type that is already open for the node', ...);          // openTypes has 'motion' -> []
test('temperature above max and below min both give temperature alerts', ...);
test('a stored alert never holds a coordinate', () => {
  const [a] = evaluateReadings({ thresholds: {}, readings: [r({ motion_detected: true, lat: 3.81, lng: 113.78 })], previousDistance: null, openTypes: new Set() });
  assert.ok(!JSON.stringify(a).includes('3.81') && !JSON.stringify(a).includes('113.78'));
});
```

- [ ] **Step 2: Run to check they fail**

Run: `npm --prefix services/api test`
Expected: FAIL, `alertRules.js` not found.

- [ ] **Step 3: Implement `alertRules.js`** from the rule table. Read only the named reading fields, never spread the reading, so a coordinate can't be copied into an alert.

- [ ] **Step 4: Run to check they pass**

Run: `npm --prefix services/api test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/alertRules.js services/api/test/alert-rules.test.js
git commit -m "CTIP-38: alert rules for sensor readings"
```

---

### Task 2: Raise alerts when telemetry arrives (CTIP-38, CTIP-76 back online, CTIP-77 push)

**Files:**
- Modify: `services/api/src/sensors.js` (`ingestTelemetry` at about lines 57-71; `uploadNodeImage` links a motion photo)
- Modify: `services/api/src/pushNotifications.js` (add `sendPushToStaff`)
- Create: `supabase/migrations/20261116000000_alert_notification_text.sql`
- Modify: `packages/api-contract/openapi.yaml` (the `/telemetry` description; the threshold keys and alert types)
- Test: `services/api/test/sensors.test.js`

**Interfaces:**
- Consumes: `evaluateReadings`, `RULE_DEFAULTS` (Task 1).
- Produces:
  - `sendPushToStaff({ title, body, data }) -> Promise<void>`: sends to every active officer's and admin's push tokens, read with the service client (`get_user_push_tokens` needs a signed-in user, so it can't be used here). Never throws.
  - Alert rows as in the Global Constraints. Task 3 relies on the `node_silent` type name.

Steps inside `ingestTelemetry`, after the readings are stored:
1. Load the node's `thresholds` and `status`, its latest earlier `distance_cm` (the newest telemetry row before the batch with a non-null `distance_cm`), and the types of its `open` or `acknowledged` alerts.
2. `evaluateReadings(...)`, then insert the alerts with `node_id`.
3. If the node was `offline`, set it to `active`.
4. Push once per new alert: title `"Sensor alert: <type>"`, body `reading.message`, data `{ alertId, type: 'alert' }`, channel `alerts`.

The photo upload sets `alert_id` to the node's newest open `motion` alert made in the last 2 minutes, if there is one.

The migration changes `notify_on_alert_created()` so the notification body is `coalesce(new.reading->>'message', new.type)`. Today it is `new.outcome`, which is always empty on a new alert. It is safe to run twice (`create or replace`).

- [ ] **Step 1: Write the failing tests** in `sensors.test.js`. Extend `fakeSupabase` with `alerts` and `profiles` tables and `user_push_tokens`, and stub the Expo push URL in the same fake fetch:
  - `test('a motion reading stores the reading and opens one motion alert', ...)`: 202, `db.alerts.length === 1`, `type === 'motion'`.
  - `test('a second motion batch while the first alert is open makes no new alert', ...)`
  - `test('an offline node is set back to active by its next readings', ...)`
  - `test('telemetry still answers 202 when inserting the alert fails', ...)`: make the alerts POST answer 500.
  - `test('a motion photo uploaded within 2 minutes is linked to the open motion alert', ...)`
  - `test('the push for an alert holds no coordinates', ...)`: send a reading with `lat`/`lng`; the captured push body contains neither number.

- [ ] **Step 2: Run to check they fail**

Run: `npm --prefix services/api test`
Expected: the new tests FAIL; the six existing sensor tests still pass.

- [ ] **Step 3: Implement** the ingest steps, `sendPushToStaff`, the photo link, the migration and the contract text.

- [ ] **Step 4: Run to check they pass**

Run: `npm --prefix services/api test`
Expected: PASS, including `contract.test.js`.

- [ ] **Step 5: Apply the migration to the hosted project** (`npx supabase db push`, by someone with access). Then commit and push after the contract review.

```bash
git add services/api/src supabase/migrations/20261116000000_alert_notification_text.sql packages/api-contract/openapi.yaml services/api/test/sensors.test.js
git commit -m "CTIP-38, CTIP-77: raise alerts from readings and push them to officers"
git push origin main
```

---

### Task 3: Silent node alerts (CTIP-76)

**Files:**
- Create: `supabase/migrations/20261116000100_silent_node_alerts.sql`
- Modify: `services/api/src/sensors.js` (call the check after ingest, at most once a minute)
- Modify: `services/api/src/staff.js` (`'get /alerts'` at about line 619 calls the same throttled check before reading)
- Test: `services/api/test/sensors.test.js`

**Interfaces:**
- Consumes: alert type `node_silent` and the `RULE_DEFAULTS.silent_minutes` value 15 (Task 1).
- Produces, in SQL: `public.raise_silent_node_alerts() returns integer`, the number of alerts made. `security definer`, `set search_path = ''`; execute granted only to `service_role` and `authenticated`. It:
  - takes nodes with `status in ('active', 'offline')` and `last_seen < now() - make_interval(mins => coalesce((thresholds->>'silent_minutes')::int, 15))`, with no `open` or `acknowledged` `node_silent` alert;
  - inserts one `node_silent` alert per node (severity `high`, `reading = jsonb_build_object('message', 'No readings for N minutes', 'value', minutes since last_seen, 'limit', silent_minutes, 'ts', now())`);
  - sets those nodes to `offline`.
- Produces, in JS: `runSilentCheckSoon(db, now = Date.now()) -> Promise<void>`, exported from `sensors.js`. It calls the RPC at most once per 60 s per process and never throws.

The migration schedules `raise-silent-node-alerts` every 5 minutes when `pg_cron` is on. Use the same `do $$ … if exists (… 'pg_cron') …` block as `20261105120000_user_soft_delete.sql`.

- [ ] **Step 1: Write the failing JS tests:**
  - `test('telemetry runs the silent check at most once a minute', ...)`: two ingests 10 s apart make one `rpc/raise_silent_node_alerts` call; a third, 61 s later, makes a second.
  - `test('a failing silent check does not fail telemetry', ...)`: the RPC answers 500, telemetry still 202.

- [ ] **Step 2: Run to check they fail**

Run: `npm --prefix services/api test`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement** the migration, `runSilentCheckSoon`, and both call sites.

- [ ] **Step 4: Run to check they pass**

Run: `npm --prefix services/api test`
Expected: PASS.

- [ ] **Step 5: Check the SQL on the local stack**

```bash
npx supabase start
npx supabase db reset
```

Then in `psql` or Studio:
1. Insert an active node with `last_seen = now() - interval '20 minutes'` and one with `last_seen = now()`. Also insert a retired node with an old `last_seen`.
2. Run `select public.raise_silent_node_alerts();`. Expected: `1`. The stale node is `offline`, with one `node_silent` alert. The retired node has none.
3. Run it again. Expected: `0`, because one is already open.

- [ ] **Step 6: Apply the migration to the hosted project, switch on `pg_cron`** if the team agrees (Database → Extensions; then re-run the migration's schedule block), commit and push.

```bash
git add supabase/migrations/20261116000100_silent_node_alerts.sql services/api/src services/api/test/sensors.test.js
git commit -m "CTIP-76: alert when a sensor node goes silent"
git push origin main
```

---

### Task 4: End-to-end check and Jira

- [ ] **Step 1: Live check with the gateway** (Norman's node or `mosquitto_pub` to the gateway):
  - Send a motion reading: the web Monitoring page shows the node as Alert, the bell shows "New alert: motion" with the message, and a phone signed in as an officer gets the push.
  - Send nothing for `silent_minutes`: a `node_silent` alert appears (within 5 minutes with `pg_cron`, otherwise on the next telemetry or alerts page load).
  - Send readings again: the node shows Online.

- [ ] **Step 2:** comment the evidence (screenshots in `docs/testing/ioT/<date>/`) on CTIP-38, CTIP-76 and CTIP-77, and move them to In Review. Routing per node or severity stays open in CTIP-48.
