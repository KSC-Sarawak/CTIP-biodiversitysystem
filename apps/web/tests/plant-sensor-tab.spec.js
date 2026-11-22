// apps/web/tests/plant-sensor-tab.spec.js
// The Sensor tab on a plant's page: the node guarding it, its latest reading and
// the fixed stable range the alerts use. Nodes have no per-node limits
// (thresholds is null on most), which used to crash this tab.
import { test, expect } from "@playwright/test";
import { newState, open, specimen } from "./helpers/mockApi.js";

const NODE = "c3c3c3c3-0000-4000-8000-000000000001";

test("plant Sensor tab shows the latest reading against the stable range, for a node with no limits", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const state = newState();
  state.sensorNodes = [
    { id: NODE, specimen_id: specimen(1).id, status: "active", thresholds: null, last_seen: new Date().toISOString(), created_at: "2026-11-01T00:00:00Z" },
  ];
  state.telemetry = [
    { id: "t1", node_id: NODE, ts: new Date().toISOString(), temperature: 36.5, humidity: 70, soil_moisture: null, distance_cm: 40, motion_detected: false },
  ];
  await open(page, state, `#/tag/${specimen(1).qr_id}`);
  await page.getByRole("tab", { name: "Sensor" }).click();

  const panel = page.locator("#tabpanel");
  await expect(panel).toContainText("temperature 36.5 °C above range");
  await expect(panel).toContainText("air humidity 70%");
  await expect(panel).toContainText("soil moisture -");
  await expect(panel).toContainText("Alert range: temperature 18 to 35 °C · air humidity 40 to 100% · soil moisture 20 to 80%.");
  expect(errors).toEqual([]);
});
