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
  await expect(page.getByText("No plant assigned")).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Gate node readings" })).toBeVisible();
  await expect(page.getByText("3 readings in the last 24 hours")).toBeVisible();
  await expect(page.getByText("36.2°C").first()).toBeVisible(); // node card: the newest reading
  await expect(page.getByRole("button", { name: /Gate node/ }).getByText("Movement", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "7 days" }).click();
  await expect(page.getByText("3 readings in the last 7 days")).toBeVisible();
  expect(state.telemetryRequests).toEqual([{ id: NODE, hours: "168" }]);
  expect(errors).toEqual([]);
});
