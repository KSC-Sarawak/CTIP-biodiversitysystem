# Branch `rick-fix-minor-changes2`: small web fixes, and the IoT dashboard (CTIP-39, 79, 81, 82)

*Written 11 Nov 2026. Covers the uncommitted changes on this branch compared with `main`
(`192bc41`): 16 files, 2 of them new. Nothing is committed yet.*

| # | What | Jira |
|---|---|---|
| 1 | Show/hide password button no longer jumps away when pressed | - |
| 2 | Reports table: newest record first, every column sortable | - |
| 3 | Plant page: map and QR code open large when clicked | - |
| 4 | Monitoring: node map with status, open alerts beside it | CTIP-39 |
| 5 | Monitoring: all five live readings per node | CTIP-79 |
| 6 | Monitoring: time charts with a chosen date range | CTIP-81 |
| 7 | Monitoring: latest webcam photos per node | CTIP-82 |

Read [Take note](#take-note) before merging.

---

## 1. Show/hide password button

**Bug:** pressing the eye button in a password box moved it down, away from the cursor,
so the click often missed.

**Cause:** the button was centred with `transform: translateY(-50%)`. The global
"press in" effect (`.ic:active { transform: scale(0.97) }`) replaced that transform
while the mouse was down, so the button dropped by half its height.

**Fix:** the button is now centred with `top: 0; bottom: 0; margin: auto 0` instead of a
transform (`apps/web/src/App.css`, `.pwfield .ic`). Applies to every password box: sign-in,
account, and adding a user.

## 2. Reports table sorting

`apps/web/src/pages/ReportSummary.jsx`

- The table opens sorted by **Last recorded, newest first**.
- Every column header is a button: click to sort by it, click again to reverse. ▲/▼ shows
  the current sort, and `aria-sort` is set for screen readers. Same pattern as the
  Dashboard table.
- Dates and heights sort newest/tallest first on the first click, text columns A–Z.
  Conservation sorts in the order of `CONSERVATION`, not alphabetically.
- Empty values (no tag, no height, no zone, …) always go last.
- The sort is kept in the URL (`#/reports?sort=height&dir=asc`), so a sorted view can be
  shared. The default sort leaves both out.
- The old **Sort** dropdown is removed. Old links with `sort=recent`/`sort=name` now open
  with the default sort.

## 3. Plant page: enlarge the map and the QR code

`apps/web/src/components/MiniMap.jsx`, `apps/web/src/pages/Specimen.jsx`, `PublicPlant.jsx`

- `MiniMap` has a new `expandable` option. The small map becomes a preview with an
  **Enlarge** label, and a click opens a large map you can drag and zoom in a popup. With
  `mapHref`, the popup also has **Open in the full map** (staff page: `#/map/<tag>`).
- Because the whole small map is now the button, it can no longer be dragged or zoomed in
  place.
- The staff QR code is a button. It opens the code at up to about 420 px on white, for
  scanning with a phone.
- The public plant page (what visitors see after scanning) gets the enlarge popup too,
  without the full-map link.
- New `expand` icon in `Icon.jsx`.

## 4–7. IoT dashboard (Monitoring page)

`apps/web/src/pages/SensorOverview.jsx`, new `apps/web/src/components/SensorParts.jsx`
and `apps/web/src/sensorState.js`

### CTIP-39: node map, status and open alerts

- **Node map** of every sensor node. Pins are red for **Alert** (the node has an open
  alert), green for **Online** (`status = active`) and grey for **Offline** (any other
  status). A key under the map gives the count of each.
- Location: the node's own `lat`/`lng` from `sensor_nodes`, or else its plant's location.
  Nodes with neither are listed under the map as "Not on the map".
- The map fits all nodes in view. Clicking a pin selects that node.
- **Needs attention** (open alerts with Assign → Acknowledge → Resolve, CTIP-78) now
  sits beside the map. Each node card with open alerts has a "N open alerts →" link that
  scrolls to that alert (`id="alert-<id>"` on each alert card).
- The store now keeps `lat`/`lng` on nodes (`apps/shared/StoreProvider.js`). It dropped
  them before.

### CTIP-79: live readings

- Each node card shows **temperature, humidity, soil moisture, distance and motion**.
  Before, distance was missing and motion only showed when there was movement.
- The selected node has a **Right now** panel with the same five values.
- These update without a page refresh through the existing workspace poll (every few
  seconds). No new code was needed for that part.

### CTIP-81: historical charts

- The four sparklines are replaced by **time charts** (`TimeChart`): time axis, highest
  and lowest value, the alert-limit line, a gap where the node sent nothing for a long
  time, and the value and time under the cursor (hover or touch).
- Ranges: **24 hours**, **7 days**, **30 days**, or **Choose dates** (whole days, up to
  30). An invalid range shows a message and no request is sent.
- **API:** `GET /v1/sensor-nodes/:id/telemetry` now also takes `?from=&to=` instead of
  `?hours=`. It refuses (400) using both, `to` without `from`, `from` after `to`, a range
  over 30 days, or `from` more than 366 days ago. Still at most 5000 readings (the newest
  ones), oldest first.

### CTIP-82: latest captured images

- The selected node shows its **12 newest webcam photos**. Click one to see it large.
  The list reloads every minute, and there is a **Refresh** button.
- **API:** `GET /v1/sensor-nodes/:id/images` existed in `permissions.js` and in the
  contract, but **had no handler**, so it never worked. It is now implemented to match
  the contract: newest first, `?page=` and `?limit=` (max 100, default 20), optional
  `?from=`/`?to=`, response `{ data, meta }`. Each photo has a `view_url`: a signed link
  to the private `sensor-images` bucket that lasts **one hour**.
- The link is signed **as the signed-in user**, so the Storage policy (officers and
  admins only) applies as well as the API's own role check.

---

## Take note

### Before merging

1. **API contract changed.** `packages/api-contract/openapi.yaml`: the telemetry route now
   documents `hours`, says readings come **oldest first** (it said newest first, which was
   wrong), and lists the 400/403/404 answers. The images route was not changed. The code
   follows it. The contract test says contract changes need **two approvals**.
2. **The Render API must be redeployed** for the date range and the photos to work on the
   live site. The live site still runs the old API, where the images route answers nothing.
3. **No database migration is needed.** `sensor_images`, the `sensor-images` bucket and
   their policies already exist (`20261008090000_restore_sensor_images.sql`).

### Photos

- Photos only appear once the webcam script (`apps/firmware/Nodegateway.py`, CTIP-62) has
  uploaded some for that node. It saves files as `sensor-images/<node_id>/<image_id>.jpg`
  and adds a `sensor_images` row.
- On 11 Nov the main project had **25 photos**, all from node `0ac66bdc…`, 3–9 Nov, all
  with their files.
- The **test project** (`Daun Sense Test`) has the 25 `sensor_images` rows but **no
  files** in its bucket, so photos show as "Photo not available" there. A copy script was
  written but not run. The test project is no longer in use.

### Running locally

- The website reads only `VITE_API_URL` from `apps/web/.env`. Supabase settings go in
  `services/api/.env`. Restart Vite and the API after changing either: both read the file
  only at start-up.
- When switching the API between Supabase projects, **sign out and in again**. A session
  from one project is not valid on the other.
- Without `VITE_API_URL`, the dev server sends `/v1` to the Render API, which uses the
  main database.

### Behaviour changes people may notice

- Reports: no Sort dropdown. Click the headers.
- Plant page: the small location map can't be dragged any more. Click it to open the big one.
- Monitoring: the node card is no longer one big button. Only its name/plant area selects
  the node.
- Monitoring: "Alert" means an alert with status **open**. Acknowledged alerts no longer
  make a pin red, which matches the "Open alerts" count.

---

## Tests

| Suite | Result |
|---|---|
| API (`cd services/api && node --test`) | 240 pass. New: date range on telemetry, and the images route (signed links, filters, bad input, botanist refused) |
| Web Monitoring (`npx playwright test tests/monitoring-page.spec.js`) | 8 pass (desktop and mobile). New: all five readings on a card, chosen date range request, 30-day limit, map key counts, photo popup |
| Web lint and build | Pass |
| `tests/role-pages.spec.js` | **Fails, unrelated.** It clicks a `.roleswitch` button that no longer exists in the app. Fails the same way without these changes |

The test mock (`apps/web/tests/helpers/mockApi.js`) now records `from`/`to` on telemetry
requests and answers `/sensor-nodes/:id/images` from `state.sensorImages`.

Not tested yet: the Monitoring page against real sensor data in a browser, with real map
tiles and real photos.

## Files

| File | Change |
|---|---|
| `apps/web/src/pages/SensorOverview.jsx` | Monitoring page rebuilt around the map, live readings, charts and photos |
| `apps/web/src/components/SensorParts.jsx` | **New.** `NodeMap`, `TimeChart`, `NodeImages` |
| `apps/web/src/sensorState.js` | **New.** Node state (alert/online/offline) shared by the two files above |
| `apps/web/src/pages/ReportSummary.jsx` | Sortable headers, default newest first |
| `apps/web/src/components/MiniMap.jsx` | `expandable` / `mapHref` options and the large-map popup |
| `apps/web/src/pages/Specimen.jsx` | Expandable map, QR code popup |
| `apps/web/src/pages/PublicPlant.jsx` | Expandable map |
| `apps/web/src/components/Icon.jsx` | `expand` icon |
| `apps/web/src/App.css` | Password button, sort headers, enlarge overlays, QR popup, Monitoring styles |
| `apps/shared/api.js` | `getNodeTelemetryApi` takes `{ from, to }`; new `getNodeImagesApi` |
| `apps/shared/StoreProvider.js` | Keeps node `lat`/`lng`; `loadNodeTelemetry` takes a date range; new `loadNodeImages` |
| `services/api/src/staff.js` | Telemetry date range (`telemetryRange`); images handler |
| `services/api/test/field-and-staff.test.js` | Tests for both; the fake Supabase understands `lte` and has `sensor_images` |
| `packages/api-contract/openapi.yaml` | Telemetry route documented as it behaves |
| `apps/web/tests/helpers/mockApi.js`, `apps/web/tests/monitoring-page.spec.js` | Mock and tests for the Monitoring page |
