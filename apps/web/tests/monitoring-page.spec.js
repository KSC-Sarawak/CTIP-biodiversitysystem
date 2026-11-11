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

  const key = page.getByRole("list", { name: "Map key" });
  await expect(key.getByText("Alert 1")).toBeVisible();
  await expect(key.getByText("Offline 1")).toBeVisible();
  await expect(page.getByText("Not on the map (no location recorded): South node.")).toBeVisible();
  await expect(page.locator("article.nodecard").filter({ hasText: "North node" }).getByRole("button", { name: /1 open alert/ })).toBeVisible();

  // CTIP-82: photos for the chosen node, enlarged on click.
  await page.getByRole("button", { name: /Enlarge photo/ }).click();
  await expect(page.getByRole("dialog").getByRole("img", { name: /Webcam photo from North node/ })).toBeVisible();
  expect(errors).toEqual([]);
});
