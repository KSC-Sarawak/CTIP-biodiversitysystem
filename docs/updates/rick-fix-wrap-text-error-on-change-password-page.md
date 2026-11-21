# Branch `rick-fix-wrap-text-error-on-change-password-page`: a short password rule, and error text that wraps

*Written 21 Nov 2026. Based on `main` at `9575812`. One commit (`ca836d0`), 5 files, +22 / −12 lines.
Web and API only. No database, API-contract or mobile changes.*

## The problem

On the "Choose a new password" page (the page a reset-email link opens), a password that was
too weak gave this error, straight from Supabase:

> Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.

Two things were wrong:

1. **It was hard to read.** It listed the whole alphabet instead of saying what to type.
2. **It ran out of the red box.** The alphabet is one long word with no spaces, and a browser
   only wraps text at spaces, so the text went past the edge of the box.

## What changed

| Where | Change |
|---|---|
| `services/api/src/session.js` | `POST /v1/me/password` (used by both the reset page and Account > Change password) now answers a weak password with our own message, not Supabase's. Before, it passed Supabase's text through. |
| `apps/shared/accountRules.js` and `services/api/src/accountRules.js` | `weakPasswordMessage()` rewritten in plain words. The two copies must stay identical (a test checks this). The Users page already used this helper for temporary passwords, so it now shows the same wording. |
| `apps/web/src/App.css` | The red error box (`.loginerr`) now breaks long words, and the warning icon stays on the first line when the text wraps over several. |
| `services/api/test/accountRules.test.js` | Checks the new messages. |

### The messages

| Why Supabase refused it | What the person sees |
|---|---|
| Missing character types | Use at least one small letter (a-z), one capital letter (A-Z), one number (0-9) and one symbol such as # or @. |
| Too short | This password is too short. |
| Found in a known data leak | This password has appeared in a known data leak, so it is easy to guess. Choose a different one. |
| No reason given | This password is too weak. Use at least one small letter (a-z), one capital letter (A-Z), one number (0-9) and one symbol such as # or @. |

The text no longer starts with "Supabase refused this password", which meant nothing to a user.

## Take note

- **Restart the API** (`npm run api`) after pulling. The message is made by the API, so the website
  alone does not change it.
- **The "# or @" part may ask for more than Supabase does.** The original message was cut off in the
  screenshot after the digits, so Supabase may only require letters and numbers. Asking for a symbol
  as well is harmless. To check, open the Supabase dashboard, Authentication > Policies (password
  requirements), and change the wording here if it differs.
- **Same wording in other places.** Creating an account with a typed password (Users page) goes
  through the same helper, so its weak-password error changes to match.

## How to check

- [ ] Open a reset-password link and enter `password`. The red box shows the short rule, and it wraps inside the box.
- [ ] Enter a password in a known data leak (for example `Password1!`). You get the "known data leak" message.
- [ ] Account > Change password with a weak password shows the same message.
- [ ] Narrow the browser window. Long messages still wrap and the icon stays at the top left.
- [ ] `npm run api:test` passes.
