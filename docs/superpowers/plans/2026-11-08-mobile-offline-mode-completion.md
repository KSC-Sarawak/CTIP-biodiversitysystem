# Mobile Offline Mode: Completion Plan (Tasks 8 to 12)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the botanist app's offline mode: reserved tags for making a tag with no signal (CTIP-116), a choice when two phones edited one record (CTIP-67), the airplane-mode test run and docs, one review of the whole branch, and the pull request. Every commit, the pushed branch and the PR belong to **DinoDoesThings**.

**Architecture:** Continues `feature/CTIP-16-offline-mode` (worktree `.claude/worktrees/feature+CTIP-16-offline-mode`, branched from `main` at `aaeb809`, Tasks 1 to 7 done, head `4f9b9e7`). Pure rules go in `apps/shared/offline/` with node tests. Store wiring goes in hooks there (no JSX, no React Native), as `useOutboxSync.js` does. The phone's SQLite pieces go in `apps/mobile/offline/`. The API enforces every rule; the database policy is the second layer.

**Tech Stack:** Node + Express 5 + Zod (API), Supabase Postgres (RLS migrations), React Native + Expo SDK 58 (`expo-sqlite`), `node --test`, supertest.

**Spec:** `docs/architecture/offline-sync.md` (§5 errors, §7 tags offline, §8 conflicts, §13 testing), the stories' acceptance criteria in the coverage table of `docs/superpowers/plans/2026-11-07-mobile-offline-mode.md`, and the ledger `.superpowers/sdd/2026-11-07-mobile-offline-mode/progress.md` (all `Ruling:` lines still bind).

## Global Constraints

- **Identity.** Every commit's author and committer is `Dino <83908999+DinoDoesThings@users.noreply.github.com>`, taken from `~/.gitconfig`. Never pass `--author`, never use `-c user.name`/`-c user.email`, and never set `user.*` in the repo or worktree config. After every commit, run `git log -1 --format='%an <%ae> | %cn <%ce>'`. Both halves must read `Dino <83908999+DinoDoesThings@users.noreply.github.com>`, or the task is not complete.
- **Branch ownership.** Push only through Git Credential Manager as `DinoDoesThings` (`git credential-manager github list` must print only `DinoDoesThings`). The PR is opened on github.com signed in as DinoDoesThings. `gh` is not installed; if it is installed later, `gh auth status` must show DinoDoesThings first. Nothing is pushed before the user says so (Task 12).
- Commit messages start with the story key and carry **no** `Co-Authored-By` line or any other Claude attribution (user decision, 9 Nov; the 11 earlier commits were rewritten to remove it). The PR description carries no Claude attribution either.
- Plain JavaScript only. Files in `apps/shared/` have no JSX and no React Native imports.
- Colours, sizes and durations come from `apps/shared/tokens.js`; no hex in pages. Tag IDs go in `Mono`, statuses through `DotLabel`/`Chip`. One primary button per screen. No emoji. Sentence case. 48 dp touch targets.
- Checks before every commit:
  - `npm test` in `services/api`
  - `node --test` in `apps/shared`
  - `npm run lint` and `npm run build` in `apps/web`
  - for mobile changes, also `npx expo export --platform android --output-dir <scratch folder>` in `apps/mobile`, then delete that folder
- Every route in `services/api/src/permissions.js` stays in `packages/api-contract/openapi.yaml` (`contract.test.js`). A contract change needs a second person's review before merge (noted in the PR).
- Migrations: a new file only, safe to run twice, with a timestamp unused on the live database. The executor never runs `supabase db push`: the user pushes, after telling Amberlyn (ledger Ruling 4).
- Unsent records live only in the encrypted SQLite file. The apps call only the API. No keys or passwords in git: the repository is public.
- Never commit `CLAUDE.md`, `DESIGN.md`, `final-stretch-sprint.md` or `.superpowers/`. From `docs/superpowers/`, only the plan files are committed (user request, 8 Nov).
- Shell: Git Bash on Windows; files are CRLF, so edit with the Edit tool or normalise line endings in scripts.

## Review Focus

1. **Another botanist's kept tag scanned offline.** It must not look "unused": the tag list saved on the phone leaves it out, so the scanner says "Can't check this tag offline". If it is sent anyway, `409 TAG_RESERVED` becomes `pick_tag`, never a 500 or a lost record. *(Task 8a and Task 8b tests)*
2. **Top-up runs after every poll.** It must never make more than 3 kept tags: the count comes from the server's list, and only one top-up runs at a time. *(Task 8b: `reservedToCreate` tests and the single-flight test)*
3. **A kept tag used offline, or released on the website meanwhile.** `nextReservedTag` skips tags already used by a record on this phone. A released tag answers `TAG_NOT_FOUND` at sync, which becomes `pick_tag`. *(Task 8b tests)*
4. **"Keep this phone's version" with no signal.** The choice and its comment must not be lost: the record keeps `resolution: 'mine'`, and the comment is posted only after the edit is accepted. *(Task 9 test)*
5. **"Keep the other version" when the comment can't be sent.** The record stays in conflict and nothing is deleted. *(Task 9 test)*

---

### Task 0: Set up and record the hand-off

- [ ] **Step 1:** In the worktree, `git status --short` shows only this plan file, and `git log --oneline -1` shows `4f9b9e7`.
- [ ] **Step 2:** Run the identity checks from Global Constraints against `git config user.email` and `git credential-manager github list`. Expected: `83908999+DinoDoesThings@users.noreply.github.com` and `DinoDoesThings`.
- [ ] **Step 3:** Run `sdd-workspace` on this plan to create its workspace. Start its `progress.md` with these two lines:
  - `# SDD ledger — plan: docs/superpowers/plans/2026-11-08-mobile-offline-mode-completion.md`
  - `Continues .superpowers/sdd/2026-11-07-mobile-offline-mode/progress.md (Tasks 1-7 complete; its Ruling: lines bind here).`

  Then commit this plan file.

```bash
git add docs/superpowers/plans/2026-11-08-mobile-offline-mode-completion.md
git commit -m "CTIP-16: add the offline mode completion plan"
git log -1 --format='%an <%ae> | %cn <%ce>'
```

### Task 8a: Kept tags on the API and database (CTIP-116)

**Files:**
- Create: `supabase/migrations/20261108000000_qr_tags_botanist_release_reserved.sql`
- Modify: `services/api/src/permissions.js:48`, `services/api/src/staff.js` (`'delete /qr-tags/:qrId'`), `services/api/src/field.js` (`'post /specimens'`), `packages/api-contract/openapi.yaml`
- Test: `services/api/test/field-and-staff.test.js`, `services/api/test/rbac.test.js` (only if it asserts a botanist 403 on that route)

**Interfaces:**
- Produces:
  - `DELETE /v1/qr-tags/:qrId`, open to `ANY_STAFF`. A botanist may delete only where `created_by = me`, `batch_label = 'reserved'`, the status is `unassigned` and no plant is on the tag. Otherwise `403 FORBIDDEN` "You can release only tags kept for you." Officers and admins work as today.
  - `POST /v1/specimens` on a tag with `batch_label = 'reserved'` and `created_by ≠ me` answers `409 TAG_RESERVED` "Tag {qr} is kept for another botanist. Pick or scan an unused tag." (`syncEngine.js` already maps `TAG_RESERVED` to `pick_tag`.)

- [ ] **Step 1: Write the failing tests** in `field-and-staff.test.js`. Rows go straight into `db.qr_tags` as `{ qr_id, status: 'unassigned', batch_label: 'reserved', created_by }`:
  - `botanist releases own reserved unused tag` → 204, and the row is gone.
  - `botanist cannot release another botanist's tag` → 403 `FORBIDDEN`, and the row stays.
  - `botanist cannot release a printed tag` (`batch_label: 'Print 3'`, `created_by: users.botanist`) → 403.
  - `POST /specimens on another botanist's reserved tag answers 409 TAG_RESERVED`: `res.body.code === 'TAG_RESERVED'`, no specimen row.
  - `POST /specimens on my own reserved tag works` → 201.
- [ ] **Step 2:** Run `npm test` in `services/api`. Expected: the 5 new tests FAIL (the first on 403 from RBAC), and the rest pass.
- [ ] **Step 3:** Implement:
  - **Permissions:** `permissions.js:48` becomes `['delete', '/qr-tags/:qrId', ANY_STAFF]`.
  - **Delete route:** for a botanist, the delete handler reads the tag first and applies the rule above. Keep the existing `TAG_IN_USE` and `NOT_FOUND` answers.
  - **Specimen route:** `post /specimens` reads `batch_label, created_by` of `body.qr_id` before the insert, and refuses another botanist's kept tag. A missing tag falls through to the existing `TAG_NOT_FOUND`.
- [ ] **Step 4:** Write the migration:
  - `drop policy if exists "qr: botanist release own reserved" on public.qr_tags;`
  - then `create policy ... for delete to authenticated using (public.my_role() = 'botanist' and created_by = auth.uid() and batch_label = 'reserved' and status = 'unassigned');`
  - The helper is `public.my_role()`, as in `20261104130000`; the old plan's `user_role()` is wrong.
- [ ] **Step 5:** Contract changes:
  - the delete operation gets a 403 response and botanists in its description
  - `POST /specimens` lists 409 `TAG_RESERVED` and `TAG_RETIRED` (the latter clears a deferred minor from Task 4)
  - Run `npx @redocly/cli lint packages/api-contract/openapi.yaml`. Expected: no errors.
- [ ] **Step 6:** Run `npx supabase migration list` from the main checkout root (read only). Expected: `20261108000000` is absent on the remote side. If it is taken, rename the file to the next free timestamp and note a ledger ruling.
- [ ] **Step 7:** Run all checks, then commit `CTIP-116: botanists release their own kept tags; kept tags refused to others`. Check the identity.

### Task 8b: Kept tags on the phone (CTIP-116)

**Files:**
- Create: `apps/mobile/offline/reservedTags.js`, `apps/shared/offline/useReservedTags.js`, `apps/shared/offline/reservedTopUp.js`
- Modify:
  - `apps/shared/offline/schema.js` (migration 4)
  - `apps/shared/offline/tags.js`
  - `apps/shared/StoreProvider.js` (call the hook, expose its answers)
  - `apps/mobile/App.js` (pass `reservedTags`)
  - `apps/mobile/pages/AddPlant.js`
  - `apps/web/src/pages/AddPlant.jsx`, `apps/web/src/pages/Scan.jsx` (unused-tag pickers)
- Test: `apps/shared/test/offline-tags.test.js`, `apps/shared/test/offline-schema.test.js`

**Interfaces:**
- Consumes: Task 8a's routes; `createTagBatchApi(count, batch_label)` and `deleteTagApi(qrId)` in `apps/shared/api.js`; `outboxTagsFrom(outboxItems)`.
- Produces (in `apps/shared/offline/tags.js`):
  - `RESERVED_LABEL = "reserved"`, `RESERVED_KEEP = 3`
  - `isReservedForOther(tag, meId) → boolean`: `batch_label === 'reserved' && created_by !== meId`
  - `myKeptTags(tags, meId) → qr_id[]`: the store's tags with status `"unused"`, label `reserved`, and `created_by === meId`
  - `reservedToCreate(tags, meId, { usedOnPhone = [], keep = RESERVED_KEEP }) → number`: `max(0, keep - myKeptTags(...).filter(not in usedOnPhone).length)`
  - `nextReservedTag(kept, usedOnPhone) → qr_id | null`
  - `tagCacheRows` leaves out tags kept for another botanist
- Produces (phone store, `createReservedTags(getLocalDb)` in `apps/mobile/offline/reservedTags.js`): `save(userId, qrIds)` replaces that person's list; `all(userId) → qr_id[]`.
- Produces (store, via `useReservedTags({ reservedTags, userId, role, db, outboxItems, callApi, apiStatus, notify })`):
  - `keptTags: qr_id[]`
  - `topUpReservedTags()`: one run at a time; botanists only; online only
  - `releaseTag(qrId) → { ok, message? }`
  - `takeReservedTag() → qr_id | null`

- [ ] **Step 1: Write the failing tests:**
  - `reservedToCreate tops up to 3, not counting tags used on this phone`: 1 kept + 1 used on phone → 2; 3 kept → 0; another botanist's kept tags count 0.
  - `nextReservedTag skips tags used by a record on this phone`: `(['NIAH-0101','NIAH-0102'], ['NIAH-0101']) → 'NIAH-0102'`; all used → `null`.
  - `isReservedForOther hides another botanist's reserved tags`: mine → false, other's → true, printed → false.
  - `tagCacheRows leaves out tags kept for another botanist`.
  - Schema test: `LATEST` and `user_version` become `4`, and table `reserved_tags(qr_id TEXT PRIMARY KEY, user_id TEXT NOT NULL)` exists.
- [ ] **Step 2:** Run `node --test` in `apps/shared`. Expected: those tests FAIL.
- [ ] **Step 3:** Implement the shared functions and migration 4. Ruling for the ledger: there is no `used` column, because the outbox already says which tags are used (`outboxTagsFrom`).
- [ ] **Step 4:** Run the tests again. Expected: PASS.
- [ ] **Step 5:** Build `reservedTags.js` (same `getLocalDb` and `OUTBOX_UNAVAILABLE` pattern as `tagCache.js`) and `useReservedTags.js`:
  - **Top-up:**
    - when it runs: after each staff workspace load, while `apiStatus === 'connected'` and the role is `botanist`
    - what it does: calls `createTagBatchApi(1, 'reserved')` `reservedToCreate` times, then reloads, then saves `myKeptTags` minus the tags used on the phone to the phone store
    - concurrency: a ref keeps it to one run at a time
  - **Release:** calls `deleteTagApi`, then reloads.
  - Wire the hook into `StoreProvider.js`, and pass `reservedTags` from `App.js`.
- [ ] **Step 6:** Add a unit test for the single-flight guard, `two top-ups at once make one run`. The guard is `createTopUp(run) → () => Promise` in a new `apps/shared/offline/reservedTopUp.js` with no React import, so node can load it; `useReservedTags.js` uses it. Run it: FAIL, then PASS after implementing.
- [ ] **Step 7:** The UI, exact copy:
  - **Generate offline:** Add plant's "Generate new QR tag" with `apiStatus !== 'connected'` calls `takeReservedTag()` and shows the same "New tag ready" alert as online.
  - **None left:** the button is disabled, with the hint "No offline tags left. Connect to the internet to get more, or scan a pre-printed tag."
  - **Kept tags list:** a section "Kept for offline use" with the body "These tags are kept for you, so you can make a new tag with no connection." Each tag in `Mono` with a text button "Release", shown only while online.
    - **Where it goes:** on Add plant's tag-choice screen, botanists only. Botanists can't open the Tags page (`permissions.js`: botanists lack `tags`), so the old plan's Tags-page placement is replaced. Ledger ruling.
  - **Unused-tag pickers** on both apps hide tags kept for others. The phone's own picker also hides the botanist's kept tags, since they are listed in their own section.
- [ ] **Step 8:** Run all checks including `expo export`, then commit `CTIP-116: keep three tags on the phone for making a tag offline`. Check the identity.

### Task 9: Choosing a version when two phones edited one record (CTIP-67)

**Files:**
- Create: `apps/shared/offline/conflicts.js`
- Modify:
  - `apps/shared/offline/records.js` (`editRecord`)
  - `apps/shared/offline/syncEngine.js` (edit `finish`)
  - `apps/shared/offline/syncStatus.js` (`conflictRows`)
  - `apps/shared/offline/useOutboxSync.js` (`resolveConflict`)
  - `apps/shared/api.js` (`updateObservationApi`)
  - `apps/shared/StoreProvider.js` (`editUnsent`)
  - `apps/mobile/pages/Records.js` (edit form for `draft`/`queued`)
  - `apps/mobile/pages/PhoneRecords.js` (conflict view)
- Test: `apps/shared/test/offline-sync.test.js`, `apps/shared/test/offline-sync-status.test.js`

**Interfaces:**
- Consumes: the engine's existing conflict path. On a `conflict` answer the record gets `state: 'conflict'` and `server` = the server copy. That is already tested in `a conflicting edit keeps the server copy...`.
- Produces:
  - `editRecord({ userId, obs, changes }) → record`: `{ id: obs.id, kind: 'edit', step: 'observation', specimen_id: obs.specimen_id, base_version: obs.version, observation: <changed fields among height_cm, morphology, notes> }`
  - `updateObservationApi(id, changes, { token })`: `PATCH /observations/:id` with `{ ...changes, version }`
  - `MINE_COMMENT = "Edited on two devices before syncing. Kept the version from this phone."`
  - `THEIRS_COMMENT = "Edited on two devices before syncing. Kept the version from the other device."`
  - `resolveConflict({ outbox, addComment, id, choice: 'mine'|'theirs' }) → { ok, message? }`:
    - `'mine'` sets `{ base_version: server.version, resolution: 'mine', state: 'pending', server: null, error: null }`
    - `'theirs'` calls `addComment(id, THEIRS_COMMENT)` and removes the record only if that call was `ok`
  - Engine: an accepted edit with `resolution === 'mine'` posts `MINE_COMMENT` before it leaves the outbox. A failed comment is logged, and the edit still counts as done.
  - `conflictRows(record) → [{ field, label, mine, theirs }]`, only where they differ, in order Height, Appearance, Notes
  - Store: `editUnsent(obs, changes) → { ok, queued?, message? }`:
    - online: `PATCH`
    - no connection or `res.offline`, on the phone: the edit goes to the outbox through `saveOnPhone`
    - `409 VERSION_CONFLICT` online: show its message
  - Store: `resolveConflict(id, choice)`

- [ ] **Step 1: Write the failing tests:**
  - `editRecord carries base_version and only the changed editable fields`
  - `keep mine resends with the server version and adds a comment`: after `resolveConflict` and a run, the server row has the phone's `height_cm`, and `server.state.comments` holds `MINE_COMMENT` once
  - `keep mine while offline keeps the choice and sends the comment after the edit lands`: the first run has the network down and the record stays pending with `resolution: 'mine'`; the second run sends the edit and then the comment
  - `keep theirs removes the phone's edit and adds a comment`
  - `keep theirs keeps the conflict when the comment can't be sent`: `addComment` answers `{ ok: false, offline: true }`, and the record is still `conflict`
  - `conflictRows lists only fields that differ`
- [ ] **Step 2:** Run `node --test` in `apps/shared`. Expected: FAIL.
- [ ] **Step 3:** Implement the shared pieces. Run again. Expected: PASS. The existing `never resolved` behaviour (two runs send nothing) still passes.
- [ ] **Step 4:** The UI, exact copy:
  - **RecordDetail edit form:** for the botanist's own `draft`/`queued` record, an "Edit record" section with Height, Appearance and Notes, and a secondary "Save changes" that calls `editUnsent`. The primary button stays "Send for review".
  - **Conflict view** in PhoneRecordDetail (UI E), when `state === 'conflict'`:
    - a warning `Notice`: "This record was changed on another device before this phone sent its changes. Choose which version to keep."
    - a table with the columns "Field", "This phone" and "Other device", built from `conflictRows`
    - a primary "Keep this phone's version" and a secondary "Keep the other version"
    - toasts: "Kept this phone's version" or "Kept the other device's version"
- [ ] **Step 5:** Run all checks including `expo export`, then commit `CTIP-67: ask the botanist when two devices edited one record`. Check the identity.

### Task 10: Airplane-mode test run and docs (all stories)

**Files:** Create `docs/testing/offline-mode-test.md`. Update outside git: `CLAUDE.md` in the main checkout, and the current `final-stretch-sprint.md` (ask the user which copy is current: the repo root, Desktop and OneDrive each have one).

- [ ] **Step 1:** Write the test script: one table row per case, with the columns Steps / Expected / Actual / Pass or fail / Date / Phone. The cases are 1 to 8 from the old plan's Task 10:
  1. Airplane-mode capture, for a new plant and a revisit
  2. Airplane mode turned on mid-upload
  3. App killed while sending
  4. An APK installed over 2 unsent records
  5. Sign-out and another botanist on the same phone
  6. The two-phone conflict, and making a tag offline
  7. Species search offline
  8. `run-as` fails on the release build, and `PRAGMA cipher_version` shows

  Add the Task 7 phone checks from the ledger as case 9.
- [ ] **Step 2:** Commit `CTIP-68: offline mode test script`, then hand it to the user. The user builds the release APK (`npm run mobile:build:apk`, an EAS account step) and runs the cases. The executor does not.
- [ ] **Step 3:** For every failed row the user reports, apply superpowers:systematic-debugging. Fix with a failing test first, in one commit per fix that starts with the story key.
- [ ] **Step 4:** Update `CLAUDE.md`:
  - **Connectivity:** offline mode is built on the branch.
  - **Current status:** the routes, tests and migration count.
  - **Repository structure:** `apps/shared/offline/` and `apps/mobile/offline/`.
  - **SDK:** Expo SDK 58, not 57.
  - **Sprint doc:** add a reassessment line for `POST /sync`, and list which stories may move to Done (only those whose every criterion has a passing test or test row).

### Task 11: Whole-branch review and one fix pass

- [ ] **Step 1:** Run `../subagent-driven-development/scripts/review-package docs/superpowers/plans/2026-11-08-mobile-offline-mode-completion.md aaeb809 HEAD`.
- [ ] **Step 2:** Dispatch one reviewer on the most capable model. It uses `superpowers:requesting-code-review`'s `code-reviewer.md` with the package, both plan files, `docs/architecture/offline-sync.md`, this plan's Review Focus verbatim, and the ledger's `Ruling:` and `minor (deferred)` lines. Ask it to look hardest at Task 7, which has had no review.
- [ ] **Step 3:** Re-grade each finding by what a botanist would meet.
  - Critical and Important: fixed in one pass, each with a failing test first, then the full suite. Ledger it as `Final: fixed ... RED→GREEN, suite N/N`.
  - Minor: ledgered as `Final: minor (deferred)`.
- [ ] **Step 4:** Commit the fixes under the story key each touches, and check the identity.

### Task 12: Push and pull request (only after the user says go)

- [ ] **Step 1:** Run `git log --format='%h %an <%ae> | %cn <%ce>' aaeb809..HEAD`. Expected: every line is DinoDoesThings on both sides. Also run `git log --format=%B aaeb809..HEAD | grep -ci co-authored-by`. Expected: `0`. If either fails, stop and ask; never rewrite history without the user.
- [ ] **Step 2:** Run `git credential-manager github list`. Expected: only `DinoDoesThings`.
- [ ] **Step 3:** With the user's go-ahead, run `git push -u origin feature/CTIP-16-offline-mode`.
- [ ] **Step 4:** Draft the PR description for the user to paste on github.com, while signed in as DinoDoesThings:
  - stories CTIP-44, 83, 84, 16, 66, 67, 68, 116
  - test counts
  - the second-person contract review required (Tasks 3, 8a)
  - the migration push (after telling Amberlyn)
  - a link to the test script
  - the deferred minors
  - no Claude attribution line
- [ ] **Step 5:** After merge, delete both workspaces (`.superpowers/sdd/2026-11-07-mobile-offline-mode/` and this plan's), and remind the user to move the Jira stories.

## Schedule (code freeze Thu 19 Nov)

| When | Tasks |
|---|---|
| Sun 8 to Mon 9 Nov | 0, 8a, 8b |
| Tue 10 to Wed 11 Nov | 9 (drop first if behind), 10 steps 1 and 2 |
| Thu 12 to Sat 14 Nov | the user's phone run, 10 steps 3 and 4 |
| Sun 15 to Mon 16 Nov | 11 |
| Tue 17 Nov | 12, Amberlyn's migration push, contract review |
| Wed 18 Nov | merge and install the APK on the demo phones |
