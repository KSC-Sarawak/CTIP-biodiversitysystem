# Branch `rick-fix-minor-stuff`: sign-in screen, discussion message edit/delete, live sensor readings

*Written 9 Nov 2026. Covers everything this branch changes compared with `main`
(merge base `0a6ac47`). 27 files, +1136 / −187 lines, all committed, plus
uncommitted fixes (see [Found while writing this](#found-while-writing-this)).*

This branch started from `rick-extra-CTIP-security-fix`. Its older commits (confirm
dialogs, account rules, sensor node and alert permissions: `d01b00a` … `c1f651f`) already
reached `main` through PR #56 and the CTIP-50 PRs, so they are **not** listed here. What is
left is three pieces of work:

| # | What | Commits |
|---|---|---|
| 1 | Sign-in screen cleaned up, API-token sign-in removed | `81850a2` |
| 2 | Discussion: edit, delete and undo messages; unread badge; turned-off accounts told why | `e905ed3`, `3cce1ef` |
| 3 | Monitoring page shows live readings from the `telemetry` table | `c8a1313` |

## Before this goes live

- [ ] Push the two new migrations, dry run first:
      `npx supabase db push --remote --dry-run`, then without `--dry-run`.
  - `supabase/migrations/20261108120000_discussion_post_edit_delete.sql`
  - `supabase/migrations/20261109120000_telemetry_live_updates.sql`
- [ ] Redeploy the API (Render). Without it, the new message and telemetry endpoints answer
      `501 NOT_IMPLEMENTED` / `404`, and the Monitoring page shows "No readings yet".
- [ ] Redeploy the website (Cloudflare Pages).
- [ ] Be aware: **the sign-in attempt limit was removed** (team decision, 8 Nov). See [2.4](#24-sign-in-limit-removed).

---

## 1. Sign-in screen (`#/staff`, `#/login`)

- **"Staff sign in" in the header now opens the sign-in form directly.** Before, `#/staff`
  showed a short text and a "Go to login" button. Signed-in staff still see "Go to dashboard".
- One full-width **Sign in** button. It shows "Signing in…" and cannot be pressed twice.
- **Forgot password?** is a link under the password field.
- Sign-in errors show **on the form** (red box), not as a pop-up that disappears.
  One message covers both an unknown email and a wrong password, so the form cannot be
  used to find out who has an account.
- The "Backend API: Online (/v1)" badge is gone. When the server is not answering, a notice
  says "It can take up to a minute to wake up".
- "Just looking around? No account needed." with two links: *Browse the plant library*
  (`#/plants`) and *Open the plant map* (`#/map`).
- **"Sign in with API token" removed**, with its form and `loginWithToken()` in the store.
  Staff sign in with email or username and password only.
- The admin's "Temporary password" field on the Users page now has the show/hide eye
  (`PasswordInput`).

Files: `apps/web/src/pages/Login.jsx`, `apps/web/src/pages/Public.jsx`,
`apps/web/src/pages/Admin.jsx`, `apps/web/src/App.css`, `apps/shared/StoreProvider.js`.

---

## 2. Discussion board and accounts

### 2.1 Edit, delete and undo a message

| Action | Who | What others see |
|---|---|---|
| Edit | The author only (not even an admin) | The new text, marked **(edited)** |
| Delete | The author, or an admin (moderation) | "Message deleted" (or "Message deleted by an admin") |
| Undo a delete | Only the person who deleted it | The original text, exactly as it was |

- Pencil and bin icons appear on your own messages; admins see the bin on everyone's.
- Deleting your own message asks nothing (you can undo). An admin deleting someone
  else's message gets an "are you sure?" first.
- Saving the same text again does not mark the message as edited.
- The thread list shows "Message deleted" as the last message preview when needed.

**How it is enforced (database, `20261108120000_discussion_post_edit_delete.sql`):**

- New columns on `discussion_posts`: `edited_at`, `deleted_at`, `deleted_by`.
  A deleted message keeps **no text** (`body = ''`), enforced by a check constraint.
- A `before update` trigger (`guard_discussion_post_update`) checks who may do what, for any
  caller, not only the API. Only the text can change; author, thread and time cannot.
- An `after update` trigger writes every edit, delete and undo to a new table,
  **`discussion_post_versions`** (old and new text and mentions, who, when).
  Only people who can read the thread can read it. Undo takes the text from here, so
  nobody can put different words back.
- Rows are never deleted, only updated.
- Discussion changes are **not** written to `audit_logs`, so admins outside a private
  thread never see its contents. (`3cce1ef` removed the earlier audit-log version and its
  display on the Audit page.)

**API** (`services/api/src/discussions.js`, also in `packages/api-contract/openapi.yaml`):

| Request | Answers |
|---|---|
| `PATCH /v1/discussions/:id/posts/:postId` `{ body, mentions }` | the message; `403 NOT_ALLOWED` not the author; `409 MESSAGE_DELETED` |
| `DELETE /v1/discussions/:id/posts/:postId` | the message (now deleted); `403` not author or admin |
| `POST /v1/discussions/:id/posts/:postId/restore` | the message with its text back; `403` not the deleter; `409 CANNOT_UNDO` |

A bad id, or a thread you cannot read, answers `404`. Retrying a delete or undo that
already happened answers `200` with the message.

### 2.2 Other discussion changes

- **Unread badge** on the Discussion link for every role: the number of threads with unread
  notifications for you (`staffCounts` in `apps/shared/selectors.js`, shown by `Shell.jsx`).
- **Ctrl + Enter** (Cmd + Enter on a Mac) sends a new thread or a reply.
- When you share a thread with a whole group (e.g. "Officers"), the people in that group are
  listed under it, and they are no longer offered again one by one under "People".

### 2.3 A turned-off account is told why

Before, an account an admin turned off just failed quietly. Now:

- Sign-in and session refresh answer **`403 ACCOUNT_DISABLED`** with "Your account has been
  disabled…" (or "…has been deleted…"). The session Supabase made is ended straight away.
- `GET /v1/workspace` answers the same, so someone already signed in is signed out on the
  next poll (a few seconds), not when their token next expires (up to an hour).
- The website goes to the sign-in page and shows the reason there; the phone app shows it
  as a message.
- A wrong password for a disabled account still says only "wrong email or password".
- **The profile is always checked at sign-in and refresh**, even when the new token already
  carries a role. Supabase's token hook (`20261010000000_access_token_role_claim.sql`)
  normally leaves the role out for turned-off and deleted accounts, but that hook is a manual
  dashboard setting, so this check does not rely on it. Cost: one small profile read per
  sign-in or refresh.

New file: `services/api/src/accountStatus.js`. Changed: `session.js`, `staff.js`,
`apps/shared/api.js`, `apps/shared/StoreProvider.js`.

### 2.4 Sign-in limit removed

`POST /v1/auth/sign-in` no longer allows only 10 tries per address every 5 minutes (team
decision, 8 Nov 2026). Supabase's own limit still applies, and password reset and the
6-digit MFA codes keep their limits. To bring it back, see the comment above
`ATTEMPT_LIMIT` in `services/api/src/session.js`.

---

## 3. Monitoring page: live sensor readings

**Before:** the `telemetry` table was never loaded. `db.telemetry` was always empty, so the
Monitoring charts and "latest reading" values never showed anything, and
`GET /sensor-nodes/:id/telemetry` answered "not built yet".

**Now (`#/monitoring`, officers and admins):**

- **Tiles:** open alerts, nodes online, offline or faulty, plus two new ones: **nodes
  outside their alert limits** and **readings in the last 24 hours**.
- **Node cards:** latest temperature, soil moisture and humidity, and a **Movement** flag.
  Values over a limit are highlighted.
- **Readings for the chosen node:**
  - a **24 hours / 7 days / 30 days** switch
  - four charts: temperature, soil moisture, air humidity, distance (HC-SR04)
  - min / average / max figures, readings outside limits, movement count
  - a table of the latest 20 readings
- New readings appear on the next live-update poll, with no page refresh.
- The mobile app's Monitoring screen also gets real readings now, because it uses the same
  shared store.

**How:**

- `GET /v1/workspace` now includes `telemetry`: the last 24 hours, newest 5,000 readings at
  most (`services/api/src/staff.js`).
- New `GET /v1/sensor-nodes/:id/telemetry?hours=` (1–720, default 24), oldest first, used by
  the 7- and 30-day views. `400` for a bad `hours`, `403` for botanists.
- New `GET /v1/sensor-nodes/:id` (one node).
- `20261109120000_telemetry_live_updates.sql` adds `telemetry` to the `table_versions`
  change counter, so a poll with no new readings stays one small query.
- The store groups readings by node (`db.telemetry[nodeId]`, oldest first) and adds
  `loadNodeTelemetry(nodeId, hours)`.
- Charts skip empty values (e.g. a timed-out distance sensor) instead of breaking
  (`apps/web/src/components/Bits.jsx`).

---

## Files

| Area | Files |
|---|---|
| Web pages | `Login.jsx`, `Public.jsx`, `Admin.jsx`, `Discussion.jsx`, `SensorOverview.jsx` |
| Web components / styles | `components/Shell.jsx`, `components/Bits.jsx`, `App.css` |
| Shared (web + mobile) | `StoreProvider.js`, `api.js`, `permissions.js`, `selectors.js` |
| API | `accountStatus.js` (new), `discussions.js`, `permissions.js`, `session.js`, `staff.js` |
| Database | `20261108120000_discussion_post_edit_delete.sql`, `20261109120000_telemetry_live_updates.sql` |
| Contract | `packages/api-contract/openapi.yaml` |
| Docs | `docs/updates/rick-extra-CTIP-security-fix.md` (sign-in section), this file |

## Tests

API (`npm test` in `services/api`, all passing):

- `discussions.test.js`: edit (author only, empty text refused, same text not marked edited),
  delete and undo (text comes back exactly), admin moderation, bad ids → 404.
- `session.test.js`: disabled and deleted accounts at sign-in and refresh, including a new
  token that carries a `user_role`; wrong password for a disabled account; sign-in has no API limit.
- `field-and-staff.test.js`: workspace refuses a turned-off account; telemetry only from the
  last 24 hours; per-node telemetry range, order and bad input.

Website (Playwright):

- `every-page.spec.js`: `#/staff` shows the form, no API-token option, Forgot password, both links.
- `monitoring-page.spec.js`: readings from the telemetry table, and the 7-day switch asks the API.

Known failing, **not caused by this branch**: some `role-pages.spec.js` tests click a
`.roleswitch` button that no longer exists in the app.

## Found while writing this

1. **Fixed: discussion history wording said "audit log".** After `3cce1ef`, edited and
   deleted text is kept in `discussion_post_versions` (private to the thread), **not**
   `audit_logs`, but the screens still said "audit log". Now:
   - Edit form: "The earlier text is kept in this thread's private history."
   - Admin delete prompt: "Its text is kept in this thread's private history, so it can be undone."
   - Same wording in the code comments (`Discussion.jsx`, `services/api/src/discussions.js`),
     the API contract (`openapi.yaml`), and the test fake and test names in
     `discussions.test.js` (`audit` → `history`). Wording only; no behaviour change.
2. **Fixed: `['get', '/health', PUBLIC]` was listed twice** in `services/api/src/permissions.js`
   (probably from a merge). One copy is removed; behaviour is the same.
