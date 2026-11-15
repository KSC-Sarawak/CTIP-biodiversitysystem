// apps/web/tests/monitoring-page.spec.js
// The monitoring page must open even when the data is incomplete: a sensor node with
// no plant, an alert with no node or reading. The API is mocked in the browser.
import { test, expect } from "@playwright/test";
import { newState, open, specimen } from "./helpers/mockApi.js";

test("monitoring opens with a node that has no plant and an alert with no reading", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const state = newState();
  state.sensorNodes = [
    { id: "aaaaaaaa-0000-4000-8000-000000000001", specimen_id: null, status: "active", thresholds: null, last_seen: null, created_at: "2026-11-01T00:00:00Z" },
    { id: "aaaaaaaa-0000-4000-8000-000000000002", specimen_id: specimen(1).id, status: "offline", thresholds: { temp_max: 35, moisture_min: 20 }, last_seen: "2026-11-02T00:00:00Z", created_at: "2026-11-01T00:00:00Z" },
  ];
  state.alerts = [
    { id: "bbbbbbbb-0000-4000-8000-000000000001", node_id: null, type: "Overheat", reading: null, severity: "high", status: "open", created_at: "2026-11-03T00:00:00Z" },
  ];
  await open(page, state, "#/monitoring");
  await expect(page.getByRole("heading", { name: "Monitoring" })).toBeVisible();
  await expect(page.getByText("No plant assigned").first()).toBeVisible();
  await expect(page.getByText("Unknown node").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("monitoring shows readings from the telemetry table, and asks the API for longer ranges", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const NODE = "aaaaaaaa-0000-4000-8000-000000000003";
  const at = (minsAgo) => new Date(Date.now() - minsAgo * 60_000).toISOString();
  const state = newState();
  state.sensorNodes = [
    { id: NODE, name: "Gate node", specimen_id: specimen(1).id, status: "active", thresholds: { temp_max: 35, moisture_min: 20 }, last_seen: at(1), created_at: "2026-11-01T00:00:00Z" },
  ];
  // Newest first, as the API sends them.
  state.telemetry = [
    { id: "t3", node_id: NODE, ts: at(1), temperature: 36.2, soil_moisture: 18, humidity: 70, distance_cm: 40, motion_detected: true },
    { id: "t2", node_id: NODE, ts: at(20), temperature: 30.1, soil_moisture: 25, humidity: 65, distance_cm: null, motion_detected: false },
    { id: "t1", node_id: NODE, ts: at(40), temperature: 29.5, soil_moisture: 27, humidity: 60, distance_cm: 120, motion_detected: false },
  ];
  await open(page, state, "#/monitoring");
  await expect(page.getByRole("heading", { name: "Gate node", exact: true })).toBeVisible();
  await expect(page.getByText("3 readings from the last 24 hours")).toBeVisible();
  // CTIP-79: the node card shows all five latest readings.
  const card = page.locator("article.nodecard").filter({ hasText: "Gate node" });
  await expect(card.getByText("36.2°C")).toBeVisible();
  await expect(card.getByText("70%")).toBeVisible();
  await expect(card.getByText("18%")).toBeVisible();
  await expect(card.getByText("40 cm")).toBeVisible();
  await expect(card.getByText("Movement", { exact: true })).toBeVisible();

  // CTIP-81: charts over time, and longer ranges come from the API.
  await expect(page.locator("figure.tchart")).toHaveCount(4);
  await page.getByRole("button", { name: "7 days" }).click();
  await expect(page.getByText("3 readings from the last 7 days")).toBeVisible();
  expect(state.telemetryRequests).toEqual([{ id: NODE, hours: "168" }]);
  expect(errors).toEqual([]);
});

test("monitoring: chosen dates ask the API for that range, and refuse more than 30 days", async ({ page }) => {
  const NODE = "aaaaaaaa-0000-4000-8000-000000000004";
  const state = newState();
  state.sensorNodes = [{ id: NODE, name: "Ridge node", specimen_id: specimen(1).id, status: "active", thresholds: null, last_seen: null, created_at: "2026-11-01T00:00:00Z" }];
  await open(page, state, "#/monitoring");
  await page.getByRole("button", { name: "Choose dates" }).click();
  await page.getByLabel("From").fill("2026-11-01");
  await page.getByLabel("to", { exact: true }).fill("2026-11-03");
  await expect.poll(() => (state.telemetryRequests || []).at(-1)?.from).toBeTruthy();
  const last = state.telemetryRequests.at(-1);
  expect(last.hours).toBeNull();
  expect(new Date(last.to) - new Date(last.from)).toBeGreaterThan(2.9 * 24 * 3600e3); // three whole days
  await page.getByLabel("From").fill("2026-09-01");
  await expect(page.getByText("Pick at most 30 days.")).toBeVisible();
});

test("monitoring: node map shows each state, and a node's latest webcam photos", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const ON = "aaaaaaaa-0000-4000-8000-000000000005";
  const OFF = "aaaaaaaa-0000-4000-8000-000000000006";
  const state = newState();
  state.sensorNodes = [
    { id: ON, name: "North node", specimen_id: specimen(1).id, status: "active", thresholds: null, last_seen: null, lat: 1.55, lng: 110.35, created_at: "2026-11-01T00:00:00Z" },
    { id: OFF, name: "South node", specimen_id: null, status: "offline", thresholds: null, last_seen: null, created_at: "2026-11-01T00:00:00Z" },
  ];
  state.alerts = [{ id: "bbbbbbbb-0000-4000-8000-000000000002", node_id: ON, type: "intrusion", reading: { distance_cm: 20 }, severity: "high", status: "open", created_at: "2026-11-03T00:00:00Z" }];
  const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  state.sensorImages = [{ id: "cccccccc-0000-4000-8000-000000000001", node_id: ON, alert_id: "bbbbbbbb-0000-4000-8000-000000000002", captured_at: "2026-11-03T00:00:00Z", view_url: pixel }];
  await open(page, state, "#/monitoring");

  // The map key is a row of filter buttons, one per state, with its count.
  const key = page.getByRole("group", { name: /Map key/ });
  await expect(key.getByRole("button", { name: "Alert 1" })).toBeVisible();
  await expect(key.getByRole("button", { name: "Offline 1" })).toBeVisible();
  await expect(page.getByText("Not on the map (no location recorded): South node.")).toBeVisible();
  await expect(page.locator("article.nodecard").filter({ hasText: "North node" }).getByRole("button", { name: /1 open alert/ })).toBeVisible();

  // CTIP-82: photos for the chosen node, enlarged on click.
  await page.getByRole("button", { name: /Enlarge photo/ }).click();
  await expect(page.getByRole("dialog").getByRole("img", { name: /Webcam photo from North node/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("monitoring: the slider picks any range from 1 hour; up to a day needs no API call", async ({ page }) => {
  const NODE = "aaaaaaaa-0000-4000-8000-000000000007";
  const at = (minsAgo) => new Date(Date.now() - minsAgo * 60_000).toISOString();
  const state = newState();
  state.sensorNodes = [{ id: NODE, name: "Slider node", specimen_id: specimen(1).id, status: "active", thresholds: null, last_seen: at(1), created_at: "2026-11-01T00:00:00Z" }];
  state.telemetry = [
    { id: "s2", node_id: NODE, ts: at(10), temperature: 25, soil_moisture: 40, humidity: 70 },
    { id: "s1", node_id: NODE, ts: at(180), temperature: 24, soil_moisture: 41, humidity: 72 },
  ];
  await open(page, state, "#/monitoring");
  const slider = page.getByRole("slider", { name: /Show the last/ });
  await expect(slider).toHaveAttribute("aria-valuetext", "24 hours");
  await slider.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft"); // 24 h -> 1 h
  await expect(slider).toHaveAttribute("aria-valuetext", "1 hour");
  await expect(page.getByText("1 reading from the last 1 hour")).toBeVisible();
  expect(state.telemetryRequests || []).toEqual([]);
  await page.keyboard.press("End"); // 30 days
  await expect(page.getByText("2 readings from the last 30 days")).toBeVisible();
  expect(state.telemetryRequests).toEqual([{ id: NODE, hours: "720" }]);
  await expect(page.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
});

test("monitoring: a person renames a node for themself, and can go back to its technical name", async ({ page }) => {
  const NODE = "aaaaaaaa-0000-4000-8000-000000000008";
  const state = newState();
  state.sensorNodes = [{ id: NODE, name: "ESP32-NODE-07", specimen_id: specimen(1).id, status: "active", thresholds: null, last_seen: null, created_at: "2026-11-01T00:00:00Z" }];
  await open(page, state, "#/monitoring");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await page.getByLabel("Your name for this node").fill("Orchid by the gate");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orchid by the gate", exact: true })).toBeVisible();
  await expect(page.locator("article.nodecard").getByText("Orchid by the gate")).toBeVisible();
  await expect(page.locator("article.nodecard").getByText("ESP32-NODE-07")).toBeVisible(); // technical name still shown
  expect(state.writes.at(-1)).toEqual({ method: "PUT", path: `/sensor-nodes/${NODE}/nickname`, body: { nickname: "Orchid by the gate" } });

  await page.locator("article.nodecard").getByRole("button", { name: "Rename Orchid by the gate" }).click();
  await page.getByRole("button", { name: "Use technical name" }).click();
  await expect(page.getByRole("heading", { name: "ESP32-NODE-07", exact: true })).toBeVisible();
  expect(state.writes.at(-1).body).toEqual({ nickname: null });
});

test("monitoring: readings outside the preset stable range are flagged; per-node limits are not used", async ({ page }) => {
  const NODE = "aaaaaaaa-0000-4000-8000-000000000009";
  const at = (minsAgo) => new Date(Date.now() - minsAgo * 60_000).toISOString();
  const state = newState();
  // Old per-node limits are ignored for now: soil 25% is inside the preset 20 to 80%.
  state.sensorNodes = [{ id: NODE, name: "Range node", specimen_id: specimen(1).id, status: "active", thresholds: { moisture_min: 30 }, last_seen: at(1), created_at: "2026-11-01T00:00:00Z" }];
  state.telemetry = [{ id: "r1", node_id: NODE, ts: at(1), temperature: 16, humidity: 30, soil_moisture: 25 }];
  await open(page, state, "#/monitoring");
  const now = page.locator(".nowstrip[aria-live]");
  await expect(now.locator(".is-off")).toHaveCount(2); // too cold, too dry air
  await expect(now.getByText("Below range · 18 to 35 °C")).toBeVisible();
  await expect(now.getByText("Range 20 to 80%")).toBeVisible();
  const rules = page.getByLabel("Alert rules");
  await expect(rules.getByRole("listitem")).toHaveText(["Temperature 18 to 35 °C", "Air humidity 40 to 100%", "Soil moisture 20 to 80%"]);
  await expect(page.getByRole("button", { name: "Save range" })).toHaveCount(0); // no per-node editing yet
});

test("monitoring: the fixed range comes from the database copy of the settings file", async ({ page }) => {
  const NODE = "aaaaaaaa-0000-4000-8000-000000000010";
  const at = (minsAgo) => new Date(Date.now() - minsAgo * 60_000).toISOString();
  const state = newState();
  state.sensorNodes = [{ id: NODE, name: "Pushed node", specimen_id: specimen(1).id, status: "active", thresholds: null, last_seen: at(1), created_at: "2026-11-01T00:00:00Z" }];
  // Pushed with npm run sensor-ranges:push: a cooler maximum than the file's 35 °C.
  state.stableRanges = [{ field: "temperature", min_value: 15, max_value: 30 }];
  state.telemetry = [{ id: "p1", node_id: NODE, ts: at(1), temperature: 32, humidity: 70, soil_moisture: 50 }];
  await open(page, state, "#/monitoring");
  await expect(page.locator(".nowstrip[aria-live] .is-off")).toHaveCount(1);
  await expect(page.getByLabel("Alert rules").getByRole("listitem").first()).toHaveText("Temperature 15 to 30 °C");
});

test("monitoring: clicking anywhere on a node's row picks it; the map stays in view", async ({ page }) => {
  const A = "aaaaaaaa-0000-4000-8000-000000000012";
  const B = "aaaaaaaa-0000-4000-8000-000000000013";
  const state = newState();
  state.sensorNodes = [
    { id: A, name: "Alpha node", specimen_id: null, status: "active", thresholds: null, last_seen: null, lat: 3.8, lng: 113.77, created_at: "2026-11-01T00:00:00Z" },
    { id: B, name: "Beta node", specimen_id: null, status: "active", thresholds: null, last_seen: null, lat: 3.81, lng: 113.78, created_at: "2026-11-01T00:00:00Z" },
  ];
  await open(page, state, "#/monitoring");
  await expect(page.getByRole("group", { name: "Map of sensor nodes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Alpha node", exact: true })).toBeVisible();
  await page.locator("article.nodecard").filter({ hasText: "Beta node" }).getByText("No readings yet").click(); // not the name
  await expect(page.getByRole("heading", { name: "Beta node", exact: true })).toBeVisible();
});

test("monitoring: the parts of a graph outside the stable range are drawn in the alert colour", async ({ page }) => {
  const NODE = "aaaaaaaa-0000-4000-8000-000000000014";
  const at = (minsAgo) => new Date(Date.now() - minsAgo * 60_000).toISOString();
  const state = newState();
  state.sensorNodes = [{ id: NODE, name: "Chart node", specimen_id: null, status: "active", thresholds: null, last_seen: at(1), created_at: "2026-11-01T00:00:00Z" }];
  state.telemetry = [ // newest first: one hot reading out of three (temperature range 18 to 35 °C)
    { id: "c3", node_id: NODE, ts: at(10), temperature: 39, humidity: 70, soil_moisture: 50 },
    { id: "c2", node_id: NODE, ts: at(40), temperature: 30, humidity: 70, soil_moisture: 50 },
    { id: "c1", node_id: NODE, ts: at(70), temperature: 28, humidity: 70, soil_moisture: 50 },
  ];
  await open(page, state, "#/monitoring");
  const temp = page.locator("figure.tchart").filter({ hasText: "Temperature" });
  await expect(temp.locator(".spark-bad")).toHaveCount(1);
  await expect(temp.getByText("1 outside range")).toBeVisible();
  await expect(temp.getByRole("img")).toHaveAttribute("aria-label", /1 of 3 readings outside the stable range/);
  const humid = page.locator("figure.tchart").filter({ hasText: "Air humidity" });
  await expect(humid.locator(".tchart-off")).toHaveCount(0);
});

test("monitoring: one Alerts section lists open alerts first, with tabs for the rest and the rules as a reference", async ({ page }) => {
  const NODE = "aaaaaaaa-0000-4000-8000-000000000015";
  const state = newState();
  state.sensorNodes = [{ id: NODE, name: "Alert node", specimen_id: null, status: "active", thresholds: null, last_seen: null, created_at: "2026-11-01T00:00:00Z" }];
  state.alerts = [
    { id: "bbbbbbbb-0000-4000-8000-000000000201", node_id: NODE, type: "Soil moisture too low", reading: { soil_moisture: 12, stable_range: "20.0 to 80.0 %" }, severity: "high", status: "open", created_at: "2026-11-15T00:00:00Z" },
    { id: "bbbbbbbb-0000-4000-8000-000000000202", node_id: NODE, type: "Temperature too high", reading: { temperature: 37 }, severity: "medium", status: "resolved", outcome: "Shade fixed", created_at: "2026-11-10T00:00:00Z" },
  ];
  await open(page, state, "#/monitoring");
  await expect(page.getByRole("heading", { name: "Needs attention" })).toHaveCount(0);
  const alerts = page.locator("#alerts");
  await expect(alerts.getByRole("button", { name: /^Open\s*1$/ })).toHaveAttribute("aria-pressed", "true");
  await expect(alerts.getByText("Soil moisture too low")).toBeVisible();
  await expect(alerts.getByText("Temperature too high")).toHaveCount(0);
  await alerts.getByRole("button", { name: /^Resolved\s*1$/ }).click();
  await expect(alerts.getByText("Outcome: Shade fixed")).toBeVisible();
  await expect(alerts.getByLabel("Alert rules")).toContainText("Soil moisture 20 to 80%");
});
