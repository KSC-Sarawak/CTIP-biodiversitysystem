# Branch `rick-fix-account-remove-photo-confirmation-and-agents-test-result`: popups always on top, and the persona QA report

*Written 21 Nov 2026. Based on `main` at `9575812`. Two pieces of work: a one-file website fix,
and a new test report under `docs/testing/`. No API, database, API-contract or mobile changes.*

| # | What | Files |
|---|---|---|
| 1 | Confirmation popups and other dialogs always open on top of the page | `apps/web/src/components/Bits.jsx` |
| 2 | Persona QA of the website (seven test agents), with a fix checklist | `docs/testing/web/21nov-persona-qa/` (README.md and 15 screenshots) |

---

## 1. Popups always open on top

### The problem

On **Account settings** (`#/account`), pressing **Remove photo** opened the "Remove profile photo"
confirmation **behind** the page. It was covered by the content painted after it, so it could not be
read or clicked properly.

**Cause:** the green header card on the account page (`.accthero` in `App.css`) uses
`isolation: isolate`. That makes the card its own stacking layer, so a dialog rendered inside it
can only rise above things in that card, however high its `z-index` (`.modal` is 220). Other
popups placed inside a similar layer (a parent with `isolation`, `transform`, `filter` or an
animation) had the same risk.

### The fix

`Modal` in `apps/web/src/components/Bits.jsx` now renders the popup with a React **portal** at the
top of the site, not inside the component that opens it.

- It is placed inside the `.site` element, **not** `document.body`. The theme colours (light and
  dark) are set on `.site`, so the popup keeps them.
- `ConfirmDialog` and every other popup built on `Modal` get the fix: remove photo, delete plant,
  unpublish, change password, correct email, and so on.
- Nothing else changes for the code that uses it: React context, Escape to close and click outside
  to close all work as before.
- `PhotoEditor` and `TagPrint` build their own overlays and are not affected.

### How it was checked

- **A browser test (Playwright, fake API), on desktop 1440 px and phone 412 px:**
  - opens the account page with a profile photo and presses **Remove photo**;
  - waits for the opening animation, then checks that no point of the dialog box is covered by
    anything else;
  - clicks **Remove photo** in the dialog for real, and checks that `PATCH /me {avatar_url: null}`
    is sent.

  It passed on both sizes. A screenshot shows the dialog cleanly on top.
- **The existing browser tests that open dialogs:** 14 passed, 1 failed. The files were
  `account-page`, `rbac-delete`, `rbac-retag`, `rbac-email`, `plant-photo-edit`, `avatar-image`
  and `password-reset`. The one failure ("tags: no separate QR button…" in
  `account-page.spec.js`) also fails on `main`; it is one of the 20 out-of-date tests listed in
  the QA report.
- **Web lint and build:** clean.

The browser test above was a one-off check and is **not** added to `apps/web/tests`. Worth adding:
open a dialog from inside the account header and assert it is on top.

### How to check by hand

1. Sign in and open **Account settings**.
2. Upload a profile photo if you have none, then press **Remove photo**.
3. The confirmation appears in the middle, above everything, and both buttons work.
4. Do the same in dark theme, and at phone width.

---

## 2. Persona QA report

`docs/testing/web/21nov-persona-qa/README.md` is the result of the persona QA run on 21 Nov 2026.

**How the agents worked**
- Seven test agents each played one kind of user:
  - visitors: Tourist Tim and Karen;
  - botanists: Rookie Rina and Karen;
  - officers: Careful Carla and Karen;
  - admin: Security Sam.
- Each drove the website in a real browser with Playwright, on desktop and phone, in light and
  dark theme. That came to about 165 checks.
- The API was faked in the browser (`apps/web/tests/helpers/mockApi.js`). The website itself was
  fully tested; the database and API rules were not, except where a finding says it checked the
  server code by hand.

**What was tested:** the unpublish/review branch `rick-fix-officer-tag-plant-page` (`8f7b0ee`),
plus the password-message fix (`ca836d0`). Most findings are on `main` too; the report tags each
one **[branch]** or **[main]**.

**What the report contains**
- **The automated test results.** The API and shared tests pass. The web browser suite has 20
  failures, and plain `main` fails the same 20, so they are out-of-date tests.
- **16 blocker and major findings** in one table, each with a screenshot (`P01-…png` to
  `P16-…png`).
- **Minor and cosmetic findings,** grouped.
- **A fix checklist** of 67 tick boxes in sections A to H. Section A is what must be fixed before
  the unpublish branch is merged.
- **What worked well,** what phase 2 (live, against the Test database) still needs to cover, and
  each persona's own findings as an appendix.

**Decisions the team needs to make (from the checklist)**
- **Sensor nodes:** build delete, alert limits and device keys for admins, or change RBAC.md to
  match what the website offers.
- **Review mode while a plant is with the botanist:** may an officer still edit it? RBAC D18
  does not say.
- **The admin's Species link:** RBAC.md §2 says to remove it, but the read-only page is still
  there. Change one of them.

The test scripts the agents wrote and their full screenshot sets were kept in a temporary folder
and are **not** part of this branch. Only the screenshots that prove the serious findings were
copied in.

## Take note

- **Branch base:** this branch is based on `main`. It does **not** include the unpublish work
  (`rick-fix-officer-tag-plant-page`) or the password-message fix
  (`rick-fix-wrap-text-error-on-change-password-page`), so it can be merged on its own.
- **Size:** the report folder is about 4.3 MB of screenshots.
