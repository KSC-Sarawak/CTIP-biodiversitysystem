# Branch `rick-18-Nov`: unpublish a published plant

*18 Nov 2026. The sprint has closed, so this work has no Jira ticket.*

Officers and admins can now take a plant that is already public off public view, with a
reason, and put it back later. The botanists who tagged or recorded the plant are told
both times.

**State of the branch:** nothing committed yet. `main` here means `620348e`.

**Affects the team:** a database migration, a change to the API contract (needs two
approvals) and a new API route. See [Before this goes live](#before-this-goes-live).

## Before this goes live

**Order matters:** run the migration before redeploying the API. The new route calls
`set_plant_published()`, which does not exist until the migration runs.

- [x] Apply `supabase/migrations/20261118120000_plant_unpublish.sql` to **Daun Sense Test**
      and check it there (see [How it was tested](#how-it-was-tested)).
- [ ] Get two approvals for the `packages/api-contract/openapi.yaml` change.
- [ ] Try it by hand on the test database (see [How to check it by hand](#how-to-check-it-by-hand)).
- [ ] Apply the migration to the live **Daun Sense** project.
- [ ] Redeploy the API on Render.
- [ ] **Decide:** remove the leftover `20261118102307 reject_published` row from the
      test database's migration history (see [Test database cleanup](#test-database-cleanup)).

## Why it works this way

Before this change, nobody could reject a plant once it was published. The database
only accepts a decision on a record that is waiting for review, so an approved record
gets `409 WRONG_STATUS`.

The obvious fix, allowing an approved visit to be rejected, does not work. A plant stays
public as long as **any** of its visits is approved (`plantStatus()` in
`apps/shared/selectors.js`). Rejecting one visit of a plant that has two approved visits
leaves the plant public.

So the switch is on the **plant**, not the visit:

- Unpublishing hides the whole plant from visitors: catalogue, map, QR page and photos.
- Its visits keep their decisions, so the review history is not rewritten.
- It can be undone with **Publish again**.
- A reason is required, and it is shown to staff and sent to the botanists.

## What changed from `main`

### Database: `20261118120000_plant_unpublish.sql`

- `specimens` gets four columns: `is_withdrawn` (default false), `withdrawn_reason`,
  `withdrawn_by` and `withdrawn_at`.
- New function `set_plant_published(p_specimen_id, p_published, p_reason)`:
  - Officers and admins only (`42501` for anyone else).
  - A reason is required to unpublish (`CTRQ0`).
  - `CTNF0` for an unknown or deleted plant, and `CTST0` when the plant is already in
    that state. These are the same codes `review_observation()` uses.
  - Saves who did it and when, and clears all of it on publish.
  - Notifies whoever tagged the plant and whoever recorded a visit, except the person
    making the change, with the new types `plant_unpublished` and `plant_republished`.
- `guard_specimen_update()` now refuses direct changes to the four columns, so the
  reason and the notification cannot be skipped by updating the table. Its other checks
  are as they were in `20261105230000`.
- `public_plants()`, `public_observation_photos()` and `public_plant_by_tag()` leave out
  withdrawn plants. Otherwise they are the same as `20261103120000` and `20261031000000`.

### API

- New route `POST /v1/specimens/:id/publish`, officer and admin only. The body is
  `{ is_published, reason? }`, and `reason` is required when `is_published` is false.
  The handler is in `services/api/src/field.js`.
- It also sends a best-effort push notification, the same way review decisions do.
- Plant responses now include the four new columns.
- Contract: the new path, the new `Specimen` fields and the two new notification types.
- New tests in `services/api/test/plant-publish.test.js` cover:
  - unpublish, with who, why and when saved
  - publish again
  - a missing or blank reason
  - a botanist refused
  - doing it twice
  - an unknown plant
  - unknown fields refused

### Apps

- **Shared:**
  - `isPublic` in `selectors.js` is now also false for a withdrawn plant, and plant
    views carry a `withdrawn` flag.
  - New store action `setPlantPublished()` and API call `setSpecimenPublishedApi()`.
- **Mobile** (`PlantPage.js`):
  - **Unpublish plant** opens a reason box, then asks for confirmation.
  - A withdrawn plant shows staff a "Taken off public view" notice with the reason, who
    did it and when, plus a **Publish again** button.
  - The Review button was shown only to `officer`; admins now see it too.
  - Notifications show icons for the two new types.
- **Web** (`Specimen.jsx`):
  - **Unpublish plant** and **Publish again** in the plant header.
  - Unpublishing asks for a reason, then for the typed word `UNPUBLISH`, like
    approving asks for `PUBLISH`.
  - Staff see a warning box with the reason.
- **Web, a related fix:** the review panel and each visit card used to show Approve,
  Return and Reject on records that were already decided. Those buttons always failed
  with "no longer waiting for review". They are now hidden for decided records, with a
  note pointing to **Unpublish plant**. The visit button that opens the species picker
  is now called **Change species**.

## How it was tested

- API tests: 296 pass, including the contract check that every route is in
  `openapi.yaml`.
- Shared tests: 222 pass. Mobile unit tests: 36 pass. The `agent-*` suites need an
  Android emulator and were not run.
- Web: lint is clean and the production build works.
- **On Daun Sense Test**, using a real officer, a real botanist and a published plant,
  inside a transaction that was rolled back so no data changed:

| Check | Result |
|---|---|
| Botanist tries to unpublish | Refused, `42501` |
| Officer unpublishes with a blank reason | Refused, `CTRQ0` |
| Direct `update specimens set is_withdrawn = true` | Refused, `42501` |
| Officer unpublishes with a reason | Saved with the reason trimmed and the officer recorded; 1 notification |
| Visitor functions | Plant gone from `public_plants()`, `public_observation_photos()` and `public_plant_by_tag()` |
| Unpublish again | Refused, `CTST0` |
| Publish again | Reason cleared, plant back in `public_plants()`, 1 "republished" notification |
| Other officer edits to the plant | Still work |

## How to check it by hand

Run `npm run api` and `npm run web`. Both `.env` files already point at Daun Sense Test.
You need an officer or admin account and a plant that is already public.

1. In a private window, signed out, note a public plant's tag.
2. Signed in as officer or admin, open that plant and click **Unpublish plant**.
   Clicking Unpublish with no reason should be refused.
3. Give a reason, type `UNPUBLISH`, and check the "Taken off public view" box appears.
4. Refresh the private window. The plant should be gone from the list, the map and its
   tag page.
5. Sign in as the botanist who recorded it. A notification should show your reason.
6. Click **Publish again**. The plant should be back for visitors, and the botanist
   should be told.
7. As a botanist, check there is no Unpublish button.

## Test database cleanup

Before this work, someone applied a migration named `20261118102307 reject_published` to
Daun Sense Test. It is not in the repo. It changed `review_observation()` so an
approved visit could be rejected, which is the approach rejected above. With it in
place, clicking Reject on an approved record on the web really rejected that visit, while
the repo, the contract and the API tests all say it should be refused.

- `review_observation()` on the test database is now back to the repo version
  (`20261029120000_approve_requires_species.sql`). Rejecting an approved visit is
  refused again with `CTST0` (checked).
- Nobody had used it: no approved record was rejected after it was applied.
- **Still there:** the `20261118102307 reject_published` row in the test database's
  migration history. It no longer matches the database. Removing it was held back for
  a decision. While it stays, `supabase db push` may report a remote migration that is
  not in the repo.
- `plant_unpublish` is recorded on the test database as version `20261118112022`, the
  time it was applied, not `20261118120000` as in the file name. Earlier migrations
  applied the same way show the same kind of mismatch.

## Not covered

- Photos are in a public storage bucket, so anyone who already has a photo's direct link
  can still open it after the plant is unpublished. This was already true before.
- The staff map (`GET /distribution`) still shows withdrawn plants. It is not public, so
  this is on purpose.
- Two repo migrations are not on Daun Sense Test yet:
  `20261116120000_push_tokens_server_only` and `20261117120000_va72_mfa_and_avatar`.
  They are unrelated to this change, but the second one affects signing in with
  two-step codes.
