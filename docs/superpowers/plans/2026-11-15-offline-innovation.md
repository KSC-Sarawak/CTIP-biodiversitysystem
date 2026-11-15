# Innovation: Offline Workflow and Quick Survey Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver CTIP-51. The phone measures time per record (CTIP-146). A quick survey mode lets a botanist record a whole plot with kept tags and carried-over fields (CTIP-147). A write-up and field evaluation compare paper, single app records and survey mode (CTIP-145, CTIP-148).

**Architecture:** Pure logic goes in `apps/shared/offline/` (tested with `node --test`); storage goes in the encrypted phone database through new local schema versions. The mobile screens only wire the two together. Timings and survey sessions never leave the phone. The one server change lets a botanist keep up to 20 tags in a single request.

**Tech Stack:** Expo React Native (`apps/mobile`), `expo-sqlite` with SQLCipher (`apps/mobile/offline/localDb.js`), shared JS (`apps/shared`), Express + Zod (`services/api`), OpenAPI, `node:test` + supertest.

**Spec:** Jira CTIP-51, CTIP-145, CTIP-146, CTIP-147, CTIP-148 (acceptance criteria are the requirements). Project brief, "[Optional] Additional Innovation" (identify limits, propose and build an improved workflow, show the improvement, evaluate it).

## Global Constraints

- Read the Expo v57 docs before writing mobile code (`apps/mobile/AGENTS.md`).
- A timing row holds only: id, user id, survey id, start, end, duration, offline (0/1), photo count, GPS fix (0/1). **Never** coordinates, tag id, species, notes or photos.
- Timings and survey sessions are stored only on the phone and are never sent to the API. `survey_id` on an outbox record is local only.
- `ABANDONED_MS = 4 * 60 * 60 * 1000`: longer timings are kept but left out of the summary.
- `SURVEY_TAG_DEFAULT = 10`, `SURVEY_TAG_MAX = 20`. On the server a botanist may hold at most `KEPT_TAG_LIMIT = SURVEY_TAG_MAX + RESERVED_KEEP` (23) unused kept tags.
- Carried to the next plant in a survey: the survey id, and the proposed species only when "Same species as last plant" is on (off by default). **Never** carried: photos, GPS, height, morphology, notes.
- Rows and sessions belong to the signed-in botanist. Another botanist on the same phone sees none of them.
- The API contract changes first and needs a second person's review.
- Commit straight to `main`. Commit messages carry no Claude author or session lines.

## Review Focus

1. **Starting a survey with no connection:** the screen says "Starting a survey needs a connection to keep tags", and no session is saved. If fewer tags arrive than asked for, the session starts with what arrived and says how many.
2. **Running out of kept tags mid-survey, offline:** "Next plant" is replaced by "No kept tags left. Scan a printed tag or end the survey." No crash and no empty tag id.
3. **App killed mid-survey:** on reopening, the session is still active and the next tag is the first one no record has taken (the session is in SQLite, not React state).
4. **Ending a survey offline:** the session ends at once. Extra kept tags (beyond `RESERVED_KEEP`) are released at the next connection, and none is released while a record on the phone still holds it.
5. **A record resumed from a crash draft:** its timing starts when the draft was first opened, not when it was resumed.

---

### Task 1: Timing logic and storage schema (CTIP-146)

**Files:**
- Modify: `apps/shared/offline/schema.js` (add migration `version: 6`)
- Create: `apps/shared/offline/captureTimings.js`
- Test: `apps/shared/test/capture-timings.test.js`, `apps/shared/test/offline-schema.test.js`

**Interfaces:**
- Produces, from `captureTimings.js`:
  - `ABANDONED_MS`
  - `firstStart(draft, nowIso) -> string`: the draft's `started_at` if it is a valid date, else `nowIso`.
  - `timingRow({ id, userId, surveyId = null, startedAt, savedAt, offline, photos, located }) -> row | null`: a row with `duration_ms`, or null when a date is invalid or `savedAt < startedAt`.
  - `summarizeTimings(rows) -> { count, counted, medianMs, p90Ms }`: `counted` leaves out rows over `ABANDONED_MS`; median and p90 are null when `counted` is 0; p90 uses the nearest rank.
  - `timingsCsv(rows) -> string`: header `started_at,saved_at,duration_s,offline,photos,located,survey_id`, with `duration_s` to one decimal, through `toCsv` from `apps/shared/utils.js`.
- Schema v6: `capture_timings (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, survey_id TEXT, started_at TEXT NOT NULL, saved_at TEXT NOT NULL, duration_ms INTEGER NOT NULL, offline INTEGER NOT NULL, photos INTEGER NOT NULL, located INTEGER NOT NULL)`, plus an index on `(user_id, saved_at)`.

- [ ] **Step 1: Write the failing tests**

```js
test("firstStart keeps a resumed draft's start", () => {
  assert.equal(firstStart({ started_at: "2026-11-16T01:00:00.000Z" }, "2026-11-16T02:00:00.000Z"), "2026-11-16T01:00:00.000Z");
  assert.equal(firstStart({}, "2026-11-16T02:00:00.000Z"), "2026-11-16T02:00:00.000Z");
});
test("timingRow measures start to save, and refuses a save before the start", () => {
  const row = timingRow({ id: "a", userId: "u", startedAt: "2026-11-16T01:00:00Z", savedAt: "2026-11-16T01:02:30Z", offline: true, photos: 2, located: true });
  assert.equal(row.duration_ms, 150000);
  assert.equal(row.offline, 1);
  assert.equal(timingRow({ id: "b", userId: "u", startedAt: "2026-11-16T01:00:00Z", savedAt: "2026-11-16T00:59:00Z" }), null);
});
test("a timing row never holds a location, tag, species or notes", () => {
  const row = timingRow({ id: "a", userId: "u", startedAt: "2026-11-16T01:00:00Z", savedAt: "2026-11-16T01:01:00Z", offline: false, photos: 1, located: true, lat: 3.8, qr_id: "NIAH-1", proposed_species: "X" });
  assert.deepEqual(Object.keys(row).sort(), ["duration_ms", "id", "located", "offline", "photos", "saved_at", "started_at", "survey_id", "user_id"]);
});
test("summary leaves out forms open over 4 hours; median and p90 by nearest rank", ...); // durations 60s,120s,180s,5h -> count 4, counted 3, median 120000, p90 180000
test("timingsCsv has the agreed columns", ...);  // first line equals the header above
```

In `offline-schema.test.js`: `test("capture_timings exists after migrate, keyed by user and saved_at", ...)`, in the same style as the reserved_tags test.

- [ ] **Step 2: Run to check they fail**

Run: `cd apps/shared && node --test`
Expected: FAIL, `captureTimings.js` not found, and `capture_timings` does not exist.

- [ ] **Step 3: Implement** `captureTimings.js` and schema v6. Build each row from the named fields only, so unknown inputs such as `lat` or `qr_id` can never be copied in.

- [ ] **Step 4: Run to check they pass**

Run: `cd apps/shared && node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/shared/offline/schema.js apps/shared/offline/captureTimings.js apps/shared/test/capture-timings.test.js apps/shared/test/offline-schema.test.js
git commit -m "CTIP-146: time per record logic and local table"
```

---

### Task 2: Time per record on the phone (CTIP-146)

**Files:**
- Create: `apps/mobile/offline/timingStore.js`
- Modify: `apps/mobile/draftStore.js:41-52` (`saveDraft` keeps `started_at`)
- Modify: `apps/mobile/pages/AddPlant.js` (start time at about line 466 when the draft loads; a row after a successful `addPlant` at about line 634)
- Modify: `apps/mobile/pages/Account.js` (a new `FieldTimingsSection`, shown to botanists, after `DetailsSection`)

**Interfaces:**
- Consumes: `firstStart`, `timingRow`, `summarizeTimings`, `timingsCsv` (Task 1).
- Produces, from `timingStore.js`:
  - `recordTiming(row) -> Promise<void>`: inserts the row; never throws to the caller (logs instead).
  - `listTimings(userId) -> Promise<row[]>`, ordered by `saved_at`.
  - `clearTimings(userId) -> Promise<number>`.
  - Task 5 calls `listTimings` for the session summary.

- [ ] **Step 1: Implement `timingStore.js`** on `getLocalDb()`, following `outboxStore.js`. If the database is unavailable, `recordTiming` gives up quietly: a lost timing must never block saving a plant.

- [ ] **Step 2: Keep the start time with the draft.** `saveDraft` adds `started_at` to its payload. AddPlant sets it once with `firstStart(existingDraft, new Date().toISOString())` when the form opens, and never resets it while editing.

- [ ] **Step 3: Record a row after a successful save,** using `offline: !!res.queued`, `photos: photos.length`, `located: hasFix(gps)`, and `surveyId` from the route params (`params.survey ?? null`; Task 5 sets it). Do this before `clearDraft(qr)`, so the start time is still known.

- [ ] **Step 4: Add the Account section "Field test timings":**
  - It shows "N records timed, median M:SS" (from `summarizeTimings`; "No records timed yet" when `counted` is 0).
  - **Export CSV** writes `timingsCsv(rows)` to a cache file and opens the share sheet (same calls as `apps/mobile/pages/Dashboard.js:488-503`).
  - **Clear** asks "Delete all N timings on this phone?" and then calls `clearTimings`.

- [ ] **Step 5: Run the tests**

Run: `cd apps/shared && node --test && cd ../mobile && npm test`
Expected: PASS.

- [ ] **Step 6: Check on a phone in airplane mode:** record 2 plants, then on the Account page "2 records timed". Export the CSV: it has 2 rows and no coordinates. Kill the app halfway through a third record, reopen it, finish it: its duration includes the time before the kill.

- [ ] **Step 7: Commit, push, and move CTIP-146 to In Review**

```bash
git add apps/mobile
git commit -m "CTIP-146: measure time per record on the phone, export from Account"
git push origin main
```

---

### Task 3: Server lets a botanist keep up to 20 tags at once (CTIP-147)

**Files:**
- Modify: `services/api/src/staff.js` (the `'post /qr-tags/batch'` handler at about lines 554-565)
- Modify: `packages/api-contract/openapi.yaml` (the `/qr-tags/batch` description and its 403 response, at about line 824)
- Test: `services/api/test/field-and-staff.test.js` (beside "an officer cannot make a batch labelled reserved", about line 431)

**Interfaces:**
- Produces: `POST /v1/qr-tags/batch { count: 1..20, batch_label: "reserved" }` as a botanist answers 201 with `count` rows. Task 4 calls it once with the number missing.

Rules (in this order):
1. A botanist with any label other than `"reserved"` and `count !== 1`: 403, unchanged.
2. A botanist with `"reserved"` and `count > 20`: 403 `FORBIDDEN`, "You can keep at most 20 tags at a time."
3. A botanist who already holds unused kept tags (`batch_label = 'reserved'`, `created_by = me`, `status = 'unassigned'`), when that number plus `count` is over 23: 403 `TOO_MANY_KEPT_TAGS`, "Release some kept tags first."
4. Officer or admin with `"reserved"`: 403, unchanged.

These answer 403, as the handler already does for role limits (CTIP-147 says the same).

- [ ] **Step 1: Write the failing tests**
  - `test('botanist keeps 20 tags in one request for a survey', ...)`: 201, 20 rows, all `batch_label: 'reserved'`.
  - `test('botanist asking for 21 kept tags gets 403', ...)`
  - `test('botanist ordinary batch is still one at a time', ...)`: count 2 without `reserved`, 403.
  - `test('botanist holding 20 unused kept tags cannot keep 4 more', ...)`: seed 20 rows with the existing helper (about line 406), ask for 4, 403 `TOO_MANY_KEPT_TAGS`; asking for 3 gives 201.

- [ ] **Step 2: Run to check they fail**

Run: `npm --prefix services/api test`
Expected: the 20-tag and holding-limit tests FAIL.

- [ ] **Step 3: Implement the rules** in the handler and the contract text. Count existing kept tags through `supabaseAs(req.user)`, so RLS still applies.

- [ ] **Step 4: Run to check they pass**

Run: `npm --prefix services/api test`
Expected: PASS, including `contract.test.js`.

- [ ] **Step 5: Commit and push** after the second person's contract review

```bash
git add services/api/src/staff.js packages/api-contract/openapi.yaml services/api/test/field-and-staff.test.js
git commit -m "CTIP-147: botanists can keep up to 20 tags for a survey"
git push origin main
```

---

### Task 4: Survey logic, schema and tag keeping (CTIP-147)

**Files:**
- Modify: `apps/shared/offline/schema.js` (migration `version: 7`)
- Create: `apps/shared/offline/survey.js`
- Modify: `apps/shared/offline/records.js:74` (`newPlantRecord` takes an optional `survey_id` and stores it on the record)
- Modify: `apps/shared/offline/useReservedTags.js` (`keep` comes from the active survey; one request for all the missing tags)
- Test: `apps/shared/test/survey.test.js`, `apps/shared/test/offline-sync.test.js`, `apps/shared/test/offline-schema.test.js`

**Interfaces:**
- Consumes: `RESERVED_KEEP`, `nextReservedTag` (`tags.js`), `reservedToCreate(..., { keep })` (`tags.js`), `createTagBatchApi(count, label)` (`api.js`), the 20-tag rule (Task 3).
- Produces, from `survey.js`:
  - `SURVEY_TAG_DEFAULT`, `SURVEY_TAG_MAX`
  - `checkSurveyStart({ name, tagTarget }) -> { ok: true } | { ok: false, message }`: name trimmed, 1 to 60 characters; `tagTarget` a whole number from 1 to 20.
  - `carryOver(lastRecord, { sameSpecies }) -> { survey_id, proposed_species? }`: only those keys.
  - `keepTarget(activeSurvey) -> number`: `max(RESERVED_KEEP, activeSurvey.tag_target)`, or `RESERVED_KEEP` when there is no active survey.
  - `extraKeptTags(keptIds, usedOnPhone, keep = RESERVED_KEEP) -> string[]`: the free kept ids beyond the first `keep`, to release.
  - `sessionSummary({ sessionId, timings, outboxItems, keptIds, usedOnPhone }) -> { recorded, onPhone, sent, tagsLeft }`, where `recorded` counts timing rows with this `survey_id`, `onPhone` counts outbox records with it, `sent = recorded - onPhone`, and `tagsLeft` counts free kept tags.
- Schema v7: `survey_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, tag_target INTEGER NOT NULL, started_at TEXT NOT NULL, ended_at TEXT)`, plus an index on `(user_id, ended_at)`.
- `useReservedTags` gains a `keep` argument (default `RESERVED_KEEP`), passed to `reservedToCreate`. Its loop becomes one `createTagBatchApi(min(count, SURVEY_TAG_MAX), RESERVED_LABEL)` call. It also returns `releaseKept(ids) -> Promise<{ released, failed }>`, which reuses the `deleteTagApi` loop from `setKeepOffline`.

- [ ] **Step 1: Write the failing tests** (`survey.test.js` unless noted):
  - `carryOver never carries photos, GPS, height, morphology or notes`: give a full last record; the result's keys are exactly `["survey_id"]`, or `["proposed_species", "survey_id"]` with `sameSpecies: true`.
  - `checkSurveyStart refuses an empty name, 0 tags and 21 tags`.
  - `keepTarget is 3 with no survey and the target during one`: `{ tag_target: 10 }` gives 10, and `{ tag_target: 2 }` gives 3.
  - `extraKeptTags keeps the first 3 free tags and never returns one a record holds`.
  - `sessionSummary counts recorded, on the phone, sent and tags left`.
  - In `offline-sync.test.js`: `a survey_id on a record is never sent to the API`. Run a new-plant record with `survey_id: "s1"` through the engine with the existing fake API, and assert that no request body contains `survey_id`.
  - In `offline-schema.test.js`: `survey_sessions exists after migrate`.

- [ ] **Step 2: Run to check they fail**

Run: `cd apps/shared && node --test`
Expected: FAIL, `survey.js` not found.

- [ ] **Step 3: Implement** `survey.js`, schema v7, `survey_id` in `newPlantRecord`, and the `useReservedTags` changes. The sync engine already builds bodies with `pick(...)` from fixed field lists, so `survey_id` needs no change there; the test proves it.

- [ ] **Step 4: Run to check they pass**

Run: `cd apps/shared && node --test`
Expected: PASS, including the existing reserved-tag and top-up tests.

- [ ] **Step 5: Commit**

```bash
git add apps/shared
git commit -m "CTIP-147: survey session logic, local table and keeping tags for a survey"
```

---

### Task 5: Quick survey mode screens (CTIP-147)

**Files:**
- Create: `apps/mobile/offline/surveyStore.js`
- Create: `apps/mobile/pages/Survey.js`
- Modify: `apps/mobile/navigation/routeMeta.js` (route `survey`, botanist only, tab `add`), `apps/mobile/navigation/routes.js`
- Modify: `apps/shared/StoreProvider.js` (load the active survey; pass `keepTarget(activeSurvey)` to `useReservedTags`; expose `activeSurvey`, `startSurvey`, `endSurvey`)
- Modify: `apps/mobile/pages/AddPlant.js` (`Submitted` at about line 728: "Next plant" during a survey; AddPlant reads `params.survey` and `params.carry`)
- Test: `apps/mobile/tests/survey-route.test.mjs`

**Interfaces:**
- Consumes: everything from Task 4, and `listTimings` (Task 2).
- Produces, from `surveyStore.js`:
  - `startSurvey({ userId, name, tagTarget }) -> Promise<session>`
  - `activeSurvey(userId) -> Promise<session | null>`
  - `endSurvey(id) -> Promise<void>`

Flow:
- **Start** (on the Survey screen, online only): `checkSurveyStart`; save the session; the top-up keeps tags up to `keepTarget`; show "Kept N of M tags". If no tags came, say so and end the session again.
- **Add plant during a survey:** the form opens with `nextReservedTag(keptIds, usedOnPhone)` filled in, and `carry` applied. A "Same species as last plant" switch is shown, off by default.
- **Submitted during a survey:** **Next plant** (or the no-tags-left message from Review Focus 2), the session summary from `sessionSummary`, and **End survey**.
- **End:** `endSurvey`, then `releaseKept(extraKeptTags(...))` when online. When offline, the release runs on the next connection, because `keep` falls back to 3 and the release check runs after the top-up.

- [ ] **Step 1: Write the failing route test**

```js
test('only botanists can open the survey screen', () => {
  assert.ok(ROUTE_NAMES.includes('survey'));
  assert.equal(canAccess('botanist', 'survey'), true);
  for (const role of ['officer', 'admin', 'visitor']) assert.equal(canAccess(role, 'survey'), false);
});
```

- [ ] **Step 2: Run to check it fails**

Run: `npm --prefix apps/mobile test`
Expected: FAIL, the `survey` route does not exist.

- [ ] **Step 3: Implement** the store, the screen, the routes, the provider wiring and the AddPlant and Submitted changes.

- [ ] **Step 4: Run all tests**

Run: `cd apps/shared && node --test && cd ../mobile && npm test && cd ../../services/api && npm test`
Expected: PASS.

- [ ] **Step 5: Check on a phone,** following Review Focus 1 to 4:
  - Start a survey of 5 tags online, then go to airplane mode and record 5 plants with "Next plant".
  - Check the 6th "Next plant" shows the no-tags-left message.
  - Kill and reopen the app mid-survey.
  - End the survey offline, reconnect, and see the extra tags released.
  - Check the timing export has 5 rows with the survey id.

- [ ] **Step 6: Commit, push, and move CTIP-147 to In Review**

```bash
git add apps/mobile apps/shared/StoreProvider.js
git commit -m "CTIP-147: quick survey mode on the phone"
git push origin main
```

---

### Task 6: Write-up and evaluation method (CTIP-145, CTIP-148)

**Files:**
- Create: `docs/innovation/ground-truthing-workflow.md`
- Create: `docs/testing/innovation/README.md` (evidence naming: `<method A|B|C>-<n>-<what>`, one dated folder per run)

- [ ] **Step 1: Write the document with these sections:**
  1. **Limits of the current practice:** handwritten records, physical tags, typing the data in later, the same data entered twice, lost or damaged sheets, no signal in the forest (problem statement 1 of the brief).
  2. **Before and after:** a Mermaid flowchart for each workflow.
  3. **How each limit is answered:** a table mapping each limit to what answers it: kept tags (CTIP-116), save-first encrypted records (CTIP-44, CTIP-83), sync with no duplicates or losses (CTIP-16, CTIP-66, CTIP-67), offline species search (CTIP-84), quick survey mode (CTIP-147). Link to `docs/architecture/offline-sync.md` rather than repeating it.
  4. **Our known limits:** sign-in and starting a survey need a connection; GPS under thick canopy; a phone lost before sync loses its unsent records.
  5. **Evaluation method:** methods A (paper and printed tag, typed in later), B (app, single records, airplane mode) and C (app, survey mode, airplane mode), on the same 10 plants with the same botanists. Metrics: time per plant (field plus office); errors against a reference sheet (wrong tag, missing field, location more than 20 m out); lost or duplicated records after sync. App times come from the timing CSV, paper times from a stopwatch. Proposed pass mark, **to confirm with the team before the test:** C's median total time per plant is at least 30% lower than A's, with no lost or duplicated records.
  6. **Results:** an empty table, one row per method.
  7. **Discussion:** left to fill after the test.

- [ ] **Step 2: Commit and push**

```bash
git add docs/innovation docs/testing/innovation
git commit -m "CTIP-145, CTIP-148: innovation write-up and field evaluation method"
git push origin main
```

- [ ] **Step 3 (people):** the team agrees the write-up and the pass mark (a comment on CTIP-145). Run methods A to C, save evidence under `docs/testing/innovation/<date>/`, fill in Results and Discussion, cite `docs/testing/offline-mode-test.md` cases 2 and 3, and close CTIP-145, CTIP-148 and then CTIP-51.
