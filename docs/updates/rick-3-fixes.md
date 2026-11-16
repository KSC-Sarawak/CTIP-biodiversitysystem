# Branch `rick-3-fixes`: Monitoring rework, stable-range alerts, and easier-to-read pages

*Written 16 Nov 2026. Covers everything on this branch compared with `main` (`34d1519`):
`c94a0fd` (personal node names and stable-range alerts), `2284b95` (items 4–8) and
`d266b6f` (items 9–10), plus the review fixes of 16 Nov (item 11). Web app, API and
database; the mobile app only for item 11.*

| # | What | Where | State |
|---|---|---|---|
| 1 | Officers and admins can give a sensor node their own name | Monitoring, API, DB | Committed |
| 2 | Alerts come from one fixed "stable range" per reading, checked in the database | DB, settings file, script | Committed |
| 3 | Monitoring page rebuilt: urgent things first, red parts on the charts, time slider, one Alerts section | Monitoring | Committed |
| 4 | Monitoring: the node list is now a normal table | Monitoring | Committed |
| 5 | Account page redesigned: greeting, profile strength, password checks | Account | Committed |
| 6 | Audit log: a coloured badge per kind, a one-line change, Expand for the full change | Admin → Audit | Committed |
| 7 | Long lists show 10 rows at a time with **View more** | Species, QR tags, Dashboard | Committed |
| 8 | QR tags list shows a small preview of each code | QR tags | Committed |
| 9 | Reset emails link back to the site they were asked from (Cloudflare or localhost) | API | Committed |
| 10 | "Forgot password" works again for staff with two-step sign-in | API, sign-in page | Committed |
| 11 | Review fixes: lost-phone reset needs its password step (security), mobile shows the stable range, two smaller fixes | API, DB, mobile, web | Committed |

Read [Before this goes live](#before-this-goes-live) before merging. The
[security problem](#security-problem-found-email-alone-can-remove-two-step-sign-in) found while
building item 10 is **fixed** on this branch (item 11).

---

## Before this goes live

- [x] **Database migrations, before merging.** Done 2026-11-16: both are applied to the live
      database and to the test database. Render redeploys the API from `main` as soon as this
      merges, and the new API needs both tables:
  - `supabase/migrations/20261116091220_node_nicknames_and_stable_range_alerts.sql`
  - `supabase/migrations/20261116091336_mfa_recovery_proofs.sql`: without it, **Lost your phone?**
    step 1 answers "Two-step sign-in is not working right now"

  The file names carry the versions live recorded, so `npx supabase db push` has nothing left
  to do. Both are safe to run more than once.
- [x] Checked on live: `sensor_node_nicknames`, `sensor_stable_ranges` and `mfa_recovery_proofs`
      exist with RLS on, `sensor_stable_ranges` has 3 rows (temperature 18 to 35, humidity 40 to
      100, soil_moisture 20 to 80), the alert trigger is in place, and signed-in users and
      visitors cannot reach `mfa_recovery_proofs`.
- [ ] **Redeploy the Render API.** Without it, renaming a node fails, and the Monitoring page
      falls back to the ranges in the settings file (it still works, but cannot show what
      the database holds).
- [ ] **API contract changed** (`packages/api-contract/openapi.yaml`): new route
      `PUT /sensor-nodes/{id}/nickname`, two new lists in the workspace load, and the
      `thresholds` description. The contract test asks for **two approvals**.
- [ ] **Supabase redirect list** (main project, Authentication → URL Configuration). Without
      it, reset links still open `localhost` (item 9):
  - **Site URL:** `https://ctip-biodiversitysystem.pages.dev`
  - **Redirect URLs:** add all four:
    ```
    https://ctip-biodiversitysystem.pages.dev/**
    https://*.ctip-biodiversitysystem.pages.dev/**
    http://localhost:*/**
    http://127.0.0.1:*/**
    ```
- [ ] Optionally set `PASSWORD_RESET_REDIRECT_URL=https://ctip-biodiversitysystem.pages.dev/` on
      Render. It is only used for requests with no browser address, such as the mobile app.
- [ ] **The Render API redeploy above is also needed for item 10.** Until then, a reset on the live site
      fails with "Sign in again and enter the 6-digit code…".
- [ ] Delete the test account left in **Daun Sense Test**: run
      `delete from auth.users where email = 'reset-flow-test@example.invalid';` in its SQL editor.
- [ ] Try **Lost your phone?** end to end on the live site after the redeploy: sign in with the password,
      Lost your phone?, open the new email, set up the new app.

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

## 4. Monitoring: node list as a table

The node cards are replaced by a standard table: **Node, Status, Temp, Humidity, Soil,
Distance, Motion, Updated**, and a rename button. Values outside the range are red. The open
alert link sits under the status. The selected row is highlighted, and the whole row is
still clickable. The page no longer uses the `plain` shell, so it matches the other pages.

## 5. Account page redesign

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

## 6. Audit log

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

## 7. Long lists: 10 at a time

New hook `apps/web/src/useViewMore.jsx`: shows `step` rows, then *Showing X of Y*, **View N
more**, **Show all** and **Show less**.

- **Species:** 10 at a time; a new search or sort starts again at 10. New **Plants** column
  (how many plants of that species). Sorting is now case-insensitive and number-aware
  (*Species 2* before *Species 10*). An empty family shows `-`.
- **QR tags:** 10 at a time.
- **Dashboard (tagged plants):** 10 rows per page by default (was 25).
- These tables use a new `roomy` style: more padding, bigger text.

## 8. QR tags: code preview

`apps/web/src/pages/Tags.jsx`. The tag ID cell now shows a small QR preview with the ID.
Clicking it opens the big, scannable code. The separate **QR** button is removed.

## 9. Reset emails open the right site *(uncommitted)*

**Bug:** a colleague clicked the link in a password-reset email and got "localhost refused to
connect". The email sent people to `localhost`, so it only worked on a computer running the
dev server.

**Cause:** the reset email's link address was `PASSWORD_RESET_REDIRECT_URL`, else Supabase's
Site URL. Neither was set to the real site, so Supabase used its default, a `localhost` address.

**Fix:** new `services/api/src/resetRedirect.js`. The link goes back to the site the request came
from (the browser's `Origin` header), when that site is one of ours:

- `https://ctip-biodiversitysystem.pages.dev`, and its preview copies (`https://<anything>.ctip-biodiversitysystem.pages.dev`)
- `http://localhost:<any port>` and `http://127.0.0.1:<any port>`
- anything in `CORS_ORIGINS`

Any other address is ignored, including look-alike domains and plain `http://` for the real
site, so a reset link can never hand a session to someone else's site. With no `Origin` (the
mobile app), it falls back to `PASSWORD_RESET_REDIRECT_URL`, then Supabase's Site URL.

Used by both emails that link back to the site: **Forgot password**
(`POST /auth/password-reset`) and **Lost your phone?** (`POST /auth/mfa/recovery`).

Supabase still refuses any address not on its Redirect URLs list and silently uses the Site URL
instead, so the list in [Before this goes live](#before-this-goes-live) is required.

Opening the site from another device by the computer's network address
(`http://192.168.x.x:5173`) is not covered: those links fall back to the default.

## 10. "Forgot password" works again with two-step sign-in *(uncommitted)*

**Bug:** after opening a reset link and typing a new password, **Save new password** answered
"Enter your email". Against the API before this fix it answered "Sign in again and enter
the 6-digit code from your authenticator app" instead. Either way the password never changed.

**Cause** (since two-step sign-in became compulsory for all staff):

1. A reset link signs the person in with the email link only, no 6-digit code (an `aal1` session).
2. The API refuses `aal1` sessions on every route except the set-up ones (`MFA_REQUIRED`),
   including `POST /me/password`.
3. On page load the website's workspace request got that refusal and signed the session out.
   With no session left, Save fell through to the "email me a link" path: "Enter your email".
4. Separately, Supabase will not change the password of an account that has an authenticator
   app until the session has passed the 6-digit code (`aal2`).

**Fix:**

- **API** (`services/api/src/auth/middleware.js`, `app.js`): a session opened from an email link
  in the last **15 minutes** may call `POST /me/password`, and nothing else.
- **API** (`services/api/src/session.js`): when Supabase asks for the code, the answer is
  `403 MFA_CODE_NEEDED` with a plain message.
- **Website** (`apps/shared/api.js`): the reset link's session is kept aside in memory, not
  stored, so the page load cannot sign it out. This is the same approach the lost-phone link already uses.
  New `resetPasswordApi`: with a code, it first calls `POST /auth/mfa/verify` with the link's session
  to get an `aal2` one. After saving it closes the link's session.
- **Store** (`apps/shared/StoreProvider.js`): new `resetPassword(newPassword, code)`. The old
  `changePassword` is unchanged; the mobile app and the first sign-in still use it.
- **Sign-in page** (`apps/web/src/pages/Login.jsx`): the reset form shows its errors on the
  form, shows a **6-digit code** box when the API asks for it, and has **Email me a new
  link** for an expired link or a reloaded page.

**What the person sees now:**

1. **Forgot password?** → email → open the link.
2. Type the new password, **Save new password**.
3. If the account has an authenticator app, the same page asks for its 6-digit code. The code
   comes from the app on the phone; no password is needed for that.
4. Back to **Staff sign in** with "Password changed. Sign in with your new password."
   Then they sign in as usual, password and code.

Someone who has forgotten their password **and** lost their phone still cannot get back in on
their own: **Lost your phone?** needs the password first. An admin has to help.

### Checked against real Supabase (Daun Sense Test)

Run on 16 Nov 2026 with the local API and a throwaway officer account. No email was needed:
the recovery token was written straight into `auth.one_time_tokens`, and the real
Supabase Auth turned it into a session as an email link would.

| Step | Account without an app | Account with an authenticator app |
|---|---|---|
| Open the reset link | `aal1` session | `aal1` session |
| Save the new password | **204, saved** | `403 MFA_CODE_NEEDED` |
| Enter the 6-digit code | - | `aal2` session, then **204, saved** |
| Sign in with the new password | Works, goes to app set-up | Works, asks for the code |

The real run caught one wrong assumption: Supabase marks a reset-link session with the amr
method **`otp`**, not `recovery`. The first version only accepted `recovery`, so the real flow
still failed. `middleware.js` now accepts `otp` (and `recovery`/`magiclink` for older Auth
versions).

**Testing locally:** the website only uses your local API when `apps/web/.env` has
`VITE_API_URL=http://localhost:8000`. Without it, the Vite dev server sends `/v1` to the Render
API, which does not have these fixes until it is redeployed. Restart Vite after changing it.

---

## Security problem found: email alone can remove two-step sign-in

**Fixed on this branch (item 11).** It existed before these changes; found while checking item 10.

**What is wrong:** **Lost your phone?** (CTIP-50) is meant to need the password *and* the
email. Step 1 (`POST /auth/mfa/recovery`) needs the password, then emails a sign-in link.
Step 2 (`POST /auth/mfa/reset`) removes the authenticator app. It accepts any session from an
email link in the last 15 minutes (`fromEmailLink` in `services/api/src/mfa.js`).

It is meant to refuse a **password-reset** link's session, and tells the two apart by the amr
method `recovery`. Real Supabase marks **both** links `otp` (seen in the real run above). So
step 2 cannot tell them apart, and the password check in step 1 can be skipped.

**How it could be misused:** someone who gets into a staff member's **email account only**:

1. On the sign-in page, clicks **Forgot password?** for that address and opens the reset link
   from the email. They now hold an `aal1` session without the password.
2. Sends that session to `POST /auth/mfa/reset`. The authenticator app is removed.
3. With no app left, Supabase lets that same session set a new password.
4. Signs in with the new password and sets up their own authenticator app.

Result: full account takeover with email access alone. Two-step sign-in is defeated.

**How sure this is:** worked out from the code and the real token seen on 16 Nov. Step 2 was
**not** run, because the local API has no `SUPABASE_SECRET_KEY`. It should be confirmed on Daun
Sense Test before and after a fix.

**Suggested fix:** give step 2 its own proof that step 1 (the password) happened, because the token
cannot carry it. For example: when step 1 accepts the password, store a short-lived, single-use
value for that user (in a table only the API can read). Put it in the emailed link's address
(`emailRedirectTo` with `?mfa_reset=<value>`). Step 2 then requires and uses up that value.
Until then, consider turning **Lost your phone?** off and letting an admin remove the app instead.

**What was done (16 Nov, commit `9b78c72`):** the proof is kept on the server instead of in the
link, so the emailed link and Supabase's Redirect URLs do not change:

- Step 1 (`POST /auth/mfa/recovery`) now needs a **password sign-in** in the last 15 minutes
  (`403 PASSWORD_REQUIRED` otherwise), so a reset-link session cannot do it. It leaves a proof:
  one row per person in the new table `mfa_recovery_proofs` (migration `20261116091336`; RLS on,
  no policies, so only the API's secret key reaches it).
- Step 2 (`POST /auth/mfa/reset`) takes that proof and uses it up. It must be for the same
  person, less than 15 minutes old, and from **before** the email link was opened. Otherwise
  `403 RECOVERY_NOT_STARTED`. One password step allows one reset.
- `fromResetLink` and `fromEmailLink` now share one helper, `services/api/src/auth/emailLink.js`.
- Tests (`mfa-recovery.test.js`): email alone is refused; a link opened before the password step
  is refused; one password step allows one reset; a reset-link session cannot do step 1.

## 11. Review fixes (16 Nov)

- **Security:** the fix above.
- **Mobile Monitoring** (`apps/mobile/pages/Monitoring.js`): shows the same fixed stable range as
  the website and the alert rule, colours readings against it, and no longer has the admin
  **Edit limits** form for the per-node limits that no longer raise alerts. Alert cards show the
  reading and its stable range.
- **Password reset:** a retry after the new password was refused (for example too weak) no longer
  sends the 6-digit code again, which Supabase refused as already used.
- **Monitoring:** a personal name equal to the technical name can still be cleared
  (**Use technical name** is offered whenever a personal name is saved).

---

## Behaviour changes people may notice

- Monitoring: no *Alert limits* form for admins. Ranges are changed in the settings file.
- Monitoring: acknowledged alerts no longer appear at the top; switch the Alerts tab.
- Monitoring: notes and resolve are under **Notes and resolve** on each alert.
- Monitoring: new alerts are named *Temperature too high* etc., and a node's alert stays one
  alert while it is open, however many bad readings follow.
- QR tags: no **QR** button. Click the code preview.
- Species, QR tags, Dashboard: only 10 rows at first.
- Password reset: after saving, the person is sent to sign in instead of straight to the
  Dashboard. Someone with an authenticator app is also asked for its code on the reset page.

## Tests

| Suite | What changed |
|---|---|
| API (`services/api/test/field-and-staff.test.js`) | New: set and clear a node name; 60-character limit; extra fields refused; bad id 404; botanist 403. Fake Supabase knows the two new tables |
| Web Monitoring (`tests/monitoring-page.spec.js`) | New: slider (no API call up to a day), renaming and going back to the technical name, readings outside the range flagged, range read from the database copy, whole row selects a node, red chart segments, one Alerts section with tabs and rules. Selectors updated from `article.nodecard` to `tr.noderow` |
| `tests/every-page.spec.js` | Opens *Notes and resolve* before looking for Resolve |
| **New** `tests/account-page.spec.js` | Greeting, profile strength, password meter and match; QR preview opens the popup |
| **New** `tests/long-lists.spec.js` | Species View more and reset on search; tags 10 at a time with preview; audit badges, summary and Expand; Dashboard 10 rows |
| `tests/helpers/mockApi.js` | Mocks the nickname route, returns `sensor_node_nicknames`, `sensor_stable_ranges`, tags, audit logs and an optional staff species list |

| API `session.test.js` (items 9–10) | New: the reset link opens Cloudflare, a preview, `localhost` or `127.0.0.1` as asked; look-alike sites and a missing `Origin` get the fallback |
| API `mfa-recovery.test.js` (items 9–10) | New: lost-phone link opens the site asked from; a fresh email-link session (`otp` and `recovery`) may set the password and nothing else; an old one or a password-only one may not; `MFA_CODE_NEEDED` when Supabase wants the code |
| **New** `apps/web/tests/password-reset.spec.js` | Reset page without an app (saved, back to sign in, never "Enter your email") and with an app (asks for the code, verifies, saves with the `aal2` session) |

Results on 16 Nov, after items 9–10:

| Suite | Result |
|---|---|
| API (`cd services/api && node --test`) | 268 pass |
| Web lint (`npm run web:lint`) | Pass |
| Playwright: `password-reset`, `every-page`, `auth-supabase-accounts`, `availability-security`, `account-page` | 80 pass, 10 skipped |
| Mobile (`npm --prefix apps/mobile test`) | Pass |
| Real Supabase (Daun Sense Test), reset flow | Pass for both cases, see item 10 |

The other Playwright files were not re-run after items 9–10.

Not tested yet: the stable-range trigger against real readings on Supabase,
`npm run sensor-ranges:push` against the live project, and a real reset email from the
Cloudflare site (needs the Render redeploy and the Redirect URLs first).

## Files

| File | Change |
|---|---|
| `supabase/migrations/20261116091220_node_nicknames_and_stable_range_alerts.sql` | **New.** Nickname table, stable range table, alert trigger, better alert notification |
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
| `services/api/src/resetRedirect.js` | **New.** Which site an emailed link goes back to (item 9) |
| `services/api/src/session.js` | Reset email uses it; `MFA_CODE_NEEDED` answer (items 9–10) |
| `services/api/src/mfa.js` | Lost-phone email uses it (item 9) |
| `services/api/src/auth/middleware.js`, `app.js` | A fresh email-link session may call `POST /me/password` (item 10) |
| `services/api/.env.example` | Explains the redirect and the Supabase Redirect URLs |
| `apps/shared/api.js` | Reset link's session kept aside; `resetPasswordApi` (item 10) |
| `apps/shared/StoreProvider.js` | `resetPassword` (item 10) |
| `apps/web/src/pages/Login.jsx` | Reset form: errors, 6-digit code, new-link button (item 10) |
| `services/api/test/session.test.js`, `mfa-recovery.test.js`, `apps/web/tests/password-reset.spec.js` | Tests for items 9–10 |
