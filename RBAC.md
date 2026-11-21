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
- **[D1]** to **[D18]**: decisions from the log.
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
| **Re-tagging** | Moving a tagged plant to a new QR tag because its tag is damaged, lost or unreadable. The plant and its observation history stay the same; only the tag changes. Only Officers do it, and only after the old tag is marked retired or damaged. [D13] |
| **Proposed species name** | What the botanist thinks the species is, as free text. It becomes a link to a species only when an Officer confirms it. |
| **Review** | An Officer's decision on one observation: **approve**, **return** (back to the botanist to fix, reason required) or **reject** (reason required). |
| **Observation status** | `draft` (being written) → `queued` (saved on the phone, not sent yet) → `synced`, shown as **Waiting for review** → `approved`, `returned` or `rejected`. A returned observation goes back to `synced` when the botanist resends it. An **approved** observation of an **unpublished** tagged plant can be **sent back** (`approved` → `returned`) by an Officer [D18]. |
| **Endangered plant** | A tagged plant whose species' conservation status is **Endangered**. See [Species conservation status](#species-conservation-status). |
| **Hidden plant** | A tagged plant an Officer **or** Admin has set to **hide its location** (code: `endangered_override`), for example a **vulnerable** plant, which is not hidden automatically. Treated exactly like an endangered plant for location. [D15] |
| **Location-protected plant** | Any tagged plant whose exact location visitors must not see: an **endangered plant** or a **hidden plant** [D11]. |
| **Published** | A species visitors can see. A tagged plant appears to visitors only when its species is published, it has at least one approved observation **and** an Officer has not unpublished it. |
| **Unpublished tagged plant** | A tagged plant an Officer has taken off public view, with a reason (code: `specimens.is_withdrawn`). Its observations keep their decisions. It stays unpublished until an Officer presses **Publish again**; approving an observation never publishes it by itself. [D17] |
| **Sent back** | An Officer returning an unpublished plant's approved observation to its botanist, with a reason, while reviewing it. The botanist sees it as **"Sent back for review"**, fixes it and resends it, and it goes through review again. [D18] |
| **Observation photo** | A photo of one tagged plant, taken during one observation. The botanist adds it; an Officer can edit its caption or remove it. |
| **Species photo** | A reference photo in the species catalogue. Only Officers add, replace or remove species photos. When an Officer approves an observation of a species that has **no photos yet**, that observation's first photo automatically becomes the species' cover photo. Officers can replace it later with any other photo. |
| **Sensor node** | An IoT device installed next to a tagged plant (usually an endangered one). It sends readings (temperature, humidity, soil moisture, motion, GPS) and webcam images. |
| **Alert** | Raised automatically when a sensor node reads something wrong: a reading out of range, motion, the node moved, or the node went silent. Each alert has a severity (`low`, `medium`, `high`, `critical`) and a status: `open` → `acknowledged` → `resolved`. |
| **Alert routing** | An **Admin-only setting** that decides **who is notified** (bell and phone push) when a new alert is raised. For each officer or admin, the admin picks which nodes (some or all) and the minimum severity. Someone with no routing setting is notified about every alert. Routing only controls notifications: every officer and admin can still **see and act on every alert**. (Code: `alert_routes` table, `/alert-routes` routes.) |
| **Assigning an alert** | Naming the **one person responsible** for one alert. Only an **active Officer** can be assigned [D12]. They get an "Alert assigned to you" notification and push. Different from routing: routing is "who hears about new alerts", assigning is "who deals with this alert". |

---

## Species conservation status

Each **species** has one conservation status. Only Officers set it [Scope], when adding or
editing a species. A tagged plant has no status of its own: it uses its species' status,
plus the hide-location flag.

### The agreed statuses [D11]

| Status | Hides the plant's exact location from visitors? |
|---|---|
| Least concern | No. An Officer or Admin can hide an individual tagged plant with the hide-location flag. |
| Near threatened | No. Same: hide by hand if needed. |
| Vulnerable | No. Same: hide by hand if needed. |
| **Endangered** | **Yes, always** (the hide-location switch is locked on) |

- Write the statuses exactly as above ("Least concern", not "Least concerned").
- **Every species must have a status.** The species form starts with none picked and
  will not save until the Officer chooses one, so a new species is never public with a
  status nobody chose.
- **Only Endangered hides the location automatically.** For every other status the
  Officer or Admin decides per tagged plant with the hide-location flag (off by default).
- Removed (team decision, 20 Nov 2026): Critically endangered (existing species become
  Endangered), Extinct in the wild, Extinct, Data deficient and Not evaluated (existing
  species become "no status" until an Officer picks one).

### What the code has today (`main` at `620348e`)

There are **nine** statuses: the full IUCN Red List (CTIP-46). The list is in three
places that must stay in step:

- `apps/shared/data.js` (`CONSERVATION`)
- `services/api/src/species.js` (`IUCN_STATUSES`)
- `packages/api-contract/openapi.yaml` (the species `conservation_status` enum)

New species default to "least concern" (`BLANK_SPECIES` in `apps/shared/data.js`). The
database stores the status as free text in lower case and does not restrict the values.
See [code change 6](#6-nine-conservation-statuses-and-an-unsafe-default-d11).

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
- An **Admin runs the system**. Admins do not do data work, except setting the
  hide-location flag [D2, D15].

### Who sees exact locations

| | Visitor | Botanist | Officer | Admin |
|---|:-:|:-:|:-:|:-:|
| Ordinary tagged plants | ✅ exact | ✅ exact | ✅ exact | ✅ exact |
| Location-protected plants (endangered or hidden) | ❌ **not on the map at all**, a note instead | ✅ exact [D10] | ✅ exact | ✅ exact |

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
  - change their own role, turn off their own account or change their own email (an
    Admin corrects emails, [D14]);
  - edit or delete the audit log (not even an Admin). [Threat model T7]

---

## 👁 Visitor (not signed in)

### Can
- Browse and search the public catalogue: **published species** only, with their species
  photos and information. [Scope, Proposal]
- **Scan a QR tag** (or open its link) to see that tagged plant's public page. [Scope:
  "QR-enabled educational content"]
- See **published tagged plants** on the map at their **exact location**, as long as the
  plant is **not location-protected**: not hidden, and its species is not Endangered.
  [D9, D11]

### Cannot
- See a **location-protected plant on the map at all**: no pin and no rough area. [D9]
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
  reply. [Existing] This includes an observation **sent back** from an unpublished plant,
  which they see as "Sent back for review" with the Officer's reason. [D18]
- Add, caption and remove observation photos on their **own** observations, but not
  while that tagged plant has an observation waiting for review. [Existing]
- **QR tags** [D5]:
  - make **one tag at a time** in the field when no printed tag is at hand;
  - keep up to **23 unused kept tags** on the phone for offline surveys (up to 20 per request);
  - release their own unused kept tags.
- See **all tagged plants with their exact locations, including location-protected
  plants**. Botanists are corporation staff doing conservation work in the forest. [D10]
- See **published species**. [Existing]
- See **all approved observations** of any tagged plant, whoever recorded them:
  measurements, notes, photos and the recorder's name. This lets a revisit be compared
  with earlier visits (for example, height over time). [D16]
- See **their own** observations at every status (draft, waiting for review, returned,
  rejected), and the review decisions and comments on them. [Threat model: "view own
  submissions"]
- **Discussion:**
  - start threads (public, or shared with chosen people or roles) and reply;
  - edit or delete their own posts. [Existing]

### Cannot
- See **other botanists' unfinished observations** (draft, waiting for review, returned or
  rejected), or the review decisions and comments on **any** observation that is not
  their own. Only approved observations are shared. [D16]
- Comment on another botanist's observation. Comments on an observation are between its
  botanist and the Officers. [D16]
- Add a revisit to a tagged plant that already has an observation **waiting for review**.
  [Existing]
- Change an observation after sending it, except by resending a returned observation.
- Link a tagged plant to a species, set the hide-location flag, re-tag a tagged plant,
  delete a tagged plant, or unpublish or publish a tagged plant. [D3, D4, D13, D15, D17]
- Approve, return or reject observations.
- Create, edit, publish or delete species, or see unpublished species. [Scope gives the
  catalogue to Officers, D3]
- Print tag batches, retire tags, or use another botanist's kept tags.
- See sensors, sensor readings or images, alerts, reports, the user list or the audit log.
  [IoT table] *(The IoT table's reason, "a node's position gives away the plant's spot",
  no longer applies after D10. The rule stays until the team changes it.)*
- **Be assigned an alert, or be included in alert routing.** [IoT table, D12]

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
  - set the **hide-location flag** (for example to hide a vulnerable plant) [Existing];
  - **re-tag** a tagged plant onto a new unused tag, **only after** marking its old tag
    retired or damaged [D13];
  - **delete and restore** tagged plants (soft delete, restorable). Officers are the only
    role that can do this. [D4]
  - **unpublish** a published tagged plant (reason required, the botanists are told) and
    **publish it again**. Publishing again is refused while an observation is waiting for
    review or with the botanist. [D17]
  - **review an unpublished tagged plant** ("Review tag", review mode): change its species,
    photos and hide-location flag as a draft, then **save** the changes or **send it back**
    to the botanist (its latest approved observation becomes returned, reason required).
    A published plant has no review option: unpublish it first. [D18]
- See **exact locations** of all tagged plants. [Threat model T13/T18]
- **Species:**
  - add, edit, delete and restore species;
  - set the conservation status (see [the agreed statuses](#the-agreed-statuses-d11));
  - publish and unpublish them;
  - upload, replace and remove species photos. [Scope]
- Edit the caption of, or remove, **observation photos** on any observation (for example a
  wrong caption or a bad photo). [Scope: "Upload plant photographs"]
- **QR tags:** print batches of any size, retire tags or mark them damaged, and delete
  unused tags that are not on a tagged plant. [D5]
- **Reports:** view and export the observation and species reports. [Proposal]
- **Monitoring** [IoT table]:
  - see sensor nodes, live readings, history and webcam images;
  - give a node a private nickname;
  - see **all** alerts, and get notified about new ones (following alert routing, if an
    admin has set it for them);
  - **assign, acknowledge, add notes to and resolve alerts**. An alert can be assigned
    only to an **active Officer**. [D12]
- **Be assigned** an alert. [D12]
- Get notified when an observation is sent or resent for review. [Existing]
- See the staff list (names, roles), for example to assign an alert. [Existing]
- **Discussion:** the same as a Botanist (start threads, reply, edit or delete their own
  posts). [D8]

### Cannot
- **Register tagged plants or create observations** (first observations or revisits).
  Officers review field work; they do not create it. [D1]
- Edit a botanist's observation directly. [D7]
- Change a tagged plant's QR tag while the old tag is still in use (not retired or
  damaged). [D13]
- Register, edit or delete **sensor nodes**, change their alert limits, or decide who
  receives which alerts. [IoT table]
- Manage user accounts or read the audit log. [Threat model]
- Make kept tags (botanists' phones only). [D5]
- Delete other people's discussion threads or posts. [D8]

---

## 🛡 Admin (System administrator)

The Admin role is **system work only**: accounts, sensors, alerts and security. Admins can
**look at** all data but do not **change** species, tagged plants or observations, with
one exception: they can set a tagged plant's **hide-location flag**. [D2, D15]

### Can
- **Users:**
  - see every account;
  - create accounts (by invitation email or with a temporary password);
  - approve new accounts and give them a role;
  - change a user's role;
  - **correct a user's email**. The change only takes effect once the person confirms it
    from a link sent to the new address. [D14]
  - turn accounts on and off;
  - delete accounts (restorable for 30 days, then removed for good). [Scope, Threat model]
- **Tagged plants:** set or clear the **hide-location flag**, for example when an alert or a
  report shows a plant is at risk. [D15]
- **Sensor nodes:** register, edit (including alert limits) and delete nodes; manage device
  keys. [IoT table, Proposal]
- **Alert routing:** for each officer or admin, choose which nodes' alerts they are notified
  about, and from which severity up; or reset them to "every alert". Only active officers
  and admins can be chosen. [IoT table, CTIP-48]
- **Monitoring dashboard** [Scope, IoT table]:
  - see nodes, readings, history and images;
  - see all alerts and get notified (following alert routing);
  - **assign** alerts to an active Officer, **acknowledge, add notes to and resolve**
    alerts.
- **Audit log:** read sign-ins, failed sign-ins, MFA failures and data changes. [Threat model]
- **View**, read-only, all species (including unpublished), all tagged plants with exact
  locations, and all observations, so they can act on alerts near endangered plants. [D6]
- **Discussion moderation:** delete **anyone's** thread or post. [D8] Admins can also start
  threads and reply.

### Cannot
- **Change a user's name.** Each person edits their own name. [D14]
- **Delete or restore tagged plants.** [D4]
- **Be assigned** an alert. [D12]
- **Review observations** (approve, return or reject). [D2]
- **Change species:** add, edit, set status, publish, delete, or manage species photos. [D2]
- Link a tagged plant to a species, re-tag a tagged plant, or unpublish, review or
  publish a tagged plant. [D2, D13, D17, D18]
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
| Add, edit, set status, publish, delete species; species photos | ❌ | ❌ | ✅ | ❌ |
| **Tagged plants** | | | | |
| See tagged plants | published only | all | all | 👁 all |
| Exact location of ordinary tagged plants | ✅ | ✅ | ✅ | ✅ |
| Exact location of location-protected plants | ❌ not on map | ✅ | ✅ | ✅ |
| Register a tagged plant (with its first observation) | ❌ | ✅ | ❌ | ❌ |
| Propose a species name | ❌ | ✅ | ❌ | ❌ |
| Link a tagged plant to a species | ❌ | ❌ | ✅ | ❌ |
| Set or clear the hide-location flag | ❌ | ❌ | ✅ | ✅ |
| Re-tag a tagged plant (old tag retired or damaged first) | ❌ | ❌ | ✅ | ❌ |
| Delete or restore a tagged plant | ❌ | ❌ | ✅ | ❌ |
| Unpublish or publish again a tagged plant (reason to unpublish) | ❌ | ❌ | ✅ | ❌ |
| Review an unpublished tagged plant, send it back to the botanist | ❌ | ❌ | ✅ | ❌ |
| **Observations** | | | | |
| Record a revisit (new observation) | ❌ | ✅ | ❌ | ❌ |
| See approved observations | approved data on public pages | all | all | 👁 all |
| See unfinished observations (draft, waiting for review, returned, rejected) | ❌ | own | all | 👁 all |
| See review decisions and comments on an observation | ❌ | own | all | 👁 all |
| Edit or delete unsent observations | ❌ | own | ❌ | ❌ |
| Resend a returned observation | ❌ | own | ❌ | ❌ |
| Approve, return or reject an observation | ❌ | ❌ | ✅ | ❌ |
| Add observation photos | ❌ | own | ❌ | ❌ |
| Edit or remove observation photos on others' observations | ❌ | ❌ | ✅ | ❌ |
| **QR tags** | | | | |
| Make one tag in the field, keep offline tags | ❌ | ✅ | ❌ | ❌ |
| Print, retire, mark damaged, delete QR tags | ❌ | own kept tags only | ✅ | ❌ |
| **Monitoring** | | | | |
| See sensor nodes, readings, images | ❌ | ❌ | ✅ | ✅ |
| Handle alerts (assign, acknowledge, notes, resolve) | ❌ | ❌ | ✅ | ✅ |
| Can be assigned an alert | ❌ | ❌ | ✅ | ❌ |
| Can be included in alert routing (receive alert notifications) | ❌ | ❌ | ✅ | ✅ |
| Register, edit, delete sensor nodes and limits | ❌ | ❌ | ❌ | ✅ |
| Set alert routing | ❌ | ❌ | ❌ | ✅ |
| **Accounts and system** | | | | |
| Manage users: create, approve, role, on/off, delete | ❌ | ❌ | ❌ | ✅ |
| Correct a user's email (confirmed by the user) | ❌ | ❌ | ❌ | ✅ |
| Change another user's name | ❌ | ❌ | ❌ | ❌ |
| Audit log | ❌ | ❌ | ❌ | 👁 |
| Reports (view, export) | ❌ | ❌ | ✅ | ❌ |
| **Discussion** | | | | |
| Post, edit or delete own | ❌ | ✅ | ✅ | ✅ |
| Delete others' posts | ❌ | ❌ | ❌ | ✅ |

---

## Decision log

Decided 19 Nov 2026. Each decision replaces whatever the scope, proposal or earlier team
decisions said on the same point.

| # | Question | Decision | What it overrides or changes |
|---|---|---|---|
| D1 | Who registers tagged plants and records observations? | **Botanists only** | **Overrides the proposal**, which said officers record plants too. Update the proposal. |
| D2 | How much can an Admin do compared with an Officer? | **System work only**, except the hide-location flag (D15) | Admins manage users, sensors, alert routing, alerts and the audit log. No review, species, tag or other tagged-plant changes, no reports. |
| D3 | What does a Botanist do about species? | **Propose a species name only** | An Officer confirms it and links the tagged plant. Matches the proposal's "botanists enter the species themselves". |
| D4 | Who deletes and restores tagged plants? | **Officers only** | Soft delete only. Replaces the earlier rule "only admins delete plants" (`20261105230000_specimen_delete_admin_only.sql`). |
| D5 | Who creates and manages QR tags? | **Officers print, retire and delete; botanists make field tags and kept tags** | Admins lose tag management (follows D2). |
| D6 | What can an Admin see? | **Everything, read-only, with exact locations** | Needed to act on alerts near endangered plants. |
| D7 | How does an Officer fix a wrong observation? | **Through review only** (return with a reason) | Unchanged. |
| D8 | Who moderates the Discussion board? | **Admins** delete anyone's posts | Unchanged. |
| D9 | How are location-protected plants shown to Visitors? | **Left off the map completely**, with a note that the exact location is hidden. Ordinary published tagged plants show at their exact location. | **Overrides the proposal and threat model T13**, which reduced the location to a ~1.1 km area. |
| D10 | Can Botanists see location-protected plants' exact locations? | **Yes, all of them**: they are corporation staff doing conservation work | **Overrides threat model T13/T18**, which reduced them for botanists (except plants they registered). Consequence: a botanist's phone now holds exact endangered locations offline, so the phone's encrypted store (SQLCipher) and the phone itself must be protected. Update the threat model. |
| D11 | Which conservation statuses do we keep? | **Least concern, Near threatened, Vulnerable, Endangered** (changed 20 Nov 2026 from five plus "no status"). Every species must have one; the form does not pre-pick it. Only Endangered hides the location automatically; any other plant can be hidden by hand. | Replaces the nine-status IUCN list (CTIP-46) and the "Least concern" default. |
| D12 | Who can be assigned a sensor alert? | **Active Officers only** | Admins still see, acknowledge, add notes to and resolve alerts, and receive routed notifications, but are not the named person responsible. Botanists never. |
| D13 | Who can move a tagged plant to a new QR tag? | **Officers only, and only after the old tag is marked retired or damaged** | Today officers and admins can change the tag at any time. |
| D14 | Who can change a user's email and name? | **Email: an Admin corrects it**, confirmed by a link to the new address. **Name: only the person themselves.** | Today nobody can change an email, and admins can change names. |
| D15 | Who can set the hide-location flag? | **Officers and Admins** | Exception to D2: admins respond to alerts and can protect a plant at risk. |
| D16 | Can Botanists see each other's observations? | **Yes, approved ones**: measurements, notes, photos and who recorded them. Unfinished observations, review decisions and comments stay private to the botanist who recorded them (and staff). | Replaces "botanists see only their own observations" (threat model "view own submissions", RLS `obs: read own or staff`). That rule hid endangered locations from botanists, which D10 no longer requires. Revisits need the plant's earlier observations, and visitors could already see approved observation data on the public pages. |
| D17 | Who can take a tagged plant off public view? (21 Nov 2026) | **Officers only**: unpublish with a reason, and **publish again** as a separate, deliberate step. Publishing again waits until no observation is waiting for review or with the botanist. | New. An earlier draft (branch `rick-18-Nov`) let admins do it too; that breaks D2. |
| D18 | How does an Officer correct a plant that is already published? (21 Nov 2026) | **Unpublish it first, then review it.** In review mode the Officer changes the species, photos and hide-location flag as a draft and saves, or **sends it back** to the botanist with a reason (`approved` → `returned`). The botanist sees "Sent back for review", resends, and the observation is reviewed again. The plant stays unpublished until an Officer publishes it again. | Extends D7: "return" was only possible for an observation waiting for review. |

### Statements elsewhere that this file replaces
- Proposal: "botanists **and conservation officers** will use a mobile app to record plants…
  scan or generate a QR code". Now botanists only (D1).
- Proposal and threat model T13: endangered locations "reduced" or "snapped to ~1.1 km" for
  the public. Visitors no longer see them at all (D9). Botanists see them exactly (D10).
- Threat model: "**Only the Botanist** scans QR tags… Visitors do not scan tags". Visitors may
  scan a tag to open its public page [Scope]. Only botanists register tagged plants (D1).
- Threat model: "Alerts… read by the **Admin**". Officers and admins both handle alerts
  [IoT table]; only officers are assigned (D12).
- Earlier team rule "only admins delete plants" (migration
  `20261105230000_specimen_delete_admin_only.sql`). Now officers only (D4).
- CTIP-46: the nine IUCN statuses. Now four, and a status is required (D11).
- Threat model: Botanist "view own submissions". Botanists also see every **approved**
  observation; unfinished ones stay their own (D16).

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

### 2. Admins can do officer data work (D2, D5, D15)
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
  - `guard_specimen_update()` lets an admin change a tagged plant's species and QR tag.
    Limit admins to **`endangered_override` only** (D15).
- UI:
  - In `PERMS.admin`, remove `review`, `reports`, `species` and `tags`. Remove the Species
    and QR tags links from the admin sidebar.
  - Make sure the hide-location control on a tagged plant's page shows for admins.

### 3. Deleting tagged plants is admin-only and has no API or button (D4)
- Database: `guard_specimen_update()` allows only admins to change `is_deleted`. Change it
  to **officers only**.
- API and UI: add `DELETE /specimens/:id` and a restore route (**officer only**), and a
  button on the tagged plant's page. Add them to `packages/api-contract/openapi.yaml`, which
  needs two approvals.

### 4. Visitors see location-protected plants as a ~1.1 km area (D9)
- Database: the functions `public_plants()` and `public_plant_by_tag()` return
  grid-snapped coordinates for endangered and hidden plants
  (`20261103120000_restore_endangered_only_public_location.sql`). They should return
  **no coordinates**, while still marking the plant as hidden.
- API: `GET /public/tags/:qrId` and the public workspace use `protectSpecimen()`
  (`services/api/src/distribution.js`), which snaps the location. For a visitor it should
  return `lat`/`lng` as `null` with a hidden flag.
- UI: the map already leaves these plants out for visitors (`shownCoords()` in
  `apps/shared/selectors.js` returns nothing for an endangered plant when the viewer is not
  staff). Check that the public plant pages (web `PublicPlant.jsx`, mobile `PlantPage.js`)
  show the note "This plant's exact location is hidden to protect it." and no rough area.

### 5. Botanists see location-protected plants as a ~1.1 km area (D10)
- API: `EXACT_LOCATION_ROLES` in `services/api/src/distribution.js` is
  `['officer', 'admin']`. Add `'botanist'`. This changes `GET /distribution`,
  `GET /workspace`, `GET /specimens` and `GET /specimens/by-qr/:qrId`.
- UI: no change. The apps show staff whatever coordinates the API sends.
- Mobile: check that the offline species and tag caches (`apps/mobile/offline/`) store
  the exact coordinates only inside the encrypted database.

### 6. Nine conservation statuses and an unsafe default (D11)
- Shrink the list to the four agreed statuses in `apps/shared/data.js` (`CONSERVATION`),
  `services/api/src/species.js` (`IUCN_STATUSES`) and `packages/api-contract/openapi.yaml`.
  The API refuses a species with no status.
- `BLANK_SPECIES` in `apps/shared/data.js` stops defaulting to "least concern". The species
  forms (web and mobile) must not pre-select a status and must not save without one.
- Only "endangered" hides automatically: `isEndangered()` in
  `services/api/src/distribution.js`, `isThreatened()` in `apps/shared/data.js`. Vulnerable
  is no longer hidden by default.
- Add a database check constraint so only the four values (or `null` for converted older
  rows) can be saved.
- Convert existing species: "critically endangered" becomes "endangered"; the other removed
  statuses become no status until an Officer picks one.

### 7. Alerts can be assigned to anyone (D12)
- API: `POST /alerts/:id/assign` (`services/api/src/staff.js`) accepts **any** user id; the
  database only checks that the person exists. A direct API call can assign an alert to a
  botanist, an admin or a turned-off account.
- Fix: refuse any assignee who is not an **active officer**, the same kind of check
  `PUT /alert-routes/:userId` makes. Add a database trigger on `alerts.assigned_to` so a
  direct Supabase call cannot skip it.
- UI: the "Assign to" lists (web `SensorOverview.jsx`, mobile `Monitoring.js`) already
  offer active officers only. No change.

### 8. Officers and admins can change a plant's QR tag at any time (D13)
- Database: `guard_specimen_update()` lets officers and admins change `qr_id` freely.
  Allow it for **officers only**, and only when the plant's **current** tag has status
  `retired` or `damaged`. The new tag must be unused (`assign_specimen_tag()` already
  checks that).
- API and UI: a re-tag action on the tagged plant's page (officer only) that first asks the
  officer to mark the old tag retired or damaged.

### 9. Admins can change names but not emails (D14)
- API: `PATCH /profiles/:id` accepts `full_name`, `role` and `is_active`. Remove
  `full_name`; add an email change that goes through **Supabase Auth**, so the person must
  confirm from the new address before `profiles.email` changes. Never edit
  `profiles.email` on its own: the sign-in email would no longer match.
- UI: on the Users page, remove any name editing and add "Correct email".

### 10. Botanists see only their own observations (D16)
- Database:
  - `obs: read own or staff` lets a botanist read only observations they recorded. Add
    approved observations: `recorded_by = auth.uid() or status = 'approved' or
    my_role() in ('officer', 'admin')`.
  - `photos: read` and the `obs photos: read if can see observation` storage policy follow
    the observation, so photos of approved observations become visible too. This is
    intended; no change.
  - `comments: read` and `reviews: read` also follow the observation, so they would
    **expose review comments** to other botanists. Change both to: the observation's
    botanist (`recorded_by = auth.uid()`) or officer/admin.
  - `comments: insert` would let any botanist comment on another's approved observation.
    Limit it to the observation's botanist or an officer/admin.
- API:
  - `visibleTo()` in `services/api/src/observationAccess.js` returns only the botanist's
    own observations. Allow approved ones too.
  - `GET /observations/:id/reviews`, `GET` and `POST /observations/:id/comments`
    (`observations.js`, `field.js`) must check "own observation, or officer/admin" before
    answering, now that the observation itself is visible.
  - Editing, deleting and resending stay own-only. `ownDraftOrError()` already checks
    `recorded_by`.
- UI: no change needed.
  - The plant page's visit list (`plantVisits()` in `apps/shared/selectors.js`) shows
    whatever the API returns, so other botanists' approved visits appear on their own.
  - "My records" pages (web `Records.jsx`, mobile `Records.js`) already filter to the
    botanist's own observations.
  - Check that the visit list shows who recorded each observation.

### 11. Code and screens that say "record" ambiguously
- Use the terms from [Words we use](#words-we-use-read-this-first) in screen text, ticket
  titles and new code comments: species, tagged plant, observation, revisit.
- For example, "My records" (botanist) shows **observations**, and the "Review queue"
  lists **observations waiting for review**.

### 12. Documents to update
- Proposal and threat model: the statements listed under
  [Statements elsewhere that this file replaces](#statements-elsewhere-that-this-file-replaces).
- `services/api/test/rbac.test.js` and `apps/web/tests/role-pages.spec.js`: make them
  check this file's summary table.

### 13. Unpublishing and reviewing a tagged plant (D17, D18), added 21 Nov 2026
- Done for the database (`20261121120000_rbac_d17_d18_unpublish_tagged_plant.sql`), the
  API (`POST /specimens/:id/publish`, officer only) and the **web** tag page
  (`apps/web/src/pages/Specimen.jsx`).
- Done on **mobile** too (`apps/mobile/pages/PlantPage.js`, `PlantReview.js`, `Review.js`, `Records.js`,
  `Notifications.js`); see `docs/updates/rick-fix-officer-tag-plant-page.md`.

### Already matching (no change needed)
Botanist rules for editing and sending their own observations, officer review rules, sensor node and alert routing rules,
creating, approving, turning off and deleting accounts, audit log and discussion
moderation.
