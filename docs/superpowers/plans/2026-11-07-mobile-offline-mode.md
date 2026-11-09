# Mobile Offline Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A botanist can record plants in airplane mode (QR bind, photos, GPS, species search, submit), and every record reaches the API once, and only once, when the phone is back online. No field record is ever silently lost or duplicated.

**Architecture:** Every submit is saved first in an outbox inside the phone's encrypted SQLite file. A sync engine then replays the outbox against the API in a fixed order: specimen, then observation (through the new `POST /sync`), then photos, then submit. Each step uses an ID made on the phone, so the API stores a resent step once. The engine and the other offline rules are plain JavaScript in `apps/shared/offline/`, with no React Native imports, so `node --test` covers them in CI. The SQLite adapters and the triggers specific to React Native live in `apps/mobile/offline/`.

**Tech Stack:** Expo (the version in `apps/mobile/package.json` is `expo ^58`; CLAUDE.md still says SDK 57), `expo-sqlite` with SQLCipher (already set up), `expo-network` and `expo-file-system` (new; install with `npx expo install`), Express 5 + Zod, `node --test`.

**Spec:** Jira CTIP-44, CTIP-83, CTIP-84, CTIP-16, CTIP-66, CTIP-67, CTIP-68, CTIP-116 (acceptance criteria copied into the coverage table at the end); `final-stretch-sprint.md` ("Mobile offline mode", the CTIP-74 reassessment checklist); `CLAUDE.md` (Connectivity; Security requirements); `DESIGN.md`. Task 1 turns the Design section below into `docs/architecture/offline-sync.md`, the short plan the sprint asks for before any code.

## Global Constraints

- Do not start Task 2 until the online flow works end to end (CLAUDE.md, Connectivity). Task 1 (the design doc) may start now.
- Plain JavaScript only, no TypeScript. Files in `apps/shared/` have no JSX and no React Native imports.
- Every colour, size and duration comes from `apps/shared/tokens.js`. No hex values in pages. Scientific names in `Sci`, tag IDs in `Mono`, statuses through `DotLabel`/`Chip` with `STATUS_TEXT` wording. One primary button per screen. No emoji. Sentence case.
- Commit messages start with the story key: `CTIP-44: …`. Pushing straight to `main` is allowed until Thu 19 Nov; run the checks first.
- Checks before every commit: `npm run api:test`, `node --test` in `apps/shared`, `npm run lint` and `npm run build` in `apps/web`. Before a mobile commit, also run `cd apps/mobile && npx expo export --platform android --output-dir <tmp folder>`, then delete the folder.
- Changes to `packages/api-contract/` need a second person's review. Every route in `services/api/src/permissions.js` stays in the contract (`contract.test.js`).
- Migrations: new file only, safe to run twice, with a timestamp unused on the live database (`npx supabase migration list`), `npx supabase db push --dry-run` first, and tell Amberlyn before pushing.
- The apps call only the API. No Supabase client in `apps/`. No keys, Wi-Fi details or certificates in git: the repository is public.
- Unsent records live only in the encrypted SQLite file (`daun_drafts_secure.db`, key in `expo-secure-store`). Never in AsyncStorage, plain files, the gallery or memory-only fallbacks.
- Read the Expo docs for the installed SDK before using `expo-network` or `expo-file-system` (`apps/mobile/AGENTS.md`). Never run `npm audit fix --force` in `apps/mobile`.
- New native modules need a new APK: build with `npm run mobile:build:apk` and install it on the demo phones before the freeze.

## Design (copied into `docs/architecture/offline-sync.md` by Task 1)

**Save first, always.** On the phone, `addPlant` and `addRevisit` write the record and its photos to the outbox before any network call (CTIP-44). Then they start a sync and wait up to 8 s. If it finishes in time the botanist sees "Sent for review", otherwise "Saved on this phone". The web app passes no outbox and keeps today's online path.

**IDs and idempotency.** The phone makes every ID: specimen, observation and each photo (`uid()`, UUID v4). The API already answers a repeated specimen, observation or photo ID with the row it saved (`services/api/src/field.js`). `POST /sync` keeps that rule, and an edit sent again with the same content answers `updated`, not `conflict`.

**Sync order, per record, oldest record first:**
1. `specimen` (new plant only): `POST /specimens` with the phone's ID. Store the ID the API returns on the record (written back).
2. `observation`: `POST /sync`. New records are created as `queued` ("Waiting to sync"), so an officer never sees a record with photos missing. Batches hold at most 20 items and stay under 80,000 characters of JSON (the API's `express.json()` limit is 100 kB).
3. `photos`: `POST /observations/:id/photos`, one at a time, each with its own ID. Once the API confirms a photo, its base64 is deleted from the phone. After an interruption only the missing photos are sent (CTIP-66).
4. `submit`: `POST /observations/:id/submit` turns `queued` into `synced` ("Needs review"). A `WRONG_STATUS` answer while the server already holds `synced` counts as done (a resent submit).
5. **Done:** the outbox row and its photos are deleted only after step 4 is confirmed, and the workspace reloads.

**Revisits of plants made offline** point to the plant's outbox record. Before sending, the engine swaps in the specimen ID the API returned for that plant. A revisit waits while its plant is not yet past step 1.

**Errors.**
- No connection, timeout, 5xx or 429: the record stays `pending`, the run stops, and it is tried again later.
- 401: the run stops and every record stays `pending` (sign in again).
- Anything else: that record becomes `failed` with an action, and the run moves on to the next record:
  - `pick_tag`: `TAG_IN_USE`, `TAG_NOT_FOUND`, `TAG_RESERVED`.
  - `wait_review`: `REVIEW_IN_PROGRESS`.
  - `remove_photo`: 413 or 415 on a photo.
  - `retry`: anything else, shown with the API's message.

**Conflict rule (CTIP-67).** Only edits of a record the server already holds (`draft` or `queued`) can conflict. Records created offline can't, because their IDs are new. An edit is sent with `base_version` (the version the phone last saw). If the server moved on, it answers `conflict` and changes nothing. The phone then keeps both copies and asks the botanist which to keep: "Keep this phone's version" resends with the server's version, and "Keep the other version" drops the phone's copy. Either choice adds a comment to the record saying what was kept, and a toast says it too. Nothing is resolved automatically. Resubmitting a returned record stays online only and shows "Needs internet".

**Shared phones.** Outbox rows carry `user_id`. People see and send only their own. Signing out keeps unsent records (they are irreplaceable) after a warning, and they send the next time that person signs in on the phone. Drafts are still cleared on sign-out, as today.

**Tags offline.**
- The phone keeps a tag list (`tag_cache`: tag ID, status, specimen ID, whether it is my plant, plant name; no coordinates), refreshed on every workspace load.
- An unknown tag offline can still start a record. The API checks it at sync, and a clash becomes `pick_tag`.
- Reserved tags (CTIP-116): while online the phone keeps 3 tags made for this botanist (`batch_label: 'reserved'`). The API refuses them to anyone else (`409 TAG_RESERVED`), and only their owner may release them (delete).

**Species offline (CTIP-84).** Published species from `GET /public/species` (public data only), with one cover thumbnail each as a file in the app's private folder. Refreshed when online, at most once every 24 h, and whenever the connection returns. Search runs locally when the API can't be reached. Unpublished species are not offline (accepted).

**Sync triggers (CTIP-68):**
- the connection returns (`expo-network` listener),
- the app comes to the foreground,
- right after a record is saved,
- a backoff timer while anything is pending: 30 s, 1 min, 2 min, then every 5 min,
- "Sync now" in the app.

One run at a time.

**Testing.** `node --test` on the engine with an in-memory outbox and a fake server that can drop the connection before or after it stores a step. API tests for `POST /sync`. The manual airplane-mode script in Task 10, on an Android phone with the release APK.

## Review Focus

1. **Capture time survives a late sync.** A record made on Monday and synced on Wednesday must say Monday. Today `observationBody()` stamps `nowIso()` at send time. Pinned in Task 4 (`observed_at sent is the capture time`).
2. **App killed mid-sync.** Rows left in `sending` must go back to `pending` on the next start, or they never send. Pinned in Task 2 (`resetInterrupted`) and Task 4.
3. **Shared phone.** User B signing in must never list or send user A's unsent records, and A's records must still send when A returns. Pinned in Task 4 (`another user's records are neither sent nor listed`).
4. **Session ended while offline for days.** A refused refresh must keep every record `pending`, not drop or fail it. Pinned in Task 4 (`401 stops the run and leaves every record pending`).
5. **Phone storage full.** If the SQLite write fails, the botanist must not see "Saved", and the draft must stay. Pinned in Task 5 (`addPlant reports failure and keeps the draft when the outbox write fails`).

---

## File structure

| File | Job |
|---|---|
| `docs/architecture/offline-sync.md` (new) | The design above, for the team and the report (CTIP-67 asks for the conflict rule in `docs/`) |
| `apps/shared/offline/schema.js` (new) | Local SQLite migrations and `migrate(db)` (`PRAGMA user_version`) |
| `apps/shared/offline/memoryOutbox.js` (new) | In-memory outbox with the same interface as the SQLite one, for tests |
| `apps/shared/offline/syncEngine.js` (new) | The sync order, error rules, batching, single run, conflict resolution |
| `apps/shared/offline/offlineSearch.js` (new) | Search of cached species, same answer shape as `GET /public/species` |
| `apps/shared/offline/tags.js` (new) | Offline tag lookup, reserved tag rules |
| `apps/shared/test/offline-*.test.js` (new) | Tests for the four modules above |
| `apps/shared/test/helpers/fakeServer.js` (new) | Fake API for the engine tests, with switchable connection drops |
| `apps/mobile/offline/localDb.js` (new) | Opens the encrypted DB (moved out of `draftStore.js`) and runs `migrate` |
| `apps/mobile/offline/outboxStore.js` (new) | SQLite outbox |
| `apps/mobile/offline/speciesCache.js` (new) | Species and thumbnail cache |
| `apps/mobile/offline/tagCache.js` (new) | Tag list and reserved tags on the phone |
| `apps/mobile/offline/useSyncTriggers.js` (new) | Network, foreground and backoff triggers |
| `apps/mobile/components/SyncBar.js` (new) | "3 waiting to sync · Last sent 10:55 am" and "Sync now" |
| `apps/mobile/draftStore.js` | Uses `localDb.js`; behaviour unchanged |
| `apps/shared/StoreProvider.js` | `outbox` prop; save-first `addPlant`/`addRevisit`; sync state and actions |
| `apps/shared/tokens.js` | Three new statuses |
| `apps/mobile/App.js`, `pages/AddPlant.js`, `pages/Records.js`, `pages/Scan.js`, `pages/Tags.js`, `pages/Admin.js`, `components/SpeciesPicker.js`, `hooks/useSpeciesSearch.js`, `navigation/tabs.js` | UI |
| `services/api/src/sync.js` (new), `handlers.js`, `field.js`, `staff.js`, `permissions.js` | `POST /sync`; reserved tag rules |
| `packages/api-contract/openapi.yaml` | `SyncRequest` limits; tag delete roles; `TAG_RESERVED` |
| `supabase/migrations/<ts>_qr_tags_botanist_release_reserved.sql` (new) | RLS: botanists delete their own unused reserved tags |

---

### Task 1: Offline design doc (all eight stories, CTIP-67 AC 1)

**Files:** Create `docs/architecture/offline-sync.md`

- [ ] **Step 1:** Write the doc from the Design section above. Add a sequence diagram (text is fine) of one new plant through the four steps, and a table of local states (`pending`, `sending`, `failed`, `conflict`) with what the botanist sees for each (UI section of Task 7).
- [ ] **Step 2:** Post the link in the team chat and ask Nicole (security, CTIP-74) and one more person to read it. Change it only for comments they make.
- [ ] **Step 3:** Commit: `git add docs/architecture/offline-sync.md docs/superpowers/plans/2026-11-07-mobile-offline-mode.md` then `git commit -m "CTIP-16: offline sync design (order, idempotency, conflict rule, tests)"`

### Task 2: Local record store with versioned schema (CTIP-44)

**Files:**
- Create: `apps/shared/offline/schema.js`, `apps/shared/offline/memoryOutbox.js`, `apps/mobile/offline/localDb.js`, `apps/mobile/offline/outboxStore.js`
- Modify: `apps/mobile/draftStore.js` (take `getDbKey`, `moveOldDrafts` and `openDb` out into `localDb.js`; keep its exports and the AsyncStorage fallback for drafts only)
- Test: `apps/shared/test/offline-schema.test.js`, `apps/shared/test/offline-outbox.test.js`

**Interfaces (Produces):**
- `MIGRATIONS: Array<{ version: number, sql: string }>`
  - 1: `drafts` (the existing `CREATE TABLE IF NOT EXISTS`)
  - 2: `outbox_records(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL)` with an index on `(user_id, created_at)`, and `outbox_photos(id TEXT PRIMARY KEY, record_id TEXT NOT NULL, position INTEGER NOT NULL, uploaded INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL)`
  - 3: `species_cache(id TEXT PRIMARY KEY, data TEXT NOT NULL, thumb_path TEXT)`, `tag_cache(qr_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, data TEXT NOT NULL)`, `meta(key TEXT PRIMARY KEY, value TEXT)`
- `migrate(db: { execSync(sql), getFirstSync(sql) }): number`: runs each migration above `PRAGMA user_version` inside `BEGIN`/`COMMIT`, sets `user_version`, and returns the new version. A failure rolls back and throws.
- `getLocalDb(): Promise<SQLiteDatabase | null>` in `localDb.js`: the same encrypted file and key as today, then `migrate`.
- **Outbox interface** (every method async; `memoryOutbox.createMemoryOutbox()` and `outboxStore.createSqliteOutbox(getLocalDb)` both return it):
  - `add(record, photos)`: one transaction. Throws if the write fails.
  - `list(userId)`: that user's records, oldest first.
  - `get(id)`
  - `update(id, changes)`: shallow merge into `data`, and sets `updated_at`.
  - `photos(recordId)`: by `position`.
  - `markPhotoUploaded(photoId)`: sets `uploaded = 1` and deletes `base64` from `data`.
  - `remove(id)`: the record and its photos.
  - `resetInterrupted()`: `sending` becomes `pending`.
  - `count(userId)`: `{ pending, failed, conflict }`.
- **OutboxRecord:** `{ id, user_id, kind: 'new_plant'|'revisit'|'edit', qr_id, specimen_id, specimen_ref: string|null, specimen: { proposed_species_name, lat, lng, gps_accuracy_m }|null, observation: { observed_at, height_cm, morphology, notes, lat, lng, gps_accuracy_m }, base_version: number|null, state: 'pending'|'sending'|'failed'|'conflict', step: 'specimen'|'observation'|'photos'|'submit', attempts: number, error: { code, message, action }|null, server: object|null, created_at, updated_at }`. `id` is the observation ID. For an edit, `id` is the server observation ID. `specimen_ref` is the outbox ID of a plant made offline.
- **OutboxPhoto:** `{ id, record_id, position, base64, name, type, caption, traits, uploaded }`

- [ ] **Step 1: Write the failing tests**
  - `migrate runs each migration once and sets user_version`: a fake db records SQL; the first call gives 3, and a second call runs nothing.
  - `migrate keeps a pre-CTIP-44 drafts table`: start at `user_version` 0 with `drafts` holding one row; after `migrate` the row is still there.
  - `migrate rolls back a failing migration and throws`: `user_version` is unchanged.
  - Outbox (memory): `add then list returns only that user's records, oldest first`; `markPhotoUploaded drops the photo bytes`; `remove deletes the record and its photos`; `resetInterrupted turns sending into pending`.
- [ ] **Step 2:** Run `cd apps/shared && node --test test/offline-schema.test.js test/offline-outbox.test.js`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `schema.js`, `memoryOutbox.js`, `localDb.js`, `outboxStore.js`. In `outboxStore.js`, `add` uses `db.withTransactionSync`. If SQLite is unavailable (`getLocalDb()` is null), every method throws `OUTBOX_UNAVAILABLE`, with no fallback.
- [ ] **Step 4:** Run the tests. Expected: PASS. Run `npx expo export` (see Global Constraints) to catch broken imports in `draftStore.js`.
- [ ] **Step 5:** On a phone with an existing draft, install the build and check the draft still opens (migration from `user_version` 0).
- [ ] **Step 6:** Commit `CTIP-44: versioned local store and outbox`.

### Task 3: `POST /sync` (CTIP-16, API side)

**Files:**
- Create: `services/api/src/sync.js`
- Modify: `services/api/src/field.js` (export `ObservationCreate`, `EDITABLE`, `isDuplicate`, `OBS_COLUMNS` use), `services/api/src/handlers.js` (spread `syncHandlers`), `packages/api-contract/openapi.yaml` (`SyncRequest.observations`: `minItems: 1`, `maxItems: 20`; items need `id`; describe "created as queued" and the replay rule; add `422`)
- Test: `services/api/test/field-and-staff.test.js` (reuses its fake Supabase)

**Interfaces:**
- Request: `{ device_id: string (≤100), observations: Array<ObservationCreate & { id: uuid (required), base_version: int|null }> }` (1 to 20 items; otherwise the whole request answers 422).
- Response `200 { results: [{ id, result: 'created'|'updated'|'conflict'|'error', server_version?, error?: { code, message } }] }`, in request order. A bad item gets `error` and does not stop the others.
- `base_version: null` (create): insert as `status: 'queued'`, `recorded_by: req.user.id`, `version: 1`, `last_synced_at: null`, and keep the item's `observed_at`. The `REVIEW_IN_PROGRESS` rule from `post /observations` applies (botanists).
  - Duplicate primary key that is the caller's own row: `created` with that row's version.
  - Duplicate primary key on another user's row: `error ID_TAKEN`.
- `base_version: n` (edit): update `height_cm, morphology, notes, lat, lng, gps_accuracy_m` and `version: n+1` where `id`, `recorded_by = me`, status is in `EDITABLE` and `version = n`.
  - No row matched: read the row.
  - Missing: `error NOT_FOUND`.
  - Status not editable: `conflict` with `error WRONG_STATUS`.
  - Those six fields already equal the item's: `updated` (a replay).
  - Otherwise: `conflict` with `server_version`.

- [ ] **Step 1: Write the failing tests**, with these names and assertions:
  - `POST /sync creates new observations as queued`: 200; `results[0]` is `{ result: 'created', server_version: 1 }`; the row's status is `'queued'` and `observed_at` is as sent.
  - `POST /sync replayed batch stores each observation once`: send the same 2 items twice; `db.observations.length` grows by 2 in total; both answers are `created`.
  - `POST /sync edit with the right base_version answers updated`: `server_version: 2`, and the fields changed.
  - `POST /sync edit with an old base_version answers conflict and changes nothing`: `result: 'conflict'`, `server_version` is the current version, and the row is unchanged.
  - `POST /sync replayed edit answers updated, not conflict`
  - `POST /sync edit of a record sent for review answers conflict WRONG_STATUS`
  - `POST /sync item without id answers error and the others still save`: `results[0].error.code === 'VALIDATION_ERROR'`, and `results[1].result === 'created'`.
  - `POST /sync refuses 21 items with 422`
  - `POST /sync needs sign-in`: 401 with no token.
- [ ] **Step 2:** Run `npm run api:test`. Expected: the new tests fail with 501.
- [ ] **Step 3:** Implement `syncHandlers['post /sync']` in `sync.js` as above. Use `supabaseAs(req.user)` and go through the items one by one (keep it simple: at most 20).
- [ ] **Step 4:** Run `npm run api:test` and `npx @redocly/cli lint packages/api-contract/openapi.yaml`. Expected: PASS, and the lint has no new errors.
- [ ] **Step 5:** Ask a second person to review the contract change. Commit `CTIP-16: POST /sync with idempotent creates and versioned edits`. Deploy to Render.

### Task 4: Sync engine with resumable photos (CTIP-16, CTIP-66)

**Files:**
- Create: `apps/shared/offline/syncEngine.js`, `apps/shared/test/helpers/fakeServer.js`
- Test: `apps/shared/test/offline-sync.test.js`

**Interfaces:**
- Consumes: the outbox interface and the `OutboxRecord` shape (Task 2); the `POST /sync` answers (Task 3).
- Produces:
  - `createSyncEngine({ outbox, api, deviceId }) → { run(userId): Promise<SyncSummary>, resolveConflict(id, 'mine'|'theirs'): Promise<{ ok, message }> }`
    - `api` = `{ createSpecimen(body), sync(body), uploadPhoto(observationId, photo), submit(observationId), getObservation(id), addComment(observationId, body) }`, each returning the `apiFetch` result shape `{ ok, status, code, message, data, offline }`.
    - A second `run` while one is going returns the same promise.
  - `SyncSummary = { sent: number, pending: number, failed: number, conflicts: number, stoppedBy: null|'offline'|'signed_out' }`
  - `classify(res): 'retry'|'signed_out'|'fail'`
  - `actionFor(code, status): 'pick_tag'|'wait_review'|'remove_photo'|'retry'`
  - `packBatches(items, { maxItems = 20, maxChars = 80000 }): items[][]`
- `fakeServer.js` exports `createFakeServer()` → `{ api, state, dropNext(n, { afterStore: boolean }) }`. `afterStore: true` stores the step, then answers as if offline. `state` holds the specimens, observations and photos it stored.

- [ ] **Step 1: Write the failing tests**:
  - `new plant goes specimen, observation, photos, submit, then leaves the outbox`: the server holds 1 specimen, 1 observation with status `synced`, and 2 photos; `outbox.list(u)` is empty; the summary has `sent: 1`.
  - `observed_at sent is the capture time, not the sync time`
  - `network drop mid-photo: the next run sends only the missing photos, each stored once`: `dropNext(1)` before photo 2; after 2 runs, `state.photos.length === 2` and photo 1 was uploaded once.
  - `drop after the server stored a step: the replay stores it once` (`afterStore: true` on each step in turn)
  - `the record stays until submit is confirmed`: drop on submit; the record is still listed with `step: 'submit'`.
  - `server specimen id is written back and used by a queued revisit of that plant`: the server answers the plant's specimen create with another ID; the revisit is sent with that ID.
  - `a revisit waits while its plant has not synced`
  - `TAG_IN_USE fails that record with pick_tag and the next record still syncs`
  - `401 stops the run and leaves every record pending`: `stoppedBy: 'signed_out'`, and every state is `pending`.
  - `offline stops the run with stoppedBy offline and counts an attempt`
  - `another user's records are neither sent nor listed`
  - `records left sending by a killed app are sent on the next run` (the engine calls `outbox.resetInterrupted()` at the start of each run)
  - `two runs at once send nothing twice`
  - `packBatches keeps each batch at 20 items or fewer and under 80,000 characters`
  - `413 on a photo fails the record with remove_photo`
- [ ] **Step 2:** Run `cd apps/shared && node --test test/offline-sync.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement `syncEngine.js` to the Design section. Set `state: 'sending'` before each record and back to `pending`/`failed`/`conflict` after. Write back IDs and `step` after every confirmed call. Records that are ready for the observation step go to `POST /sync` together, through `packBatches`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `CTIP-16: sync engine with idempotent replay and resumable photos (CTIP-66)`.

### Task 5: Save-first capture in airplane mode (CTIP-83)

**Files:**
- Create: `apps/mobile/offline/tagCache.js`, `apps/shared/offline/tags.js`, `apps/shared/test/offline-tags.test.js`, `apps/shared/test/offline-store.test.js`
- Modify: `apps/shared/StoreProvider.js`, `apps/mobile/App.js`, `apps/mobile/pages/AddPlant.js`, `apps/mobile/pages/Scan.js`

**Interfaces:**
- Consumes: `createSyncEngine` (Task 4), `createSqliteOutbox` (Task 2).
- Produces:
  - `<StoreProvider outbox={outbox} tagCache={tagCache}>`: the web passes neither and keeps today's path.
  - The store adds:
    - `outboxItems` (my records)
    - `syncState: { running, lastSyncedAt, lastSummary }`
    - `syncNow({ waitMs } = {}): Promise<SyncSummary|null>` (null when it is still running after `waitMs`)
    - `addPlant(...)` and `addRevisit(...)` now answer `{ ok: true, queued: boolean, id }` or `{ ok: false, message }`
  - The engine's `api` is built from `callApi` with the existing `*Api` functions plus `syncApi(body)` (add it to `apps/shared/api.js`).
  - `lookupTagOffline(db, id, { cached, outboxTags }) → { kind: 'unused'|'used'|'retired'|'unknown'|'unchecked', id, ... }`: `unchecked` means unknown while offline.
  - `tagCache.save(userId, rows)` and `tagCache.all(userId)`. Rows: `{ qr_id, status, specimen_id, mine: boolean, name }` (no coordinates).

- [ ] **Step 1: Write the failing tests**:
  - `lookupTagOffline uses the cached tag list when the workspace is empty`
  - `lookupTagOffline marks a tag used by a record on this phone as used`
  - `lookupTagOffline answers unchecked for an unknown tag while offline`
  - `addPlant reports failure and keeps the draft when the outbox write fails`: test the pure helper `saveFirst({ outbox, record, photos, syncNow })` exported from `apps/shared/offline/syncEngine.js`; with `outbox.add` rejecting, it answers `{ ok: false }` and `syncNow` is never called.
  - `saveFirst answers queued: true when the sync is still running after waitMs`
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Store.** With `outbox` present, `addPlant` and `addRevisit` build the `OutboxRecord` with `observed_at: nowIso()` at capture, then call `saveFirst` with `waitMs: 8000`. Mount the engine once. After each successful workspace load, call `tagCache.save`.
- [ ] **Step 4: App.js.** Create the SQLite outbox and tag cache and pass them to `StoreProvider`.
- [ ] **Step 5: AddPlant.js.** Clear the draft only when `ok`. On `queued: true`, open `submitted` with `{ queued: true }` and the copy in Task 7, UI A. For GPS: if `Balanced` fails, try once more with `Location.Accuracy.High` and a 20 s timeout before showing "Could not get a GPS fix". Never use a last-known or made-up position.
- [ ] **Step 6: Scan.js.** Use `lookupTagOffline`. On `unchecked`, show the UI J sheet.
- [ ] **Step 7:** Run the tests and `npx expo export`. Expected: PASS.
- [ ] **Step 8: Manual check on an Android phone (dev build).**
  - Airplane mode: scan an unused tag, take 2 photos, wait for GPS, pick a species name, submit. Expected: "Saved on this phone".
  - Turn airplane mode off. Expected: within 30 s the record shows "Needs review" on the website's review page.
- [ ] **Step 9:** Commit `CTIP-83: save records on the phone first and send them when online`.

### Task 6: Species reference cache and offline search (CTIP-84)

**Files:**
- Create: `apps/shared/offline/offlineSearch.js`, `apps/shared/test/offline-search.test.js`, `apps/mobile/offline/speciesCache.js`
- Modify: `apps/mobile/hooks/useSpeciesSearch.js`, `apps/mobile/components/SpeciesPicker.js`, `apps/mobile/App.js`, `apps/mobile/package.json` (`npx expo install expo-file-system`)

**Interfaces:**
- `searchSpeciesOffline(list, { q, family, page = 1, limit = 20 }) → { data, meta: { page, limit, total } }`:
  - case-insensitive substring match on `scientific_name`, `common_name`, `family` and `genus`, using `cleanTerm` from `speciesSearch.js`
  - sorted by `scientific_name`
  - the same shape `fetchSpeciesPage` returns
- `speciesCache.refresh({ force })`:
  - fetches `GET /public/species` with no paging
  - stores the rows (`id, scientific_name, common_name, family, genus, description` cut to 200 characters, `conservation_status`)
  - downloads each `primary_image_url` to `FileSystem.documentDirectory + 'species-thumbs/' + id + '.jpg'`
  - deletes thumbnails of species that are gone
  - sets `meta.species_cached_at`
  - skips the refresh if it ran less than 24 h ago, unless `force` is set
- `speciesCache.all() → { list, cachedAt }`
- `useSpeciesSearch` also returns `offline: boolean` and `cachedAt`.

- [ ] **Step 1: Write the failing tests**:
  - `matches scientific name, common name, family and genus, ignoring case`
  - `family filter narrows the results`
  - `pages like the API and reports the total`
  - `an empty term returns nothing`, as `buildSpeciesQuery` does
- [ ] **Step 2:** Run them. Expected: FAIL. **Step 3:** Implement `offlineSearch.js`. **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5:** Hook: when `fetchSpeciesPage` fails with `NETWORK_ERROR`, answer from `searchSpeciesOffline(speciesCache.all().list, …)` and set `offline: true`. Picker: the UI H caption, with thumbnails from `thumb_path`.
- [ ] **Step 6:** Call `speciesCache.refresh()` after the first health check that succeeds, and `refresh({ force: true })` when the connection returns (Task 7 triggers).
- [ ] **Step 7:** Manual check. Online, open Add plant once. Then in airplane mode, search "nep". Expected: matching species with thumbnails and the offline caption.
- [ ] **Step 8:** Commit `CTIP-84: cache published species for offline search`.

### Task 7: Sync status, triggers and the offline UI (CTIP-68)

**Files:**
- Create: `apps/mobile/offline/useSyncTriggers.js`, `apps/mobile/components/SyncBar.js`
- Modify: `apps/shared/tokens.js`, `apps/mobile/pages/Records.js`, `apps/mobile/pages/AddPlant.js` (`submitted` view), `apps/mobile/pages/Admin.js` (sign-out), `apps/mobile/navigation/tabs.js`, `apps/mobile/App.js`, `apps/mobile/package.json` (`npx expo install expo-network`), `apps/shared/StoreProvider.js` (`retryRecord(id)`, `discardRecord(id)`, `changeRecordTag(id, qrId)`, `removeRecordPhoto(id, photoId)`)
- Test: `apps/shared/test/status-and-photos.test.js` (extend)

**Interfaces:**
- `useSyncTriggers(syncNow, { pending: number })` triggers: the `Network.addNetworkStateListener` state turns `isInternetReachable`; `AppState` becomes `active`; and the backoff timer 30 s, 60 s, 120 s, then every 300 s while `pending > 0`, reset by any successful run.
- Tokens:
  - `STATUS_TONE`: `sending: "info"`, `sync_failed: "warning"`, `sync_conflict: "warning"`
  - `STATUS_TEXT`: `sending: "Sending"`, `sync_failed: "Couldn't send"`, `sync_conflict: "Changed on another device"`
  - `queued` keeps "Waiting to sync"
- Outbox state to status: `pending` → `queued`, `sending` → `sending`, `failed` → `sync_failed`, `conflict` → `sync_conflict`, as `outboxStatus(record)` in `apps/shared/offline/syncEngine.js`.
- `badgeCounts` adds `unsent` (failed + conflict) to the My records tab badge, next to `returned`.

**UI (exact copy):**
- **A. After submit, saved offline:** `submitted` with `queued`.
  - Title "Saved on this phone".
  - Body "No connection right now. It will be sent for review automatically when you're back online."
  - `DotLabel` `queued`.
  - Primary button "Record another plant", and a text link "See records on this phone".
- **B. Offline notice** (neutral `Notice`) at the top of My Records and Add plant while `apiStatus === 'offline'`: "You're offline. New records are saved on this phone."
- **C. My Records:** a first group "On this phone", shown only when `outboxItems` is not empty.
  - `SyncBar` reads "{n} waiting to sync · Last sent {fmt time}" and has a secondary "Sync now" button with the `refresh` icon. It shows "Sending…" and is disabled while running.
  - While offline, a tap gives the toast "Still offline. They'll send when you're back online."
  - Rows: `Thumb` from the first photo's base64, plant name, `Mono` tag, `DotLabel` from `outboxStatus`.
- **D. Detail of a record on this phone:**
  - `KV` of the fields, and the photos.
  - When `failed`, a warning `Notice` by action:
    - `pick_tag`: "Tag {qr} is already on another plant. Choose another tag for this record." with the button "Choose another tag", which opens Scan in pick mode and then calls `changeRecordTag`.
    - `wait_review`: "This plant has a record waiting for an officer. It will be sent once they decide." The record goes back to `pending` on every manual sync.
    - `remove_photo`: "Photo {n} can't be sent: it is too large, or not a JPEG, PNG or WebP. Remove it to send the rest." with the button "Remove photo".
    - `retry`: the API message, with the button "Try again".
  - Always a `dangerText` "Delete from this phone", which asks "Delete this record? It hasn't been sent, so it will be lost for good." with the buttons "Keep" and "Delete".
- **G. Sign-out with unsent records:** an alert titled "{n} records not sent yet".
  - Body: "They stay on this phone, encrypted, and send the next time you sign in here. Sign out anyway?"
  - Buttons: "Stay signed in" (cancel) and "Sign out" (destructive).
  - When online, also "Send now", which runs `syncNow` and then asks again.

- [ ] **Step 1:** Write a failing test, `outboxStatus maps every outbox state to a status with STATUS_TEXT wording`, in `status-and-photos.test.js`. Run it. Expected: FAIL. Implement it. Run it. Expected: PASS.
- [ ] **Step 2:** Build `useSyncTriggers`, `SyncBar` and UI A to D and G as written above, using `Bits.js` parts only.
- [ ] **Step 3:** Check both themes and with "reduce motion" on. Check 48 dp touch targets, and `accessibilityLabel` on "Sync now" and on each row.
- [ ] **Step 4:** Manual check.
  - Airplane mode: save 2 records. Expected: "2 waiting to sync".
  - Airplane off. Expected: they send without a tap.
  - Airplane on, save 1, tap "Sync now". Expected: the toast.
  - Sign out with 1 unsent. Expected: the alert, and the record is still there after signing back in.
- [ ] **Step 5:** Run all checks, then commit `CTIP-68: sync status, automatic and manual sync`.

### Task 8: Reserved tags for offline tag generation (CTIP-116; drop this second if short of time)

**Files:**
- Create: `supabase/migrations/<ts>_qr_tags_botanist_release_reserved.sql`
- Modify: `services/api/src/permissions.js` (`['delete', '/qr-tags/:qrId', ANY_STAFF]`), `services/api/src/staff.js` (`delete /qr-tags/:qrId`), `services/api/src/field.js` (`post /specimens`), `packages/api-contract/openapi.yaml`, `apps/shared/offline/tags.js`, `apps/mobile/offline/tagCache.js` (a `reserved_tags` table as migration 4 in `schema.js`), `apps/mobile/pages/AddPlant.js`, `apps/mobile/pages/Tags.js`, `apps/shared/StoreProvider.js` (`topUpReservedTags()`, `releaseTag(qrId)`), `apps/shared/selectors.js`
- Test: `services/api/test/field-and-staff.test.js`, `apps/shared/test/offline-tags.test.js`

**Interfaces:**
- **API, delete:** a botanist may delete a tag only where `created_by = me`, `batch_label = 'reserved'`, status is `unassigned` and no specimen is on it. Otherwise 403 `FORBIDDEN` "You can release only tags kept for you." Officers and admins work as today.
- **API, register a plant:** `POST /specimens` on a tag with `batch_label = 'reserved'` and `created_by ≠ me` answers `409 TAG_RESERVED` "Tag {qr} is kept for another botanist. Pick or scan an unused tag."
- **Migration:** policy `"qr_tags: botanist releases own reserved"`: `for delete to authenticated using (created_by = auth.uid() and batch_label = 'reserved' and status = 'unassigned' and public.user_role() = 'botanist')`. Match the helper names in `20261104130000`. Use `drop policy if exists` first.
- `reservedToCreate(tags, meId, { usedOnPhone, keep = 3 }) → number`
- `nextReservedTag(reserved, usedOnPhone) → qr_id | null`
- `isReservedForOther(tag, meId) → boolean`, also used in the unused-tag pickers so others never see these tags

**UI:**
- **Tags page:** a section "Kept for offline use" with the body "These tags are kept for you, so you can make a new tag with no connection." Each tag in `Mono`, with a text button "Release" (online only).
- **Add plant "Generate new QR tag" while offline:** takes `nextReservedTag` and shows the same "New tag ready" alert as online.
- **None left:** the button is disabled with the hint "No offline tags left. Connect to the internet to get more, or scan a pre-printed tag."

- [ ] **Step 1: Write the failing tests**:
  - API: `botanist releases own reserved unused tag` (204); `botanist cannot release another botanist's tag` (403); `botanist cannot release a printed tag` (403); `POST /specimens on another botanist's reserved tag answers 409 TAG_RESERVED`; `POST /specimens on my own reserved tag works` (201).
  - Shared: `reservedToCreate tops up to 3, not counting tags used on this phone`; `nextReservedTag skips tags used by a record on this phone`; `isReservedForOther hides another botanist's reserved tags`.
- [ ] **Step 2:** Run them. Expected: FAIL. **Step 3:** Implement. Add migration 4 (`reserved_tags(qr_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0)`) to `MIGRATIONS`, and change the Task 2 schema test's expected version from 3 to 4. **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5:** `npx supabase migration list`, then `npx supabase db push --dry-run` (only the new file), tell Amberlyn, then `npx supabase db push`. Get a second person's review of the contract.
- [ ] **Step 6:** The store calls `topUpReservedTags()` after each workspace load while online, using `createTagBatchApi(1, 'reserved')` once per missing tag.
- [ ] **Step 7:** Manual check. In airplane mode, generate a tag and save the record. Online, check that it syncs, and that the Tags page shows 3 kept tags again.
- [ ] **Step 8:** Commit `CTIP-116: reserve tags for offline tag generation`.

### Task 9: Conflict handling for two devices (CTIP-67; drop this first if short of time)

**Files:**
- Modify: `apps/shared/offline/syncEngine.js` (`resolveConflict`), `apps/shared/StoreProvider.js` (`editUnsent(obs, changes)`, `resolveConflict(id, choice)`), `apps/mobile/pages/Records.js` (the edit of an unsent record goes through `editUnsent`; conflict view)
- Test: `apps/shared/test/offline-sync.test.js`

**Interfaces:**
- `editUnsent(obs, changes)`:
  - online: today's `PATCH /observations/:id` path, with a fallback to the outbox when the call can't reach the API
  - offline: an outbox record `{ kind: 'edit', id: obs.id, base_version: obs.version, step: 'observation' }`
- On `conflict`, the engine stores `server` = `getObservation(id).data` and sets `state: 'conflict'`.
- `resolveConflict(id, 'mine')`: set `base_version = server.version`, `state: 'pending'`, run, then `addComment(id, "Edited on two devices before syncing. Kept the version from this phone.")`.
- `resolveConflict(id, 'theirs')`: `addComment(id, "Edited on two devices before syncing. Kept the version from the other device.")`, then `remove(id)`.

**UI E (exact copy):**
- Warning `Notice`: "This record was changed on another device before this phone sent its changes. Choose which version to keep."
- A table with the columns "Field", "This phone" and "Other device", showing only the rows that differ.
- A primary "Keep this phone's version" and a secondary "Keep the other version".
- Toasts: "Kept this phone's version" or "Kept the other device's version".

- [ ] **Step 1: Write the failing tests**:
  - `edit with a stale base_version becomes a conflict holding the server copy`
  - `keep mine resends with the server version and adds a comment`
  - `keep theirs removes the phone's edit and adds a comment`
  - `a conflict is never resolved without the botanist's choice`: run twice; the state is still `conflict`, and nothing was sent.
- [ ] **Step 2:** Run them. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5:** Manual check with two phones signed in as the same botanist. Both offline, edit the same draft differently. Bring phone A online (it sends), then phone B. Expected: B shows the conflict view, and the choice is recorded as a comment.
- [ ] **Step 6:** Commit `CTIP-67: ask the botanist when two devices edited one record`.

### Task 10: Airplane-mode test run, docs and reassessment hand-off (all stories)

**Files:** Create `docs/testing/offline-mode-test.md`. Modify `CLAUDE.md` (Connectivity, Current status, Repository structure: `apps/shared/offline/`, `apps/mobile/offline/`; the SDK version), `final-stretch-sprint.md` (reassessment checklist line for `POST /sync`).

- [ ] **Step 1:** Write the test script with one row per case: steps, expected result, actual result, pass or fail, date, phone. Run every case on an Android phone with the release APK (`npm run mobile:build:apk`):
  1. Full capture in airplane mode, for a new plant and for a revisit (CTIP-83 AC 3).
  2. Airplane mode turned on during a photo upload (CTIP-16 AC 4, CTIP-66 AC 3). Expected: each photo is stored once (check the website).
  3. App killed from recent apps while "Sending". Expected: it sends on reopen.
  4. A new APK installed over the old one with 2 unsent records. Expected: both are still there and send (CTIP-44 AC 2).
  5. Sign out with unsent records, sign in as another botanist (who doesn't see them), sign back in (they send).
  6. Two-phone conflict (Task 9), and offline tag generation (Task 8), if built.
  7. Species search offline.
  8. Records are not readable by other apps: `adb shell run-as` fails on the release build, and the DB file is SQLCipher (`PRAGMA cipher_version` shows in the dev log). Record the result for CTIP-74.
- [ ] **Step 2:** Fix anything that fails. Each fix is its own commit, starting with the story key.
- [ ] **Step 3:** Update CLAUDE.md and the sprint doc. Move each story to Done only when every acceptance criterion in the table below has a passing test or a passing row in the test script.
- [ ] **Step 4:** Commit `CTIP-68: offline test run and docs`.

---

## Acceptance criteria coverage

| Story | Criterion | Where |
|---|---|---|
| CTIP-44 | Saved locally first, with a client ID, before any network call | Task 5 (`saveFirst`), Task 2 |
| CTIP-44 | Schema versioned with migrations; updates keep unsynced records | Task 2 tests, Task 10 case 4 |
| CTIP-83 | Capture works in airplane mode: QR bind, photos, GPS, taxonomy, submit | Tasks 5, 6, 8; Task 10 case 1 |
| CTIP-83 | Offline records marked pending and queued | Task 5, Task 7 (`queued` "Waiting to sync") |
| CTIP-83 | Tested end to end in airplane mode on Android | Task 10 case 1 |
| CTIP-84 | Species reference cached on the device | Task 6 |
| CTIP-84 | Search works offline, thumbnails only | Task 6 |
| CTIP-84 | Cache refreshes when back online | Task 6 step 6, Task 7 triggers |
| CTIP-16 | Idempotency key on every queued record; retries never duplicate | Tasks 3, 4 (replay tests) |
| CTIP-16 | Server ID written back to the local record | Task 4 (written-back specimen ID test) |
| CTIP-16 | Removed from the queue only after the server confirms | Task 4 (`stays until submit is confirmed`) |
| CTIP-16 | Tested with the network dropped mid-sync | Task 4 (`afterStore` drops), Task 10 case 2 |
| CTIP-66 | Photos resume after an interruption | Task 4 (mid-photo drop) |
| CTIP-66 | A partly uploaded photo is never attached twice | Task 4, API photo ID check in `field.js` |
| CTIP-66 | Tested with the network dropped mid-upload | Task 10 case 2 |
| CTIP-67 | Conflict strategy in `docs/` and built | Task 1, Task 9 |
| CTIP-67 | No edit silently lost | Task 9 (`never resolved without the botanist's choice`) |
| CTIP-67 | Botanist told how it was resolved | Task 9 (toast and comment) |
| CTIP-68 | Sync starts automatically when the connection returns | Task 7 (`useSyncTriggers`) |
| CTIP-68 | Sync can start manually | Task 7 ("Sync now") |
| CTIP-68 | Each record shows pending, synced or failed | Task 7 (`outboxStatus`, UI C and D) |
| CTIP-116 | Generate a QR tag with no connection | Task 8 |
| CTIP-116 | Unique; no clash with printed or other botanists' tags | Task 8 (API `TAG_RESERVED`, server-made IDs) |
| CTIP-116 | Unused reserved tags visible and releasable | Task 8 (Tags page, delete rule) |
| CTIP-116 | Records with a reserved tag sync without duplicates | Task 8 step 7, Task 4 |
| Sprint (CTIP-74) | Replayed sync batches stored once; sync needs sign-in; unsynced records unreadable by other apps | Task 3 tests, Task 10 case 8 |

## Schedule (fits the sprint timeline)

| When | Tasks |
|---|---|
| By Thu 12 Nov (week 1, alongside build steps 1 to 6) | Task 1, the design doc ("Offline plan written") |
| Fri 13 to Mon 16 Nov | Tasks 2, 3, 4 (the core: CTIP-44, CTIP-16, CTIP-66) |
| Mon 16 to Tue 17 Nov | Tasks 5, 6, 7 (CTIP-83, CTIP-84, CTIP-68) |
| Tue 17 to Wed 18 Nov | Task 8, then Task 9, only if Tasks 2 to 7 pass; drop Task 9 first, then Task 8 |
| Wed 18 Nov, before the Thu 19 freeze | Task 10, and the APK installed on the demo phones |
