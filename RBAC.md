# Roles and permissions

**Status:** agreed 19 Nov 2026. This file is the single source of truth for what each
role may do. If code, a ticket or another document disagrees with it, this file wins:
fix the other thing, or change this file first and tell the team.

## How this was decided

When sources disagree and nobody has made a decision, the higher one wins:

1. **Client scope** (`docs/Project Scope-2.pdf`)
2. **System Design Proposal** (`docs/COS30049CTIP - System Design Proposal[DRAFT].pdf`)
3. **Later team decisions**: Nicole's role table for IoT (quoted in
   `docs/updates/rick-extra-CTIP-security-fix.md`), the threat model
   (`docs/security/threat-modelling.md`), Jira tickets

Where the team **deliberately decided** something on 19 Nov 2026, the
[Decision log](#decision-log) records it. Those decisions replace whatever the sources
above said, and the log names what each one overrides.

Each rule below names its source in brackets:

- **[Scope]**, **[Proposal]**, **[IoT table]**, **[Threat model]**: the documents above.
- **[D1]** to **[D10]**: decisions from the log.
- **[Existing]**: current behaviour that no source disputes, kept as it is.

---

## Words we use (read this first)

**Do not say just "record".** It can mean four different things, and mixing them up is how
features end up built for the wrong thing. Always use one of these terms:

| Term | What it is | One of these per… | Who creates it | In the code |
|---|---|---|---|---|
| **Species** | A **kind** of plant in the catalogue, for example *Nepenthes rafflesiana*: scientific and common names, family, conservation status, ecology, cultural notes, reference photos. It can be published or unpublished. | kind of plant | Officer | `species` table, `/species` routes |
| **Tagged plant** | **One individual plant** in the forest with a QR tag on it: tag number, GPS location, who registered it, its linked species (or the botanist's proposed name), and the hide-location flag. It holds no measurements. | physical plant | Botanist (by registering it) | `specimens` table, `/specimens` routes ("specimen" = tagged plant) |
| **Observation** | **One visit's data** about one tagged plant: date, height, morphology, notes, GPS, photos. Each observation goes through review on its own. | visit | Botanist | `observations` table, `/observations` routes |
| **First observation** | The observation made **at the moment the plant is registered** and tagged. | tagged plant (exactly one) | Botanist | an `observations` row; the first one for that `specimen_id` |
| **Revisit** | **A later observation** of a plant that is already tagged. It is a **new observation** and does not change earlier ones, so the plant builds up a history (for example height over time). | each later visit | Botanist | a new `observations` row for an existing `specimen_id` |

### How they fit together

```
Species  (Nepenthes rafflesiana, Endangered)        ← catalogue, Officer
  └── Tagged plant  NIAH-0031  (GPS, tag, hide flag)    ← one real plant, Botanist registers
        ├── Observation 1  (first observation, 12 Oct)  ← reviewed by an Officer
        ├── Observation 2  (revisit, 3 Nov)             ← reviewed by an Officer
        └── Observation 3  (revisit, 18 Nov)            ← reviewed by an Officer
```

- **A species has many tagged plants.** A tagged plant belongs to at most one species. It
  has none until an Officer links it; until then it carries only the botanist's
  **proposed species name**.
- **A tagged plant has many observations**: one first observation, then any number of
  revisits.
- **Officers review observations, not tagged plants or species.** "Approve" always means
  approving one observation.

### Other terms

| Term | Meaning |
|---|---|
| **QR tag** | The physical label and its id (for example `NIAH-0031`). States: `unassigned` (unused), `assigned` (on a tagged plant), `retired`, `damaged`. A tag is on at most one tagged plant. |
| **Kept tag** | An unused tag saved on one botanist's phone so they can register plants offline. No one else can use it. (Code: `batch_label = 'reserved'`.) |
| **Proposed species name** | What the botanist thinks the species is, as free text. It becomes a link to a species only when an Officer confirms it. |
| **Review** | An Officer's decision on one observation: **approve**, **return** (back to the botanist to fix, reason required) or **reject** (reason required). |
| **Observation status** | `draft` (being written) → `queued` (saved on the phone, not sent yet) → `synced`, shown as **Waiting for review** → `approved`, `returned` or `rejected`. A returned observation goes back to `synced` when the botanist resends it. |
| **Endangered plant** | A tagged plant whose species' conservation status is **Endangered**. |
| **Hidden plant** | A tagged plant an Officer and Admin has set to **hide its location** (code: `endangered_override`), for example a endangered plant. Treated exactly like an endangered plant for location. |
| **Published** | A species visitors can see. A tagged plant appears to visitors only when its species is published **and** it has at least one approved observation. |
| **Observation photo** vs **species photo** | An observation photo is a photo of a specific individual plant. A species photo is a reference picture in the catalogue. Species photos can be observation photos. Species photos can also be overwritten to be a non-observation photo. Different owners, different rules. |
| **Sensor node** | An IoT device installed next to a tagged plant (usually an endangered one). It sends readings (temperature, humidity, soil moisture, motion, GPS) and webcam images. |
| **Alert** | Raised automatically when a sensor node reads something wrong: a reading out of range, motion, the node moved, or the node went silent. Each alert has a severity (`low`, `medium`, `high`, `critical`) and a status: `open` → `acknowledged` → `resolved`. |
| **Alert routing** | An **Admin-only setting** that decides **who is notified** (bell and phone push) when a new alert is raised. For each officer or admin, the admin picks which nodes (some or all) and the minimum severity. Someone with no routing setting is notified about every alert. Routing only controls notifications: every officer and admin can still **see and act on every alert**. (Code: `alert_routes` table, `/alert-routes` routes.) |
| **Assigning an alert** | Naming the **one person responsible** for one alert. They get an "Alert assigned to you" notification and push. Different from routing: routing is "who hears about new alerts", assigning is "who deals with this alert". |
---

## The four roles

| Role | Who | Signs in? | Main app |
|---|---|---|---|
| **Visitor** | Park visitors, guides, researchers, the public | No | Website, public pages of the app |
| **Botanist** | Corporation field staff who register tagged plants and record observations | Yes | Mobile app (offline) |
| **Officer** (Conservation officer) | Staff who review observations and look after the species catalogue | Yes | Web portal (mobile app too) |
| **Admin** (System administrator) | Staff who run the system: accounts, sensors, security | Yes | Web portal |

**In one line each:**

- A **Botanist records** tagged plants and observations.
- An **Officer reviews and curates** them.
- An **Admin runs the system**: Admins do not do data work [D2].

### Who sees exact locations

| | Visitor | Botanist | Officer | Admin |
|---|:-:|:-:|:-:|:-:|
| Ordinary tagged plants | ✅ exact | ✅ exact | ✅ exact | ✅ exact |
| Endangered or hidden plants | ❌ **not on the map at all**, a note instead | ✅ exact [D10] | ✅ exact | ✅ exact |

---

## Rules for every signed-in role

- A new account gets **no role and no access until an Admin approves it** and gives it a
  role. [Threat model T25]
- Every staff account must use **two-step sign-in** (authenticator app). [Team decision, 5 Nov]
- An account an Admin created with a temporary password must **choose its own password**
  before doing anything else. [Existing, F-16]
- The role always comes from the server (the token's `user_role` claim), never from
  anything the app sends. [Threat model T2]
- **Everyone signed in can:**
  - sign in and out, reset a forgotten password, change their own password;
  - recover a lost authenticator through the email link;
  - edit their own name, username, phone and photo;
  - read their own notifications;
  - view and print a QR tag's code;
  - use the Discussion board (see each role).
- **Nobody can:**
  - change their own role, turn off their own account or change their own email;
  - edit or delete the audit log (not even an Admin). [Threat model T7]

---

## 👁 Visitor (not signed in)

### Can
- Browse and search the public catalogue: **published species** only, with their species
  photos and information. [Scope, Proposal]
- **Scan a QR tag** (or open its link) to see that tagged plant's public page. [Scope:
  "QR-enabled educational content"]
- See **published tagged plants** on the map at their **exact location**, as long as the
  plant is **not hidden** and its species is **not Endangered**.
  [D9]

### Cannot
- See an **endangered or hidden plant on the map at all**: no pin and no rough area. [D9]
  - Its public page (from scanning its QR tag) still shows the species information, with a
    note in place of the location: **"This plant's exact location is hidden to protect it."**
- See unpublished species, or tagged plants that are not yet public (no published species,
  or no approved observation).
- See observations still in review, the proposed species name, who registered a plant,
  sensors, alerts, users, reports or discussions.
- Create or change anything.

---

## 🌿 Botanist

### Can
- **Register a tagged plant** on an unused QR tag, together with its **first
  observation** (GPS, photos, measurements) and a proposed species name. [Scope] Botanists
  are the **only** role that registers tagged plants. [D1]
- **Record revisits:** add a new observation to any existing tagged plant. Botanists are
  the **only** role that creates observations. [Scope, D1]
- **Propose a species name** for a tagged plant (typed or picked). An Officer confirms it
  and links the tagged plant to the species. [D3]
- Work **offline** and sync later; run a field survey. [Proposal]
- Edit or delete their **own** observations that have not been sent yet (`draft` or
  `queued`). [Existing]
- Fix and **resend their own observation** after an Officer returned it, with an optional
  reply. [Existing]
- Add, caption and remove observation photos on their **own** observations, but not
  while that tagged plant has an observation waiting for review. [Existing]
- **QR tags** [D5]:
  - make **one tag at a time** in the field when no printed tag is at hand;
  - keep up to **23 unused kept tags** on the phone for offline surveys (up to 20 per request);
  - release their own unused kept tags.
- See **all tagged plants with their exact locations, including endangered and hidden
  plants**. Botanists are corporation staff doing conservation work in the forest. [D10]
- See **published species**. [Existing]
- See **their own** observations and the review decisions and comments on them. [Threat
  model: "view own submissions"]
- **Discussion:**
  - start threads (public, or shared with chosen people or roles) and reply;
  - edit or delete their own posts. [Existing]

### Cannot
- See **other botanists' observations**. They can see the other botanists' tagged plants, but
  not the observations those botanists recorded on them. [Threat model]
- Add a revisit to a tagged plant that already has an observation **waiting for review**.
  [Existing]
- Change an observation after sending it, except by resending a returned observation.
- Link a tagged plant to a species, set the hide-location flag, change a tagged plant's
  QR tag, or delete a tagged plant. [D3, D4]
- Approve, return or reject observations.
- Create, edit, publish or delete species, or see unpublished species. [Scope gives the
  catalogue to Officers, D3]
- Print tag batches, retire tags, or use another botanist's kept tags.
- See sensors, sensor readings or images, alerts, reports, the user list or the audit log.
  [IoT table] *(The IoT table's reason, "a node's position gives away the plant's spot",
  no longer applies after D10. The rule stays until the team changes it.)*

---

## 📋 Officer (Conservation officer)

### Can
- **Review observations:** see **all** observations and **approve, return (with a reason)
  or reject** each one. Approving needs the tagged plant to be linked to a species.
  [Scope]
- **Correct an observation only through review:** return it with a reason so the botanist
  fixes it. [D7]
- **Tagged plants:**
  - link a tagged plant to a species;
  - set the **hide-location flag** (for example to hide a vulnerable plant);
- **Delete and restore tagged plants** (soft delete, restorable). [D4]
- See **exact locations** of all tagged plants. [Threat model T13/T18]
- **Species:**
  - add, edit, delete and restore species;
  - publish and unpublish them;
  - upload and manage species photos. [Scope]
- Edit or remove **observation photos** on any observation (for example to fix a caption
  or remove a bad photo). [Scope: "Upload plant photographs"]
- **QR tags:** print batches of any size, retire tags, and delete unused tags that are not
  on a tagged plant. [D5]
- **Reports:** view and export the observation and species reports. [Proposal]
- **Monitoring** [IoT table]:
  - see sensor nodes, live readings, history and webcam images;
  - give a node a private nickname;
  - see alerts and get notified about them;
  - **assign, acknowledge, add notes to and resolve alerts**.
- Get notified when an observation is sent or resent for review. [Existing]
- See the staff list (names, roles), for example to assign an alert. [Existing]
- **Discussion:** the same as a Botanist (start threads, reply, edit or delete their own
  posts). [D8]

### Cannot
- **Register tagged plants or create observations** (first observations or revisits).
  Officers review field work; they do not create it. [D1]
- Edit a botanist's observation directly. [D7]
- change a tagged plant's QR tag. [Existing]
- Register, edit or delete **sensor nodes**, change their alert limits, or decide who
  receives which alerts. [IoT table]
- Manage user accounts or read the audit log. [Threat model]
- Make kept tags (botanists' phones only). [D5]
- Delete other people's discussion threads or posts. [D8]

---

## 🛡 Admin (System administrator)

The Admin role is **system work only**: accounts, sensors, alerts and security. Admins can
**look at** all data but do not **change** species, tagged plants or observations, apart
from deleting and restoring tagged plants. [D2]

### Can
- **Users:**
  - see every account;
  - create accounts (by invitation email or with a temporary password);
  - approve new accounts and give them a role;
  - change a user's role, but not name and email;
  - turn accounts on and off;
  - delete accounts (restorable for 30 days, then removed for good). [Scope, Threat model]
  - set the hide-location flag
- **Sensor nodes:** register, edit (including alert limits) and delete nodes; manage device
  keys. [IoT table, Proposal]
- **Alert routing:** decide which officers or admins hear about which node's alerts, and
  from which severity. [IoT table]
- **Monitoring dashboard** [Scope, IoT table]:
  - see nodes, readings, history and images;
  - see alerts and get notified;
  - **assign, acknowledge, add notes to and resolve alerts**.
- **Audit log:** read sign-ins, failed sign-ins, MFA failures and data changes. [Threat model]
- **View**, read-only, all species (including unpublished), all tagged plants with exact
  locations, and all observations, so they can act on alerts and delete the right tagged
  plant. [D6]
- **Discussion moderation:** delete **anyone's** thread or post. [D8] Admins can also start
  threads and reply.

### Cannot
- **Delete and restore tagged plants** (soft delete). [D4]
- **Review observations** (approve, return or reject). [D2]
- **Change species:** add, edit, publish, delete, or manage species photos. [D2]
- Link a tagged plant to a species, or change a tagged plant's
  QR tag. [D2]
- Edit or remove observation photos. [D2]
- **Print, retire or delete QR tags.** [D5]
- View or export **reports**. [D2]
- **Register tagged plants or create observations.** [D1]
- Change their own role, turn off their own account, or delete their own account.
- Delete or turn off the **last active admin**.
- Turn on a deleted account before restoring it.
- Edit another person's discussion post. They can delete it, but not rewrite it.
- Edit the audit log.

---

## Summary table

✅ = can, ❌ = cannot, 👁 = read-only, "own" = only their own.

| Capability | Visitor | Botanist | Officer | Admin |
|---|:-:|:-:|:-:|:-:|
| **Species** | | | | |
| See published species | ✅ | ✅ | ✅ | ✅ |
| See unpublished species | ❌ | ❌ | ✅ | 👁 |
| Add, edit, publish, delete species; species photos | ❌ | ❌ | ✅ | ❌ |
| **Tagged plants** | | | | |
| See tagged plants | published only | all | all | 👁 all |
| Exact location of ordinary tagged plants | ✅ | ✅ | ✅ | ✅ |
| Exact location of endangered or hidden plants | ❌ not on map | ✅ | ✅ | ✅ |
| Register a tagged plant (with its first observation) | ❌ | ✅ | ❌ | ❌ |
| Propose a species name | ❌ | ✅ | ❌ | ❌ |
| Link to a species, set hide-location flag, change QR tag | ❌ | ❌ | ✅ | ❌ |
| Delete or restore a tagged plant | ❌ | ❌ | ✅ | ❌ |
| **Observations** | | | | |
| Record a revisit (new observation) | ❌ | ✅ | ❌ | ❌ |
| See observations | approved data on public pages | own | all | 👁 all |
| Edit or delete unsent observations | ❌ | own | ❌ | ❌ |
| Resend a returned observation | ❌ | own | ❌ | ❌ |
| Approve, return or reject an observation | ❌ | ❌ | ✅ | ❌ |
| Add observation photos | ❌ | own | ❌ | ❌ |
| Edit or remove observation photos on others' observations | ❌ | ❌ | ✅ | ❌ |
| **QR tags** | | | | |
| Make one tag in the field, keep offline tags | ❌ | ✅ | ❌ | ❌ |
| Print, retire, delete QR tags | ❌ | own kept tags only | ✅ | ❌ |
| **Everything else** | | | | |
| Reports (view, export) | ❌ | ❌ | ✅ | ❌ |
| See sensor nodes, readings, images | ❌ | ❌ | ✅ | ✅ |
| Handle alerts (assign, acknowledge, notes, resolve) | ❌ | ❌ | ✅ | ✅ |
| Register, edit, delete sensor nodes and limits | ❌ | ❌ | ❌ | ✅ |
| Alert routing | ❌ | ❌ | ❌ | ✅ |
| Manage users and roles, approve accounts | ❌ | ❌ | ❌ | ✅ |
| Audit log | ❌ | ❌ | ❌ | 👁 |
| Discussion: post, edit or delete own | ❌ | ✅ | ✅ | ✅ |
| Discussion: delete others' posts | ❌ | ❌ | ❌ | ✅ |

---

## Decision log

Decided 19 Nov 2026. Each decision replaces whatever the scope, proposal or earlier team
decisions said on the same point.

| # | Question | Decision | What it overrides or changes |
|---|---|---|---|
| D1 | Who registers tagged plants and records observations? | **Botanists only** | **Overrides the proposal**, which said officers record plants too. Update the proposal. |
| D2 | How much can an Admin do compared with an Officer? | **System work only** | Admins manage users, sensors, alert routing, alerts and the audit log. No review, species, tagged-plant or tag changes, no reports. |
| D3 | What does a Botanist do about species? | **Propose a species name only** | An Officer confirms it and links the tagged plant. Matches the proposal's "botanists enter the species themselves". |
| D4 | Who deletes and restores tagged plants? | **Officers** | Soft delete only. Replaces the earlier rule "officers cannot delete plants". |
| D5 | Who creates and manages QR tags? | **Officers print, retire and delete; botanists make field tags and kept tags** | Admins lose tag management (follows D2). |
| D6 | What can an Admin see? | **Everything, read-only, with exact locations** | Needed for alerts near endangered plants and for D4. |
| D7 | How does an Officer fix a wrong observation? | **Through review only** (return with a reason) | Unchanged. |
| D8 | Who moderates the Discussion board? | **Admins** delete anyone's posts | Unchanged. |
| D9 | How are endangered and hidden plants shown to Visitors? | **Left off the map completely**, with a note that the exact location is hidden. Ordinary published tagged plants show at their exact location. | **Overrides the proposal and threat model T13**, which reduced the location to a ~1.1 km area. |
| D10 | Can Botanists see endangered and hidden plants' exact locations? | **Yes, all of them**: they are corporation staff doing conservation work | **Overrides threat model T13/T18**, which reduced them for botanists (except plants they registered). Consequence: a botanist's phone now holds exact endangered locations offline, so the phone's encrypted store (SQLCipher) and the phone itself must be protected. Update the threat model. |

### Statements elsewhere that this file replaces
- Proposal: "botanists **and conservation officers** will use a mobile app to record plants…
  scan or generate a QR code". Now botanists only (D1).
- Proposal and threat model T13: endangered locations "reduced" or "snapped to ~1.1 km" for
  the public. Visitors no longer see them at all (D9). Botanists see them exactly (D10).
- Threat model: "**Only the Botanist** scans QR tags… Visitors do not scan tags". Visitors may
  scan a tag to open its public page [Scope]. Only botanists register tagged plants (D1).
- Threat model: "Alerts… read by the **Admin**". Officers and admins both handle alerts [IoT table].
- Earlier team rule "officers cannot delete plants" (migration
  `20261105230000_specimen_delete_admin_only.sql`). Officers now can (D4).

---

## Where the code differs from this file (19 Nov 2026, `main` at `620348e`)

These are the changes needed to make the app match. Every rule must hold in all three
layers: **UI** (`apps/shared/permissions.js`), **API** (`services/api/src/permissions.js`
plus handler checks) and **database** (Supabase RLS policies and triggers).

### 1. Officers and admins can create tagged plants and observations (D1)
- API: `POST /specimens`, `POST /observations`, `POST /sync` and
  `POST /observations/:id/photos` allow any staff role. They should allow **botanist** only.
- Database: the policies `specimens: register` and `obs: create own` (and the photo insert
  policy) allow any active user. Add `my_role() = 'botanist'`.
- UI: the officer and admin bottom-bar button says "Scan/Add". Change it to "Scan".

### 2. Admins can do officer data work (D2, D5)
- API: change `OFFICER_ADMIN` to officer only for:
  - `POST /observations/:id/reviews`;
  - all species write routes (`POST`, `PATCH`, `DELETE`, publish, restore, media);
  - `/reports/*`;
  - `POST /qr-tags/batch`, `DELETE /qr-tags/:qrId`, `POST /qr-tags/:qrId/retire`.

  Read routes such as `GET /species` stay open to admins (D6).
- Database:
  - The `review_observation()` function allows officer and admin. Make it officer only.
  - These policies allow admins to write: `species: staff write`, `media: staff write`, the
    species-media storage policies, `qr: staff write`, `photos: update/delete own or staff`,
    and the `obs photos: staff delete` storage policy. Make them officer only.
  - `specimens: update` together with the `guard_specimen_update()` trigger lets an admin
    change a tagged plant's species, hide-location flag and QR tag. Limit admins to
    `is_deleted` only.
- UI: in `PERMS.admin`, remove `review`, `reports`, `species` and `tags`. Remove the
  Species and QR tags links from the admin sidebar.

### 3. Officers cannot delete tagged plants, and there is no way to do it from the app (D4)
- Database: `guard_specimen_update()` allows only admins to change `is_deleted`. Allow
  officers too.
- API and UI: add `DELETE /specimens/:id` and a restore route (officer and admin), and a
  button on the tagged plant's page. Add them to `packages/api-contract/openapi.yaml`, which
  needs two approvals.

### 4. Visitors see endangered and hidden plants as a ~1.1 km area (D9)
- Database: the functions `public_plants()` and `public_plant_by_tag()` return
  grid-snapped coordinates for endangered and hidden plants
  (`20261103120000_restore_endangered_only_public_location.sql`). They should return
  **no coordinates**, while still marking `location_reduced`/hidden.
- API: `GET /public/tags/:qrId` and the public workspace use `protectSpecimen()`
  (`services/api/src/distribution.js`), which snaps the location. For a visitor it should
  return `lat`/`lng` as `null` with a hidden flag.
- UI: the map already leaves these plants out for visitors (`shownCoords()` in
  `apps/shared/selectors.js` returns nothing for an endangered plant when the viewer is not
  staff). Check that the public plant pages (web `PublicPlant.jsx`, mobile `PlantPage.js`)
  show the note "This plant's exact location is hidden to protect it." and no rough area.

### 5. Botanists see endangered and hidden plants as a ~1.1 km area (D10)
- API: `EXACT_LOCATION_ROLES` in `services/api/src/distribution.js` is
  `['officer', 'admin']`. Add `'botanist'`. This changes `GET /distribution`,
  `GET /workspace`, `GET /specimens` and `GET /specimens/by-qr/:qrId`.
- UI: no change. The apps show staff whatever coordinates the API sends.
- Mobile: check that the offline species and tag caches (`apps/mobile/offline/`) store
  the exact coordinates only inside the encrypted database.

### 6. Code and screens that say "record" ambiguously
- Use the terms from [Words we use](#words-we-use-read-this-first) in screen text, ticket
  titles and new code comments: species, tagged plant, observation, revisit.
- For example, "My records" (botanist) shows **observations**, and the "Review queue"
  lists **observations waiting for review**.

### 7. Documents to update
- Proposal and threat model: the statements listed under
  [Statements elsewhere that this file replaces](#statements-elsewhere-that-this-file-replaces).
- `services/api/test/rbac.test.js` and `apps/web/tests/role-pages.spec.js`: make them
  check this file's summary table.

### Already matching (no change needed)
Botanist observation rules, officer review rules, sensor and alert rules, user management,
audit log and discussion moderation.
