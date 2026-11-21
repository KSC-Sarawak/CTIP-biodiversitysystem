# Persona QA of the website, phase 1 (21 Nov 2026)

Seven test agents used the website the way different people would: a tourist, a new botanist,
a careful officer, a security-minded admin, and a very picky "Karen" for visitors, botanists and
officers. Together they ran about 165 checks on desktop (1440 px) and phone (412 px), in light and
dark theme. This page lists what they found, ranked by severity, with screenshots for the serious
findings.

**What was tested:** branch `rick-fix-officer-tag-plant-page` (`8f7b0ee`, unpublish and review a
tagged plant, RBAC D17/D18) plus the password-message fix from
`rick-fix-wrap-text-error-on-change-password-page` (`ca836d0`).

**How:** Playwright drove a real browser against the website, with the API faked in the browser
(`apps/web/tests/helpers/mockApi.js`), the same way as `npm run test:agent`. So:
- every screen, button, message and permission shown **in the website** was really tested;
- the **database and API rules were not** exercised. Where a finding depends on them, the server
  code was checked by hand and the finding says so.

**Automated checks run at the same time**

| Check | Result |
|---|---|
| API tests (`npm run api:test`) | 326 passed |
| Shared app tests | 223 passed |
| Web lint and build | clean |
| Web Playwright suite (`npm run test:agent`, desktop) | 105 passed, 20 failed, 5 skipped. Plain `main` fails **the same 20**, so they are out-of-date tests, not new bugs (for example `role-pages.spec.js` looks for a role switcher that no longer exists). Worth one cleanup ticket. |

**Tags used below**
- **[branch]**: comes from, or touches, the unpublish/review work. Fix before merging that branch.
- **[main]**: already on `main` before this branch.

---

## Blocker and major findings

| # | Finding | Page | Tag | Screenshot |
|---|---|---|---|---|
| 1 | The review queue still says **"Approve & publish"** and asks the officer to type PUBLISH for an **unpublished** plant. The plant correctly stays unpublished, but the queue then says "approved and published". The tag page already does this right. (`Review.jsx:199, 339, 346`) | `#/review` | branch | [P01](P01-queue-approve-and-publish.png) |
| 2 | **"Publish again" works while review mode has unsaved changes.** It publishes the old species and photos and throws the draft away without the "Discard changes?" question. | `#/tag/<qr>` | branch | [P02](P02-publish-again-drops-draft.png) |
| 3 | **"Published" is shown for an unpublished plant** in the Visits tab, in My records (chip and tile) and in Reports (table and CSV). The status `approved` is always labelled "Published". (`tokens.js:107`, `Records.jsx`, `ReportSummary.jsx:82`) | `#/tag` Visits, `#/records`, `#/reports` | branch | [P03a](P03a-visits-says-published.png), [P03b](P03b-records-says-published.png), [P03c](P03c-reports-says-published.png) |
| 4 | **Fixing a returned observation:** a negative height saves the photo changes, then stops with no message and does not send. A blank height, or letters, is sent as "no height" with a success message. | `#/records` | branch (photo order) and main (height) | [P04](P04-negative-height-silent.png) |
| 5 | **A botanist is offered "Edit photos" on another botanist's plant.** The website sends the caption change or delete. The server refuses it (403, `services/api/src/field.js:158`, and the database policy), so no data is lost, but the button should not be there. (`Specimen.jsx`, `canEditPhotos` has no ownership check) | `#/tag/<qr>` | main | [P05](P05-edit-photos-others-plant.png) |
| 6 | **A protected plant's tag page says "Location not captured when this plant was recorded."** instead of "This plant's exact location is hidden to protect it." (RBAC D9). It happens when the plant comes from the public workspace, which is how the real API sends it. No location leaks; the wording is wrong. (`Specimen.jsx`, checks only `lat == null`) | `#/tag/<qr>` (visitor) | main | [P06](P06-protected-plant-wrong-note.png) |
| 7 | **Signing in with a username never works** when signed out. The username is looked up in an empty list and "Wrong email or password" appears without calling the API. (`StoreProvider.js`, `login`) | `#/login` | main | - |
| 8 | **An admin cannot give a pending account a role when approving it.** The switch only turns the account on, the dialog says "back on", and a role-less account then shows "Botanist". (`Admin.jsx`) | `#/users` | main | [P08](P08-approve-account-no-role.png) |
| 9 | **An alert's "Assigned to" shows the wrong person** when the assignee is not an active officer (it shows the first officer in the list), and **an alert cannot be unassigned**. RBAC D12. (`SensorOverview.jsx`) | `#/monitoring` | main | [P09](P09-alert-wrong-assignee.png) |
| 10 | **Sensor nodes have no delete, no alert-limit fields and no device keys**, which RBAC.md gives admins. Needs a decision: build them, or change RBAC.md. | `#/nodes` | main | - |
| 11 | **The New discussion form makes the page scroll sideways**: always on phone, and on desktop when a plant has a long name (the "About a field record" list sizes itself to the longest name). | `#/discussion` | main | [P11](P11-discussion-form-overflow-phone.png) |
| 12 | **The Scan page's "sample tags from published plants" are hardcoded** (`initialPublicPlants`) and open "Tag not found". | `#/scan` | main | [P12](P12-scan-hardcoded-sample-tags.png) |
| 13 | **The plant catalogue says "No species match, try a different name"** while it is still loading or when the server fails, instead of "Loading…" or "Could not load". | `#/plants` | main | [P13](P13-catalogue-no-match-on-error.png) |
| 14 | **Phone Back button with the enlarged map open leaves the plant page.** After a QR scan it leaves the site. | `#/tag/<qr>` | main | - |
| 15 | **Tables don't fit on a phone and give no hint that they scroll**: Reports, Monitoring, Users, Sensor nodes. The Reports table is also cut off on desktop at 1440 px. | several | main | [P15](P15-reports-table-phone.png) |
| 16 | **The tag page header squeezes a long plant name into a narrow column** (about 150 px) when the action buttons fit beside it. | `#/tag/<qr>` | branch (more buttons) | [P16](P16-tag-header-squeezed.png) |

## Minor findings

**From the unpublish/review branch**
- "Publish again" looks clickable when it is refused. Only a hover title explains why, and a phone has no hover.
- The panel after a decision says the wrong thing: "…is done" after a send-back, and "Approved and published" after approving and then pressing Publish again.
- The Unpublished notice says "Use Review tag…" while that button is hidden (a record is waiting), and still says "send it back" after it was sent back.
- An unpublished plant that was sent back loses its "Unpublished" chip.
- There is no dashboard filter for unpublished plants.
- Review mode still opens while the plant is with the botanist, so an officer can delete the photo the botanist is fixing. RBAC D18 doesn't say whether this is allowed: team decision.
- The tag page of a normally returned plant (not unpublished) gives no reason and no "Fix and resend", although the sent-back one does.

**Already on main**
- **Unsaved work lost without warning:** the fixes typed into a returned observation, and the Add plant form, are lost on Back, navigation or reload.
- **Developer text on screen:** the "API Connected" bar, "Refresh / Sync with Backend API", the "Live API" chip, the build hash in the footer, and "Cannot reach the API server (Render)". Make sure demos run a production build.
- **Inconsistent wording:**
  - "record" is used for observations and for tagged plants (RBAC.md §11).
  - One status has several names: Returned / Sent back; Needs review / Waiting for review / With an officer; Threatened / Endangered; Unused / Ready to use.
  - The Scan page uses Title Case.
  - Plurals are wrong ("1 plants").
  - Two pages are both titled "My records".
- **Discussion "People" search:** capped at 8 names, no "nobody found" message, no arrow keys, plain substring matching.
- **Visitors:**
  - `#/dashboard` shows the catalogue instead of "You can't open this page".
  - The tag page has two different layouts depending on the data, one showing "by Unknown" and raw GPS numbers.
  - A photo that fails to load leaves a blank box.
  - The error page has no "Try again" button.
  - Multi-word search fails ("pitcher plant").
  - The contact email is a placeholder (`info@daunsense.example`).
  - The browser tab title never changes.
- **Admin:**
  - "Correct email" is offered only for active accounts, and accepts the same address.
  - The hide-location switch is missing when a plant has no GPS.
  - The Monitoring note "every officer and admin is notified" contradicts alert routing.
  - RBAC.md §2 says to remove the admin's Species link, but it is still there as a read-only page. Change the doc or the sidebar.
- **Botanists** see a "Has a sensor node" tile and filter (RBAC: no sensors).
- **Defence in depth:** if the API ever sent a protected plant's coordinates to a visitor, the visitor map and tag page would show them. The server sends none today (D9), so this is a safety net, not a leak.

## Cosmetic

- Mixed formats: "12:47 PM" vs "04:30 pm", a mm/dd/yyyy date filter vs "30 Oct 2026", "18 to 35 °C" vs "30°C", a temperature without a unit, bare "-" for empty values.
- Spacing: notices touch each other, toasts cover content, placeholders are cut off on phone, the map's status pill covers the map credits, tabs wrap on phone.
- Small tap targets on phone (footer links, breadcrumb, map +/-).
- The "Delete plant" confirm button is green, while "Unpublish" is red. In review mode on phone, "Undo" is the most prominent button.
- "Unknown node", and "Unknown" vs "Former member" for deleted accounts.

## Fix checklist

Tick items off as they are fixed. `#n` is the number in the blocker and major table above. Each
item says what "done" looks like, so it can be checked on the screen.

### A. Before the unpublish branch is merged (`rick-fix-officer-tag-plant-page`)

- [ ] **#1 Review queue wording.** For an unpublished plant, `#/review` shows **Approve** (not
      "Approve & publish"), no PUBLISH word, the note that the plant stays unpublished, and the
      "approved and published" line no longer appears. Pass `unpublished` to `decisionPrompt` in
      `Review.jsx:199`, and fix the button text (`:339`) and the sentence (`:346`).
- [ ] **#2 Publish again with an unsaved draft.** Pressing Publish again while review mode has
      changes either asks "Discard your changes and publish?" or is blocked until the officer
      saves or discards. The draft is never dropped silently.
- [ ] **#3 "Published" on an unpublished plant.** One shared label (for example a helper
      `statusLabel(status, withdrawn)`) used by the Visits tab, My records (chip, row text and
      tile) and Reports (table and CSV). Done when no page says "Published" for an unpublished
      plant, and the Reports tile and table agree.
- [ ] **#4 Fixing a returned observation.**
  - [ ] Check the height before any photo is saved (`Records.jsx` `sendAgain`), and show
        "Height must be a number of 0 or more" next to the field.
  - [ ] A blank or non-number height keeps the old value, or asks first. It is never sent as empty.
  - [ ] When `resubmit()` refuses, it always shows a message (`StoreProvider.js` ~1342).
- [ ] **#16 Tag page header.** A long plant name gets the full width. The action buttons wrap
      below it instead of sitting beside it (waiting for review, Unpublish panel open, review mode).
- [ ] **Publish again looks available when it isn't.** Style it as disabled and show the reason
      under the button (a hover title doesn't work on a phone).
- [ ] **Decision panel text.**
  - [ ] After a send-back it does not say "is done".
  - [ ] After Publish again it does not say "Approved and published".
  - [ ] Only one box says "sent back", not three.
- [ ] **Unpublished notice text.** It mentions "Review tag" only when that button is shown, and
      stops saying "send it back" once the plant is sent back.
- [ ] **"Unpublished" chip** stays visible after a send-back (for example "Unpublished · sent back").
- [ ] **Dashboard.** Add a view or filter for unpublished plants. Fix "All 1 tagged plants…".
- [ ] **Returned plant (not unpublished).** Its tag page shows the officer's reason and a
      "Fix and resend" button, like the sent-back one.
- [ ] **Tag page Overview** keeps showing Height and Appearance after a send-back (use the latest
      observation, not only an approved one), or explains why they are hidden.
- [ ] **Decision needed (team):** may an officer edit in review mode while the plant is with the
      botanist? If not, disable Save and photo removal until the botanist resends. Write the answer
      into RBAC.md D18.

### B. Permissions and privacy

- [ ] **#5 Edit photos on someone else's plant.** The pencil appears only for photos the botanist
      recorded (check `recorded_by`), and the editor lists only those. Officers keep it where
      RBAC allows.
- [ ] **#6 Protected plant note.** A visitor's tag page for a protected plant says "This plant's
      exact location is hidden to protect it." Check `location_reduced` and `endangered`, not only
      `lat == null` (`Specimen.jsx`).
- [ ] **Defence in depth.** `shownCoords()` (`selectors.js`) and `PublicPlant.jsx` never draw a pin
      or map for a visitor on an endangered or `location_reduced` plant, whatever the API sends.
- [ ] **Visitors see a "recorded by" line.** The visitor tag page no longer shows "by Unknown" or
      raw GPS accuracy, and uses one layout whichever way the data arrives.
- [ ] **Botanist "Has a sensor node" tile** removed from the botanist's plant list.
- [ ] **Review comments on others' observations.** The Visits tab shows review decisions and
      comments only on the botanist's own observations (RBAC D16), even if the API ever sends more.

### C. Admin and officer screens

- [ ] **#8 Approving an account.** The pending-accounts list has a role picker. The switch cannot
      turn an account on without a role. The dialog says "approve", not "back on". A role-less
      account never shows "Botanist".
- [ ] **#9 Alert assignee.** The card names the real assignee, or says "No longer valid".
      An alert can be unassigned ("Nobody yet" option).
- [ ] **#10 Sensor nodes.** Decide: build delete, alert limits and device keys, **or** edit RBAC.md
      (summary table and the Admin "Can" list) to what is actually offered.
- [ ] **Monitoring note** no longer says every officer and admin is notified (it depends on alert
      routing).
- [ ] **"Correct email"** is available for pending and turned-off accounts, and refuses the same
      address.
- [ ] **Hide-location switch** is shown for a plant with no GPS fix, for admins.
- [ ] **Species link for admins.** Either remove it from the admin sidebar, or change RBAC.md §2
      ("Remove the Species and QR tags links") to say the read-only page stays.

### D. Visitors and sign-in

- [ ] **#7 Sign in with a username.** Either the API accepts a username, or the label says
      "Email" only. A username never gets a made-up "Wrong email or password".
- [ ] **#12 Scan page samples.** Show only plants the API really sends, or hide the "sample tags"
      line.
- [ ] **#13 Catalogue loading and errors.** "Loading plants…" while loading, and "Could not load
      plants. Try again" (with a button) on failure. Never "No species match" when nothing was
      typed.
- [ ] **#14 Phone Back button.** Back closes the enlarged map and stays on the plant page.
- [ ] **Tag error page** has a "Try again" button. A photo that fails to load shows a small
      message, not a blank box.
- [ ] **Empty tag code.** `#/tag/` and "Open Plant" with an empty box show "Enter a tag code".
- [ ] **`#/dashboard` for a visitor** shows "You can't open this page", like the other staff
      routes (add `dashboard` to `NEEDS` in `routes.js`).
- [ ] **Search.** Multi-word and plain-word queries work ("pitcher plant", "flower").
- [ ] **Contact page.** A real email address, and no full stop after "Kuching, Sarawak".
- [ ] **Browser tab title** changes per page ("Giant pitcher · Daun Sense", "Tag not found · Daun Sense").

### E. Layout and phone

- [ ] **#11 New discussion form.** No sideways scroll on phone or with a long plant name
      (limit the width of the "About a field record" list).
- [ ] **#15 Tables on phone.** Reports, Monitoring, Users and Sensor nodes become cards like
      `#/dashboard/all`, or show a clear scroll hint. Fix the Reports table cut-off at 1440 px.
- [ ] Placeholders are not cut off (home search, Reports search); family chips show a fade or
      arrow when the row scrolls; map status pill does not cover the credits; tabs don't wrap
      "Discussion 0" onto a second line.
- [ ] Tap targets on phone are at least 44 px (footer links, breadcrumb, map +/-, sync button).
- [ ] "Delete plant" confirm is styled as dangerous (red). "Undo" is not the primary button.
- [ ] Notices and toasts: space between stacked notices; a toast never covers content.

### F. Wording sweep (one pass, one owner)

- [ ] Replace "record" with **tagged plant**, **observation** or **revisit** (RBAC.md §11):
      dashboard, My records, review queue, Reports, Discussion ("a plant or a record"),
      delete dialog.
- [ ] One name per status everywhere:
  - [ ] Returned / **Sent back**
  - [ ] **Waiting for review** (not "Needs review" / "With an officer" / "awaiting review")
  - [ ] Endangered (not "threatened" in the catalogue banner)
  - [ ] Unused / Ready to use; On a plant / Assigned
- [ ] Two pages named "My records" get different names; sidebar and page title match.
- [ ] Sentence case on the Scan page and map ("Locate me", "Open plant"); say "tagged plant", not
      "specimen".
- [ ] Plurals ("1 plant tagged", "1 plant · locations hidden").
- [ ] Date, time and unit format: one style ("30 Oct 2026", "4:30 pm", "30 °C", date filter in
      the same style). Units on temperature values. "-" replaced by "Not recorded".
- [ ] Remove developer text from screens: "API Connected" bar, "Refresh / Sync with Backend API",
      "Live API" chip, build hash in the footer, "(Render)" in the network error. Replace the raw
      "Internal server error" with plain words.
- [ ] Discussion People search: show all names (scrolling list), "Nobody found" message, arrow
      keys, matching that ignores the order of name parts. (You raised this earlier.)
- [ ] Unsaved work: a prompt before leaving a returned record's fixes and the Add plant form.

### G. Tests

- [ ] Fix or delete the 20 outdated browser tests (they fail on `main` too): `role-pages.spec.js`
      (looks for a `.roleswitch` that is gone), `agent-jira-traceability.spec.js`,
      `agent-advanced.spec.js`, `agent-audit.spec.js`, `live-review-map.spec.js` (the "vulnerable
      plant hidden by default" test contradicts D11), `account-page.spec.js`.
- [ ] Add browser tests for D17 and D18 (unpublish, review mode, send back, publish again,
      approve keeps it unpublished) using the fake API.
- [ ] Add a check that no page says "Published" for an unpublished plant (#3).
- [ ] Fix the persona test harness note: add custom `page.route` handlers **after** `mockApi()`.

### H. After the fixes

- [ ] Apply the pending migrations to Daun Sense Test, then run **phase 2** (live) with one
      account per role.
- [ ] Re-run the seven personas and tick this list against their new findings.

---

## What worked well

- **Permissions in the website match RBAC.md for every role**, including D15, D17 and D18: every forbidden page shows "You can't open this page", and no forbidden button appears.
- **No protected plant's location reached a visitor** anywhere tested (map, tag page, species page, search).
- **The unpublish/review cycle works:**
  - unpublishing needs a reason and the typed word;
  - the review-mode draft is correct (the "Unsaved: …" list, the change list in the Save dialog, Discard asks first);
  - send back and resend work;
  - approving on the tag page keeps the plant unpublished;
  - Publish again refuses with clear messages.
- **Fixing a returned observation:** a failed photo upload stops the record from being sent. The botanist's "Sent back for review" page is clear.
- **Double-clicks** send only one request.
- **Display:** the dark theme is consistent, focus rings are visible, light-theme contrast passes, no page scrolls sideways (apart from the ones above), and there were no "undefined" values or console errors in 72 page loads.

## Not covered yet (phase 2, against the Test database)

These need the Daun Sense Test project with all migrations applied and one account per role:
- database and API rules end to end;
- the offline outbox;
- camera QR scanning;
- map tiles;
- emails (reset, invitations);
- last-admin protection.

---

## Appendix: each persona's findings

The agents' own write-ups, shortened. File and line numbers refer to the tested code (`8f7b0ee` plus `ca836d0`).

### Tourist Tim (visitor, phone)

Persona: Tourist Tim (52, phone, weak signal, non-technical) · Role: Visitor · Viewports: phone mostly, desktop once · Checks: 24 (40 tests)

1. MAJOR — #/scan "Try a sample tag from published plants" shows 6 hardcoded tags (initialPublicPlants, StoreProvider.js:461-464, shared/data.js:64) that open "Tag not found"; footer says "0 plants to explore". Hardcoded data presented as live (and points to real Supabase photo URLs). Confirmed (fake API).
2. MAJOR — #/plants on slow load or 500 says "0 species · No species match · Try a different name" instead of loading/failed; top bar still says "API Connected". Confirmed.
3. MAJOR — Phone Back with the enlarged map open leaves the plant page (to about:blank if arrived from a QR scan) instead of closing the map. Confirmed.
4. MINOR — Developer text shown to visitors: "API Connected", "Refresh / Sync with Backend API" (RoleSwitch.jsx "local development bar"), "Live API" chip (Catalogue.jsx:132), version hash in footer.
5. MINOR — Visitor tag page has two layouts depending on data source; the staff-style one shows "First recorded … by Unknown" and raw GPS "3.80000, 113.77000 · ±5 m" (Specimen.jsx:54-55). Protected plants stay hidden in both. Likely.
6. MINOR — Failed photo leaves a blank box, no message (Img.jsx:12-14).
7. MINOR — Tag error page says "Please try again" with no Try again button (PublicPlant.jsx:36-46).
8. MINOR — Counts disagree/plurals wrong: footer "1 plants to explore", "0 endangered" vs hero "1 threatened".
9. MINOR — Catalogue search fails on multi-word/plain queries ("pitcher plant", "flower").
10. COSMETIC — Search placeholder cut off on phone; hero counts overlap the artwork.
11. COSMETIC — Enlarged map: "Locate Me" clipped left; status pill covers map credits.
12. COSMETIC — Small tap targets (footer links 17-19px, breadcrumb 44x17, sync 30x22, map +/- 30x30) and 10.8-12.6px labels on phone.
13. COSMETIC — QR page opens with jargon ("TAG NIAH-0001 · NEPENTHACEAE", Family/Genus) and no plain sentence when a species has no description.

What worked well: protected plants show the note and no map; public map says "1 endangered plant is not shown"; clear "Tag not found" page; staff routes show "You can't open this page" with no data leak; no sideways scrolling on phone; manual tag entry is forgiving; About/Contact in plain language.

Not tested: camera scanning, map tiles, dark mode, plant book print, 429 message, screen reader, live API.

### Karen (visitor)

Persona: Karen (picky visitor) · Role: Visitor · Viewports: desktop 1440, phone 412, 640 and 320 widths, dark and light · Checks: 24

D9: no coordinate leak found anywhere.

1. MAJOR — Protected plant's tag page (#/tag/NIAH-0002, plant in public workspace with lat/lng null, location_reduced true — as the real API sends) says "Location not captured when this plant was recorded." instead of the D9 note. Specimen.jsx:408 checks only lat == null.
2. MAJOR — #/login: signing in with a username never works when signed out; looked up in empty db.profiles, "Wrong email or password" shown with 0 API calls (StoreProvider.js:836-843).
3. MINOR — Two different visitor tag pages (Specimen vs PublicPlant); the Specimen one shows "First recorded … by Unknown" (RBAC: visitors don't see who registered), empty Photos tab, no status.
4. MINOR (defence in depth) — If the API ever sends coordinates for a protected plant, PublicPlant.jsx draws a map for an endangered plant and shownCoords() (selectors.js:86-89) pins a location_reduced plant. Server sends none today.
5. MINOR — Technical words: "Cannot reach the API server (Render)…" (StoreProvider.js:98), raw "Internal server error", "API Connected" badge, "Refresh / Sync with Backend API", "Live API" chip, build string in footer.
6. MINOR — #/contact email is a placeholder "info@daunsense.example" (publicContent.js:36); "Kuching, Sarawak." stray full stop.
7. MINOR — "1 threatened" (catalogue banner) vs "endangered" elsewhere; "1 tagged plant · locations hidden" plural.
8. MINOR — #/tag/ (empty) → "There is no published plant on tag yet."; #/scan Open Plant with empty box does nothing.
9. MINOR — #/dashboard and #/dashboard/all show the public catalogue to visitors instead of "You can't open this page" (dashboard missing from NEEDS in routes.js); "Go to login" vs "Staff sign in".
10. COSMETIC — Title Case and off-list words: Scan page ("Scan Plant QR Tag", "Open Plant"…), "Locate Me", "specimen", "Reload Page", "Loading view...", "Checking..." vs "Saving…", "records" in About/Home.
11. COSMETIC — Home search placeholder cut off on phone; at 320px map status pill covers credits; family chips cut off with no scroll hint.
12. COSMETIC — Browser tab title never changes.

What worked well: map leaves protected plants off and says so; species page hides map for endangered; neutral wrong-password message; one request on double-click; reset page clear and wraps on phone; staff pages refused politely; no horizontal scroll at any width; contrast ≥4.5:1 in light theme; logical tab order with visible outline; friendly 404 and Tag not found.

Not tested: camera, map tiles, reset email delivery/expired link, screen reader, real 200% zoom.

### Rookie Rina (botanist)

Persona: Rookie Rina (new field botanist) · Role: botanist · Viewports: desktop main, phone once · Checks: 24

1. BLOCKER (UI) — Botanist gets "Edit photos" on another botanist's approved plant (#/tag/NIAH-0001 recorded by Bo); Save sends DELETE /observations/<Bo's obs>/photos/<id> and toasts "Photos saved". Specimen.jsx:80 has no ownership check. (Same as karen-botanist #1.)
2. MAJOR — #/records Send again with Height -5: photo changes (PATCH caption, POST upload) are saved first, then resubmit() returns {ok:false} with NO message and no submit (StoreProvider.js:1342 returns without notify; Records.jsx sendAgain writes photos before validating). Height input min=0 not enforced (not in a form).
3. MAJOR — Clearing Height or typing letters sends height_cm:null with success toast "Record sent for review again".
4. MINOR — Back on #/add loses the half-filled form, no prompt.
5. MINOR — Plain returned (not unpublished) plant's tag page shows only a "Returned" chip: no reason, no Fix and resend (callout at Specimen.jsx:229 only when withdrawn). (Same as karen-botanist #11.)
6. MINOR — Chip "Needs review" sounds like the botanist must act; tile "With an officer"; RBAC says "Waiting for review".
7. MINOR — Rejected record shows reason but no next step or link.
8. MINOR — Botanist home doesn't mention unsent drafts; no "My records" card.
9. MINOR — Photo editor title "Edit captions or remove photos" though it can add (icon-only upload button); Close/Escape/click-outside drop changes without asking (PhotoEditor.jsx:110).
10. MINOR — Discussion People search shows nothing (no "Nobody found") for typos or reordered names; plain substring match.
11. MINOR — #/add latitude 300 typed by hand: no inline message; status says "Not captured yet" (AddPlant.jsx:148).
12. COSMETIC — Toast covers content (#/add "No location", #/discussion filter tabs).
13. COSMETIC — Tag page "Height -" when the only observation has a height (only approved count).
14. COSMETIC — Footer "1 plants tagged".

What worked well: failed photo upload stops the send with a clear message and keeps the draft; sent-back tag page correct (chip, reason, Fix and resend opens the record first, no "Published"); double-clicks send once; all forbidden pages refused; Add plant/Discussion explain mistakes; private thread sends share_users correctly; My records fits on phone.

Not tested: offline outbox, camera/QR, getting past the review lock, whether the real API refuses DELETE on another's photo, @mentions and post edit/delete.


### Karen (botanist)

Persona: Karen the botanist (picky veteran) · Role: botanist (user ME) · Viewports: desktop 1440x900, phone Pixel 7 412x915 (light and dark) · Checks run: 20

1. BLOCKER — Botanist is offered "Edit photos" on another botanist's tagged plant (#/tag/NIAH-0006) and can rewrite captions (PATCH) or delete photos (DELETE, no confirm). Cause: Specimen.jsx:80 canEditPhotos ignores recorded_by/registered_by; editor lists all plant photos. Confirmed (UI); real API/RLS may refuse.
2. MAJOR (blocker if API sends them) — Visits tab shows review comments on other botanists' observations; Visits (Specimen.jsx ~831-862) does not filter db.reviews by recorded_by === me (RBAC D16). Unsure: depends on API.
3. MAJOR — #/records labels an unpublished plant's approved observation "Published" (chip + "Published to the plant library.") and counts it in the Published tile. Records.jsx:68, 211; tokens.js:107. Confirmed.
4. MAJOR — Unsaved fixes on a returned observation are lost without warning on navigate/Back/reload (#/records). Confirmed.
5. MAJOR — New discussion form overflows: desktop page 1707px in 1440 viewport with a long plant name (the "About a field record" select sizes to the longest option); phone 524px in 412 even with short names. Confirmed.
6. MINOR — "Sent back for review" is called "Returned" everywhere except the tag page (#/records, #/dashboard, #/dashboard/all, Visits). Records doesn't say the plant is unpublished.
7. MINOR — Three words for waiting-for-review: chip "Needs review", tile "With an officer", row "Waiting for an officer…", tag page "pending an officer's review". RBAC says "Waiting for review".
8. MINOR — Two pages both titled "My records" (#/records and #/dashboard/all; sidebar calls the second "My plants"); "record" used ambiguously in many places (RBAC §11).
9. MINOR — Botanist's #/dashboard/all shows a "Has a sensor node" tile/filter (RBAC: botanists cannot see sensors).
10. MINOR — Discussion People search silently capped at 8 (Discussion.jsx:401 .slice(0, 8)), no "no match" message, no arrow keys.
11. MINOR — A plain returned (not unpublished) plant's tag page has no reason callout and no "Fix and resend"; Height shows "-" for her own unapproved measurement.
12. MINOR — #/records rows don't link to the tagged plant; "version 1" shown to botanists.
13. COSMETIC — Long tag ID breaks as "NIAH-"/"0001" in the phone breadcrumb; tabs wrap; a 900-char reason is shown in full (phone page 12,800px long).

What worked well: double-click "Send again" sends one request; stale-tab resend gives a clear message; every forbidden page shows "You can't open this page" and no forbidden officer action appears on any tag page; photo editing locked with explanation while waiting for review; no horizontal overflow on most phone pages; dark theme readable, focus rings visible; sent-back callout clear.

Not tested: Add plant / revisit submit (camera/GPS); whether the real API refuses edits on Bo's photos or withholds others' reviews; discussion post edit/delete; account save and password change.


### Careful Carla (officer)

Persona: Careful Carla (senior conservation officer) · Role: officer · Viewports: desktop, phone · Checks: 24

1. MAJOR — #/review queue says "Approve & publish" for an unpublished plant and asks for PUBLISH; afterwards "This record was approved and published." Plant correctly stays unpublished. Review.jsx:199 (decisionPrompt without `unpublished`), :339 button text, :346. Contradicts the tag page (D17).
2. MAJOR — "Publish again" works while review mode has unsaved changes: publishes with old species/photos and drops the draft without the Discard prompt.
3. MINOR — Visits tab chip says "Published" for the approved observation while the plant is unpublished (tokens.js:107, Specimen.jsx:843).
4. MINOR — Review mode opens and saves while the plant is with the botanist (returned): officer can delete the photo the botanist is fixing. Review-mode chip says "Unpublished" while header says "Sent back to botanist". (Specimen.jsx:183) D18 silent — may be intended.
5. MINOR — "Publish again" looks enabled when refused (aria-disabled + hover title only; no title on phone).
6. MINOR — After sending back, the done panel says "NIAH-0001 is done"; three boxes say roughly the same thing.
7. MINOR — After approve then Publish again, the done panel changes to "Approved and published" (Specimen.jsx:261).
8. MINOR — Unpublished callout says "Use Review tag…" while only "Review record (Action needed)" is shown (synced) (Specimen.jsx:223).
9. MINOR — After a send-back, Overview Height "-" and Appearance gone (only approved observations used).
10. MINOR — #/dashboard/all: no view/filter for unpublished plants; lead "All 1 tagged plants are up to date"; "1 plants".
11. COSMETIC — Species page lists the unpublished plant with no marker.
12. COSMETIC — Typed confirmation words not case-sensitive (Bits.jsx:89).
13. COSMETIC — "Undo" on a removed photo is the filled primary button, most prominent on phone.

What worked well: published plant shows Unpublish only (no Review tag, no hide switch); unpublish needs reason + UNPUBLISH and the page/callout/dashboard update correctly; review-mode draft "Unsaved" text, Save change list (red + "deleted for good" warning), Discard prompt only when dirty, only changed fields written; send back needs reason and names botanist/date; Publish again refusals clear (page check and 409); tag-page approve shows "Approve" + stays-unpublished note; species page no pencil, "Unpublish species"; phone layout clean.

Not tested: botanist side (simulated), visitor view of unpublished plant, Unpublish species confirm, create species from review mode, half-failed save.

### Karen (officer)

Persona: Karen the officer · Role: officer · Viewports: desktop 1440, phone 412, light and dark · Checks: 22 (18 pages x 2 themes x 2 viewports + close-ups)

1. MAJOR — #/reports shows "Published" for an unpublished tagged plant; table shows 2 Published vs tile "1 Published"; CSV same. ReportSummary.jsx:82 uses STATUS_TEXT[p.status] and ignores withdrawn (Dashboard.jsx:73 handles it).
2. MAJOR — Tag page header squeezes the plant name into a ~150px column when the action buttons fit on one line (waiting-for-review page, published page with Unpublish panel open, Review mode): name wraps 7 lines, date breaks mid-line.
3. MAJOR — #/reports and #/monitoring tables don't fit on phone (1094/344, 838/344), no scroll cue, chips cut; Reports clipped on desktop at 1440 (Location column).
4. MINOR — Blocked "Publish again" looks clickable (aria-disabled only, full opacity, pointer); empty Unpublish reason only reported as a toast.
5. MINOR — "Record" used instead of RBAC words (StaffHome.jsx:96,107; Review.jsx:53,116; Specimen.jsx:180,186; ReportSummary.jsx:82,156; Discussion.jsx:122); "Review tag" sounds like reviewing the QR tag.
6. MINOR — Same status, different names: Returned/Returned to botanist/Sent back…; Needs review/Waiting for review/awaiting review; Threatened/Endangered; Ready to use/Unused; On a plant/Assigned. Unpublished+sent back loses the "Unpublished" chip.
7. MINOR — Sidebar lists "Species catalogue" and "Species" with the same icon; #/notifications has no sidebar or Back button.
8. MINOR — Footer shows git hash "v1.0.343 · a1c626a+changes" in production builds (Chrome.jsx:202). Dev bar is dev-only (Site.jsx:31): demo on a production build.
9. COSMETIC — Mixed formats: "12:47 PM" vs "04:30 pm"; mm/dd/yyyy date filter vs "30 Oct 2026"; "18 to 35 °C" vs "30°C"; "Temperature 41" no unit; bare "-"; "1 Nodes online of 2".
10. COSMETIC — Unpublished/Sent back notices and first notification card touch the element above.
11. COSMETIC — Self-contradicting wording: Publish-again dialog "Visitors will be able to see it" then "visitors will not see it until the species is"; NIAH-0004 notice says "send it back" when already sent back; "Officer Review · … (Observation v1)" Title Case; "Approve & publish" ampersand; "Profile strength 0%" with name filled.
12. COSMETIC — "Delete plant" confirm button is pale green (Unpublish is red).
13. COSMETIC — "Unknown node"; Discussion.jsx:841 "Unknown" vs "Former member".
14. COSMETIC — Phone: lone 7th tile; pill strip cut with no fade; tabs wrap; Reports placeholder truncated; Review-mode caption box clips 200-char caption.

What worked well: consistent dark theme, remembered theme switch; visible focus ring; no undefined/null/NaN/UUID and no console errors in 72 loads; long text wraps, no page sideways scroll; #/dashboard/all cards on phone; dialogs fit and close on Escape; unpublished/sent-back notices say who/when/what next.

Not tested: publish/unpublish/send-back end to end (fake API), print and CSV contents, real map tiles and photos.

### Security Sam (admin)

Persona: Security Sam (system administrator) · Role: admin · Viewports: desktop, phone · Checks: 27

1. MAJOR — #/users: approving a pending account can't give it a role. The switch sends only {is_active:true}; the dialog says "back on"; once active, a role-less account's dropdown shows "Botanist". RBAC: "approve new accounts and give them a role". Admin.jsx:253, :113, :265, :224.
2. MAJOR — #/monitoring: an alert assigned to a non-active-officer (another admin, a turned-off officer) shows "Olive Officer" (first option) as assignee; there's no "Nobody yet" option once assigned, so alerts can't be unassigned. D12. SensorOverview.jsx:483, :504-508.
3. MAJOR — #/nodes: no delete, no alert-limit fields, no device keys, though RBAC gives admins "register, edit (including alert limits) and delete nodes; manage device keys". Monitoring says "Same range for every node". SensorNodes.jsx:108-110; SensorOverview.jsx:398.
4. MINOR — Monitoring text "every officer and admin is notified" contradicts alert routing. SensorOverview.jsx:398.
5. MINOR — "Correct email" only in the Active table (Admin.jsx:219); same address accepted.
6. MINOR — Phone: #/users and #/nodes tables are 718/804px inside 344px, actions off-screen with no hint.
7. MINOR — Hide-location switch missing when a plant has no GPS (Specimen.jsx:382-405 renders it only with coordinates). D15.
8. MINOR — RBAC.md §2 says remove Species and QR tags links from the admin sidebar; Species link remains (read-only page, fits D6). Doc or sidebar should change.
9. COSMETIC — Footer "1 plants tagged"; desktop Monitoring sidebar badge pale pink on pale pink.

What worked well: forbidden pages closed with a way back and no officer links; tag page shows no D17/D18 officer actions for admin, keeps the hide switch (locked for Endangered); species read-only; own row protected; no name editing; audit log read-only and clear; routing and assign lists offer only valid people.

Not tested: last-admin protection (server rule), real saves, discussion moderation, dark mode.
