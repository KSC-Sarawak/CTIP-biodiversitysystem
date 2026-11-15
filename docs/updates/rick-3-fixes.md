# Branch `rick-3-fixes`: Monitoring rework, stable-range alerts, and easier-to-read pages

*Written 16 Nov 2026. Covers everything on this branch compared with `main` (`34d1519`):
one commit, `c94a0fd` (personal node names and stable-range alerts), plus uncommitted
changes to 10 files and 3 new files. Web app, API and database. The mobile app is not changed.*

| # | What | Where | State |
|---|---|---|---|
| 1 | Officers and admins can give a sensor node their own name | Monitoring, API, DB | Committed |
| 2 | Alerts come from one fixed "stable range" per reading, checked in the database | DB, settings file, script | Committed |
| 3 | Monitoring page rebuilt: urgent things first, red parts on the charts, time slider, one Alerts section | Monitoring | Committed |
| 4 | Monitoring: the node list is now a normal table | Monitoring | Uncommitted |
| 5 | Account page redesigned: greeting, profile strength, password checks | Account | Uncommitted |
| 6 | Audit log: a coloured badge per kind, a one-line change, Expand for the full change | Admin → Audit | Uncommitted |
| 7 | Long lists show 10 rows at a time with **View more** | Species, QR tags, Dashboard | Uncommitted |
| 8 | QR tags list shows a small preview of each code | QR tags | Uncommitted |

Read [Before this goes live](#before-this-goes-live) before merging.

---

## Before this goes live

- [ ] **Database migration.** Tell Amberlyn, then dry-run and push
      `supabase/migrations/20261115000000_node_nicknames_and_stable_range_alerts.sql`:
      `npx supabase db push --remote --dry-run`, then without `--dry-run`.
      It is safe to run more than once.
- [ ] After the push, check that the tables `sensor_node_nicknames` and `sensor_stable_ranges`
      exist and that `sensor_stable_ranges` has 3 rows (temperature, humidity, soil_moisture).
- [ ] **Redeploy the Render API.** Without it, renaming a node fails, and the Monitoring page
      falls back to the ranges in the settings file (it still works, but cannot show what
      the database holds).
- [ ] **API contract changed** (`packages/api-contract/openapi.yaml`): new route
      `PUT /sensor-nodes/{id}/nickname`, two new lists in the workspace load, and the
      `thresholds` description. The contract test asks for **two approvals**.
- [ ] Commit the uncommitted changes (items 4–8) before opening the PR.

---

## 1. Personal names for sensor nodes

A node keeps its **technical name** (set by IoT management, e.g. `ESP32-NODE-07`). Each
officer or admin can now give it **their own name**, which only they see.

- On Monitoring, the pencil button on a node row, or **Rename** next to the selected node's
  title, opens a small form: *Your name for this node* (up to 60 characters),
  **Save**, **Use technical name** (only when a name is set), **Cancel**. Escape also cancels.
- Wherever the personal name is shown, the technical name is shown under it.
- The node search on the map also matches the technical name.
- **API:** `PUT /v1/sensor-nodes/:id/nickname` with `{ "nickname": "..." }`. Officer and admin
  only. An empty string or `null` removes the name. Answers `404` for an id that is not a
  UUID or not a node, `422` for over 60 characters or any extra field.
- The workspace load (`GET /v1/workspace`) now also returns `sensor_node_nicknames`: only
  the caller's own rows (RLS).
- **Database:** new table `sensor_node_nicknames` (`user_id`, `node_id`, `nickname`,
  `updated_at`, one row per person and node). RLS: you only read and write your own rows,
  and only as an officer or admin. Rows go when the user or node is deleted.

## 2. Alerts from a fixed stable range

Team decision of 15 Nov: every node uses **one preset range** per reading. A reading
outside it opens an alert, and every active officer and admin is notified.

| Reading | Stable range |
|---|---|
| Temperature | 18 to 35 °C |
| Air humidity | 40 to 100 % |
| Soil moisture | 20 to 80 % |

**Where the numbers live:** one settings file, `apps/shared/config/sensorStableRanges.json`.
To change them:

1. Edit the file (min must be below max, and within what the sensor can send).
2. Run `npm run sensor-ranges:push` (reads `SUPABASE_URL` and `SUPABASE_SECRET_KEY` from
   `services/api/.env`), **or** `npm run sensor-ranges` and paste the printed SQL into the
   Supabase SQL editor.

Open Monitoring pages pick up the new numbers on their next refresh. Change the file, not
the migration: the migration only seeds the first copy.

**How the check works** (`check_reading_stable_range`, a trigger on `telemetry`):

- Runs on every new reading, so readings from the API **and** from the gateway's direct
  Supabase mode are both checked.
- Opens an alert called e.g. *Temperature too high* or *Soil moisture too low*. The alert
  stores the value, the stable range and the node name.
- **No alert storms:** while an alert of the same type for the same node is still open or
  acknowledged, more bad readings do not open another.
- Readings older than one day (a gateway catching up) are not checked.
- Severity is **high** when the reading is outside by a quarter of the range's width or more,
  else **medium**.
- A failure in the check never stops the reading being saved.
- The alert notification now says which node and what it read
  (before, the body was the alert's outcome, which is empty for a new alert).

**Per-node limits** (`sensor_nodes.thresholds`) are **no longer used**. They stay stored,
untouched, in case the team decides on per-node ranges later. The admin-only *Alert limits*
form on Monitoring is removed.

The app reads the ranges from the new `sensor_stable_ranges` table (officers and admins can
read it, nobody can change it through the API), and falls back to the settings file if the
table could not be loaded. Shared helpers: `apps/shared/sensorLimits.js`.

## 3. Monitoring page rebuilt

`apps/web/src/pages/SensorOverview.jsx`, `apps/web/src/components/SensorParts.jsx`

Laid out so the most urgent thing is read first:

1. **Header:** one sentence on what needs doing and four numbers. *Outside alert limits* is
   now *Outside stable range*. The live line says how long ago the newest reading came
   ("12 min ago") and how many readings arrived in the last 24 h.
2. **Sensor nodes:** the map, then every node. Nodes with an alert come first, then offline
   ones, then the rest by name. Clicking anywhere on a node's row selects it.
3. **Selected node:** status and **Rename** by the title; a compact *Latest reading* strip
   with each value and its range (marked *Above range* / *Below range* when off); the charts;
   the webcam photos beside them.
4. **Alerts:** one section with tabs **Open / Acknowledged / Resolved / All**, each with a
   count. Opens on **Open**. The *Alert rules* (the three ranges) are listed underneath for
   reference.

**Charts:**

- Dashed lines at the range's min and max, with a faint red band outside it.
- The parts of the line **outside the range are drawn in red**, so a breach stands out
  without reading numbers. The hover value also turns red and says *outside range*.
- Each chart shows the latest value, how many readings are outside the range, and
  min · avg · max.
- A key above the charts explains the three line styles.

**Time range:**

- Moved **under** the charts it changes.
- New **slider** from 1 hour to 30 days (1, 2, 3, 6, 12, 24 h, 2, 3, 5, 7, 14, 21, 30 days). It
  applies once you stop dragging, so dragging does not call the API at every stop.
- Up to 24 hours uses the live data already loaded: no API call.
- The 24 h / 7 days / 30 days / Choose dates buttons are still there.

**Alert cards:** the next step (assign, acknowledge) stays visible; notes and resolving are
folded under **Notes and resolve** until needed. Cards show the reading and the stable range.

## 4. Monitoring: node list as a table *(uncommitted)*

The node cards are replaced by a standard table: **Node, Status, Temp, Humidity, Soil,
Distance, Motion, Updated**, and a rename button. Values outside the range are red. The open
alert link sits under the status. The selected row is highlighted, and the whole row is
still clickable. The page no longer uses the `plain` shell, so it matches the other pages.

## 5. Account page redesign *(uncommitted)*

`apps/web/src/pages/Account.jsx`

- A **hero** like the Discussion and Contact pages: *Good morning / afternoon / evening,
  \<first name\>*, chips for role, `@username` and *Member since*, over the Niah forest
  illustration.
- **Photo** in a ring with a camera button to change it, and *Add a photo* / *Remove photo*
  under it (removing still asks first).
- **Profile strength:** a ring with a percentage from three steps (photo, username, phone).
  An unfinished step is a link that opens the file picker or jumps to that field.
- **Password:** a strength meter (*Too short, Weak, Fair, Good, Strong*) while typing, and
  *Passwords match / do not match yet* under the second box. These are guides only: the API
  still decides.
- The settings are cards with an icon in each title; *Account details* shows icons per row
  and `-` when there is no join date.
- The page now uses `Shell`, including while loading.

## 6. Audit log *(uncommitted)*

`apps/web/src/pages/Admin.jsx`

- Each entry has a **badge** with its own word, icon and colour: *Created, Edited, Deleted,
  Signed in, Sign-in failed, 2-step check failed, Signed out*. A key next to the filter
  explains them, and the filter uses the same words.
- Table names are plain words (*Plant record*, *QR tag*, *Sensor node*, ...).
- The **Change** column is a one-line summary instead of raw JSON:
  - Edits: the first two changed fields as `field: before → after`, then `+N more`.
    Fields that change on every save (`updated_at`, `version`, `last_synced_at`) are left out.
  - Created/deleted: the record's name and how many fields it has.
  - Sign-ins: the email.
- **Expand** shows every field with its value before and after. Changed fields are listed first
  and highlighted.
- Columns are now *When, Who, What, Change*. An empty filter says *No entries of this kind yet.*

## 7. Long lists: 10 at a time *(uncommitted)*

New hook `apps/web/src/useViewMore.jsx`: shows `step` rows, then *Showing X of Y*, **View N
more**, **Show all** and **Show less**.

- **Species:** 10 at a time; a new search or sort starts again at 10. New **Plants** column
  (how many plants of that species). Sorting is now case-insensitive and number-aware
  (*Species 2* before *Species 10*). An empty family shows `-`.
- **QR tags:** 10 at a time.
- **Dashboard (tagged plants):** 10 rows per page by default (was 25).
- These tables use a new `roomy` style: more padding, bigger text.

## 8. QR tags: code preview *(uncommitted)*

`apps/web/src/pages/Tags.jsx`. The tag ID cell now shows a small QR preview with the ID.
Clicking it opens the big, scannable code. The separate **QR** button is removed.

---

## Behaviour changes people may notice

- Monitoring: no *Alert limits* form for admins. Ranges are changed in the settings file.
- Monitoring: acknowledged alerts no longer appear at the top; switch the Alerts tab.
- Monitoring: notes and resolve are under **Notes and resolve** on each alert.
- Monitoring: new alerts are named *Temperature too high* etc., and a node's alert stays one
  alert while it is open, however many bad readings follow.
- QR tags: no **QR** button. Click the code preview.
- Species, QR tags, Dashboard: only 10 rows at first.

## Tests

| Suite | What changed |
|---|---|
| API (`services/api/test/field-and-staff.test.js`) | New: set and clear a node name; 60-character limit; extra fields refused; bad id 404; botanist 403. Fake Supabase knows the two new tables |
| Web Monitoring (`tests/monitoring-page.spec.js`) | New: slider (no API call up to a day), renaming and going back to the technical name, readings outside the range flagged, range read from the database copy, whole row selects a node, red chart segments, one Alerts section with tabs and rules. Selectors updated from `article.nodecard` to `tr.noderow` |
| `tests/every-page.spec.js` | Opens *Notes and resolve* before looking for Resolve |
| **New** `tests/account-page.spec.js` | Greeting, profile strength, password meter and match; QR preview opens the popup |
| **New** `tests/long-lists.spec.js` | Species View more and reset on search; tags 10 at a time with preview; audit badges, summary and Expand; Dashboard 10 rows |
| `tests/helpers/mockApi.js` | Mocks the nickname route, returns `sensor_node_nicknames`, `sensor_stable_ranges`, tags, audit logs and an optional staff species list |

The suites were **not re-run** when this note was written. Run before merging:
`npm run api:test`, `npm run web:lint`, and `npx playwright test` in `apps/web`.

Not tested yet: the stable-range trigger against real readings on Supabase, and
`npm run sensor-ranges:push` against the live project.

## Files

| File | Change |
|---|---|
| `supabase/migrations/20261115000000_node_nicknames_and_stable_range_alerts.sql` | **New.** Nickname table, stable range table, alert trigger, better alert notification |
| `apps/shared/config/sensorStableRanges.json` | **New.** The one place the ranges are set |
| `scripts/sensor-ranges.mjs` | **New.** Checks the file; prints SQL or pushes it to Supabase |
| `package.json` | `sensor-ranges` and `sensor-ranges:push` scripts |
| `apps/shared/sensorLimits.js` | **New.** Range helpers shared by the apps |
| `apps/shared/api.js`, `StoreProvider.js`, `data.js` | `setNodeNicknameApi`, `setNodeNickname`; keeps `nodeNicknames` and `stableRanges` from the workspace |
| `services/api/src/staff.js`, `permissions.js` | Nickname route; workspace returns the two new lists |
| `packages/api-contract/openapi.yaml` | Nickname route, workspace lists, `thresholds` marked unused |
| `apps/web/src/pages/SensorOverview.jsx` | Monitoring page rebuilt; node table |
| `apps/web/src/components/SensorParts.jsx` | Charts with range band and red segments; map search matches technical name |
| `apps/web/src/pages/Account.jsx` | Account page redesign |
| `apps/web/src/pages/Admin.jsx` | Audit log badges, summary, Expand |
| `apps/web/src/pages/Species.jsx`, `Tags.jsx`, `Dashboard.jsx` | View more, Plants column, QR preview, 10 rows |
| `apps/web/src/useViewMore.jsx` | **New.** The View more hook |
| `apps/web/src/App.css` | Styles for all of the above |
| `apps/web/src/components/Bits.jsx` | Trailing newline only |
| `services/api/test/field-and-staff.test.js`, `apps/web/tests/*` | Tests listed above |
