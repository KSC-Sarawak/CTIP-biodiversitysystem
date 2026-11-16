# Running the tests

How to run every automated check on your own computer before you push. The same
checks run on GitHub for every pull request and every push to `main`
(`.github/workflows/ci.yml`). Commands are for **PowerShell** on Windows; they
work the same in a macOS or Linux terminal.

Install everything once, from the repository root:

```powershell
npm run install:all
```

## What runs where

| Part | Framework | Command (from the repository root) | Copy this test to start a new one |
|---|---|---|---|
| API (`services/api`) | `node:test` + supertest, Supabase faked in memory | `npm run api:test` | `services/api/test/iot-alerts.test.js` |
| Shared app code (`apps/shared`) | `node:test` | `cd apps/shared; node --test; cd ../..` | `apps/shared/test/session.test.js` |
| Web lint (`apps/web`) | ESLint | `npm run web:lint` | - |
| Web build | Vite | `npm run web:build` | - |
| Web pages (`apps/web/tests`) | Playwright, API mocked in the browser | `npm run test:agent` | `apps/web/tests/sensor-nodes-page.spec.js` |
| Mobile (`apps/mobile/tests`) | `node:test` | `npm run mobile:test` | `apps/mobile/tests/*.test.mjs` |
| Mobile bundle | Expo export (compiles every screen) | `cd apps/mobile; npx expo export --platform android --output-dir dist; cd ../..` | - |
| Dependencies | `npm audit` | see below | - |

None of these need a real Supabase project, a phone or the internet (except
`npm audit`): the API tests fake Supabase, and the web tests mock the API.

### One file or one test

```powershell
cd services/api
node --test test/iot-alerts.test.js
node --test --test-name-pattern "silent check" test/iot-alerts.test.js
cd ../..
```

```powershell
cd apps/web
npx playwright test sensor-nodes-page
npx playwright test sensor-nodes-page --headed   # watch it in a browser
npx playwright test --ui                         # pick tests in a window
cd ../..
```

The first Playwright run may ask you to install its browser: `npx playwright install chromium`.

## npm audit (security evidence)

```powershell
cd services/api; npm audit; cd ../..
cd apps/web; npm audit; cd ../..
cd apps/mobile; npm audit; cd ../..
```

On GitHub the **npm audit** jobs keep each app's full report (`npm-audit.json`
and `npm-audit.txt`) as a build artifact named `npm-audit-<app>` for 90 days:
open the workflow run under **Actions**, then **Artifacts**. The check fails only
on a **critical** finding; lower ones are listed in the report for the security
assessment (CTIP-74).

## Writing a new test

- **API:** copy the fake Supabase at the top of an existing test file. Set
  `process.env.SUPABASE_URL` and the keys before importing `createApp`, mock
  `fetch` in `beforeEach`, then call routes with supertest. Check both what the
  route answers and what it wrote to the fake tables.
- **Web:** use `open(page, newState({ role: "admin" }), "#/page")` from
  `apps/web/tests/helpers/mockApi.js`. Anything the page sends is in
  `state.writes`. Add a route to `mockApi.js` if your page calls a new endpoint.
- **Mobile and shared:** plain functions, so call them and compare results with
  `node:assert/strict`.

## Required checks on `main`

Every job in `ci.yml` should be a required check in GitHub branch protection
(**Settings → Branches → main → Require status checks to pass**):
`API (tests)`, `Shared (tests)`, `Web (lint and build)`, `Mobile (tests and export)`
and the three `npm audit (...)` jobs. Only a repository admin can change this.
