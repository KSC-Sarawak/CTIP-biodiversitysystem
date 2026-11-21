# Branch `rick-fix-officer-tag-plant-page`: unpublish, review and send back a tagged plant

*Written 21 Nov 2026. Based on `main` at `9575812`. The database, API, shared code, the
**web** tag page and the **mobile app** are done. Section 2 lists the mobile work, now
implemented (see "Mobile: done" below).*

The rules are **RBAC D17 and D18** in [RBAC.md](../../RBAC.md). Read those first. In short:

- **D17.** Only an **Officer** can **unpublish** a tagged plant, and must give a reason. Only an Officer can **publish it again**, and that is a separate step. Admins and botanists cannot do either.
- **D18.** An Officer can **review** a plant only while it is **unpublished**. In review mode they can:
  - change the species, the photos and the "hide the exact location" switch as a **draft**;
  - **save** the draft;
  - or **send the plant back** to the botanist with a reason. Its latest approved observation becomes `returned`.
- **The botanist's side.** They see it as **"Sent back for review"**, fix it and resend it. It then goes through normal review again.
- **Publishing again.** The plant **stays unpublished** until an Officer presses **Publish again**. Approving the observation does **not** publish it. Publish again is refused while any observation is waiting for review (`synced`) or with the botanist (`returned`).
- **Published plants.** A published plant has **no review option**. To change one, the Officer unpublishes it first.

---

## 1. What changed underneath (mobile gets this for free)

| Layer | Change |
|---|---|
| Database | `supabase/migrations/20261121120000_rbac_d17_d18_unpublish_tagged_plant.sql`. New columns `specimens.is_withdrawn`, `withdrawn_reason`, `withdrawn_by` and `withdrawn_at`. New function `set_plant_published()` (officer only). `review_observation()` now accepts `return` on an approved observation of an unpublished plant. Visitor functions leave unpublished plants out. New notification types: `plant_unpublished`, `plant_republished`. |
| API | `POST /v1/specimens/:id/publish` with `{ is_published, reason? }`, **officer only**. Errors: 409 `WRONG_STATUS` (already in that state), 409 `REVIEW_IN_PROGRESS` (an observation is waiting for review or with the botanist), 409 `NOTHING_APPROVED`, 422 when the reason is missing. **Send back** has no new route: it is `POST /v1/observations/:id/reviews` with `decision: "return"` and a comment, on the approved observation. Push messages for unpublish and publish again use `data: { route: 'tag', params: { qr } }`. |
| `apps/shared/api.js` | `setSpecimenPublishedApi(id, is_published, reason)` |
| `apps/shared/StoreProvider.js` | Plants now carry `is_withdrawn`, `withdrawn_reason`, `withdrawn_by` and `withdrawn_at`. New `setPlantPublished(plantId, isPublished, reason)` returns `true` or `false` and shows its own message. `setPlantSpecies()` now returns `true` or `false`. |
| `apps/shared/selectors.js` | `plantView()` adds `withdrawn`, and `isPublic` is now false for an unpublished plant. Visitors on mobile therefore stop seeing unpublished plants with no mobile change. |
| `apps/shared/permissions.js` | New permission `publishPlants` (officer only). Use `can(role, "publishPlants")`; never check the role name directly. |
| `apps/shared/tokens.js` | New status `unpublished`: label "Unpublished", tone `warning`. |

The web version to copy from is `apps/web/src/pages/Specimen.jsx`. Look at `ReviewModePanel`, `UnpublishPanel` and the header buttons and callouts at the top of `Specimen()`.

---

## Mobile: done (21 Nov 2026)

| Spec | Where |
|---|---|
| 2.1 Plant page: status chip ("Unpublished", "Sent back for review" / "Sent back to botanist"), Unpublish (reason + type `UNPUBLISH`), Publish again (type `PUBLISH`, disabled with the reason while blocked), Review tag, the Unpublished and Sent back callouts, "See the decision" removed, hide-location switch for officers and admins (inside the review while an observation waits) | `apps/mobile/pages/PlantPage.js` (`TaggedPlant`, `TypedConfirm`) |
| 2.2 Review mode: species, photo captions and removals, hide-location switch as a draft; Save changes; Send back to botanist (reason); Discard | new screen `apps/mobile/pages/PlantReview.js`, route `plantReview` (needs `review`) |
| 2.3 Review screen: on an unpublished plant, "Approve" says the plant stays unpublished | `apps/mobile/pages/Review.js` |
| 2.4 Returned record: take or pick new photos, edit captions, remove photos, saved just before "Resubmit for review" | `apps/mobile/pages/Records.js`; `setObservationPhotos()` in `apps/shared/StoreProvider.js` now also uploads phone photos (`isNew`) |
| 2.5 Notifications: `plant_unpublished`, `plant_republished` icons; tapping opens the plant | `apps/mobile/pages/Notifications.js` |

Revisit form (`apps/mobile/pages/AddPlant.js`, `Revisit`), 21 Nov 2026: separate **Appearance** (starts as the plant's latest description) and **Notes** fields, and an empty height means "not measured this time" instead of copying the last height. The plant shows its newest approved height and description that were actually recorded (`plantView()` in `apps/shared/selectors.js`).

Checked: mobile tests (101 pass) and `npx expo export --platform android` (bundles). Not yet
checked on a device or emulator: run the checklist in section 3 on the APK.

## 2. What the mobile app needs

### 2.1 `apps/mobile/pages/PlantPage.js`: the plant page

**Status chip.** Today it shows `<Chip status={p.status} />`, which still says "Published" for an unpublished plant. Replace it with the same rule the web uses:

```js
const pending  = obs.find((o) => o.status === 'synced');
const returned = obs.find((o) => o.status === 'returned');
const stage = pending ? 'synced' : p.withdrawn ? (returned ? 'returned' : 'unpublished') : p.status;
// When stage is 'returned' and the plant is unpublished, label it
// "Sent back for review" for a botanist, or "Sent back to botanist" for officers and admins.
```

**Officer buttons.** Show these only when `can(role, 'publishPlants')`:

| Plant state | Show |
|---|---|
| Observation waiting for review | The existing "Review this record" button. No change. |
| Published (`p.status === 'approved' && !p.withdrawn`) | **Unpublish plant**. It opens a reason box (required), then a confirm step where the officer types `UNPUBLISH`. **Remove "See the decision"**, which currently opens the review screen for decided records. |
| Unpublished | **Review tag**, which opens review mode (2.2), and **Publish again**. Publish again is disabled with a hint while an observation is `synced` or `returned`, or when nothing is approved. Its confirm step asks the officer to type `PUBLISH`. |

**Unpublished callout.** Show it to all staff when `p.withdrawn`. It reads "Unpublished." followed by `withdrawn_reason`, then "By {name} on {date}. Visitors cannot see this plant."

**Botanist callout.** Show it when the plant is unpublished and the botanist recorded the returned observation. It reads **"Sent back for review"**, followed by the officer's reason, and has a **Fix and resend** button that opens the botanist's records.
- The reason is the latest `return` review on that observation, from `db.reviews`.
- Other botanists never receive that observation (RBAC D16), so they only see "Unpublished".

**Hide-location switch.** Officers and admins see it on the plant page (RBAC D15). While an observation of the plant is waiting for review, or an officer has review mode open, the switch is part of that review instead, so there are never two switches for one plant. Hiding saves at once; showing the exact location asks first.

### 2.2 Review mode (new): officer, unpublished plant only

This can be a new screen or a section on `PlantPage`. Keep a **draft**, and save nothing until the officer presses a button.

**What the officer can change:**
- **Species:** a picker plus "New species", with the botanist's guess shown.
- **Photos:** shown right in review mode, each with an editable caption and a Remove/Undo button. Removals and caption changes are part of the draft. Officers **cannot add** photos (RBAC D1); the screen says to send the plant back and ask the botanist for a new photo.
- **Hide exact location:** a switch, locked on for Endangered species (`hideLocationRule()`).

**Buttons:**
- **Save changes:** disabled until something changed. It asks for confirmation and lists what changed. It applies species first, then the location switch, then photos, using the existing `setPlantSpecies`, `setPlantLocationHidden` and `setPlantPhotos`.
- **Send back to botanist:**
  - Needs a reason.
  - Shown only when there is an approved observation and none is already `returned`.
  - On confirm, it saves the draft and then calls `reviewObservation(approvedObs.id, 'return', reason)`.
- **Discard changes:** asks first if there are unsaved changes.

After any of these the plant **stays unpublished**. Say so on the screen.

### 2.3 `apps/mobile/pages/Review.js`: the review screen for one record

- When the plant is unpublished (`plant.withdrawn`), the approve button says **"Approve"**, not "Approve & publish". Add the line: "The plant stays unpublished. Publish it again from the plant page when it is ready."
- Decision buttons only for `status === 'synced'`. A decided record shows its decision only, because the database refuses anything else.

### 2.4 Fixing a returned record: photos (botanist)

On web, the returned record in **My records** (`apps/web/src/pages/Records.jsx`) now has an **Add or edit photos** button:
- The botanist can add new photos, edit captions and remove photos on **their own** returned observation.
- The changes are a draft, saved just before **Send again**. If a photo fails, the record is not sent.
- The store function is the new `setObservationPhotos(obsId, before, after)` in `apps/shared/StoreProvider.js`.

The API already allowed this; only the screen was missing. Check whether mobile's `Records.js` needs the same.

### 2.5 `apps/mobile/pages/Notifications.js`

Add the two new types to `LOOK`, and open the plant when one is tapped. The notification's `related_table` is `'specimens'` and its `related_id` is the plant id. Look up `qr_id` from `db.plants`.

```js
plant_unpublished: ['eyeOff', 'warning'],
plant_republished: ['eye', 'success'],
```

The push `data.route` is `'tag'` with `params.qr`, so check the push handler opens the plant page for it.

---

## 3. Check before merging (mobile)

- [ ] **Officer, published plant:** Unpublish is shown; Review tag and See the decision are not. Unpublishing without a reason is blocked.
- [ ] **Officer, unpublished plant:**
  - [ ] the chip says "Unpublished", never "Published";
  - [ ] the reason callout shows;
  - [ ] Review tag opens review mode;
  - [ ] Save changes keeps the plant unpublished.
- [ ] **Send back:** the observation becomes `returned`, and Publish again is disabled with its hint.
- [ ] **Botanist who recorded it:**
  - [ ] sees "Sent back for review", the reason and Fix and resend;
  - [ ] after resending, the officer sees "Review this record";
  - [ ] after approving, the plant is still unpublished.
- [ ] **Publish again:** after the officer presses it, the plant shows in the visitor catalogue and map again.
- [ ] **Admin:** no Unpublish, Review tag or Publish again buttons, but the hide-location switch still works.
- [ ] **Another botanist:** sees "Unpublished" only, with no review comments.
- [ ] **Visitor:** an unpublished plant is gone from the catalogue and map, and its QR page says it is not published.

## 4. Take note

- **Apply the migration** `20261121120000_rbac_d17_d18_unpublish_tagged_plant.sql` to Supabase before testing. Without it, the API returns database errors for the new columns.
- **`packages/api-contract/openapi.yaml` changed** (the new route, the `Specimen` fields, the notification types and the reviews wording). Per team rules it needs two approvals.
- **One web test changed:** `apps/web/tests/agent-audit.spec.js`. It used to expect "Review tag" on any plant; it now follows the D17 and D18 rules.
- **This replaces the unmerged commit `3c63618`** on `rick-18-Nov`. That commit let admins unpublish, which is not allowed under D2. Do not merge that commit.
