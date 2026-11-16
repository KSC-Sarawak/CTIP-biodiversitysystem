// apps/web/tests/sensor-nodes-page.spec.js
// Admin "Sensor nodes" page (CTIP-48): register a node, edit and turn it off,
// and choose who hears about which alerts. The API is mocked in the browser.
import { test, expect } from "@playwright/test";
import { ME, newState, open, specimen } from "./helpers/mockApi.js";

const NODE = "a1a1a1a1-0000-4000-8000-000000000001";
const OTHER = "b2b2b2b2-0000-4000-8000-000000000002";

const adminState = () => {
  const state = newState({ role: "admin" });
  state.sensorNodes = [
    { id: NODE, specimen_id: null, status: "active", thresholds: null, last_seen: "2026-11-16T08:00:00Z", lat: 3.81, lng: 113.78, created_at: "2026-11-01T00:00:00Z" },
    { id: OTHER, specimen_id: null, status: "offline", thresholds: null, last_seen: "2026-11-12T08:00:00Z", lat: 3.82, lng: 113.79, created_at: "2026-11-02T00:00:00Z" },
  ];
  return state;
};

test("an admin registers a node and is shown its id for the gateway", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const state = adminState();
  await open(page, state, "#/nodes");
  await expect(page.getByRole("heading", { name: "Sensor nodes" })).toBeVisible();
  await expect(page.getByText("1 node has stopped sending readings.")).toBeVisible();

  await page.getByRole("button", { name: "Register node" }).click();
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Enter where the node is installed");
  await page.getByLabel("Latitude").fill("3.8155");
  await page.getByLabel("Longitude").fill("113.7811");
  await page.getByLabel("Plant it guards").selectOption(specimen(1).id);
  await page.getByRole("button", { name: "Register", exact: true }).click();

  await expect(page.getByText("Node registered.")).toBeVisible();
  await expect(page.locator(".newnodeid")).toHaveText("aaaaaaaa-0000-4000-8000-0000000000ff");
  const sent = state.writes.find((w) => w.method === "POST" && w.path === "/sensor-nodes");
  expect(sent.body).toEqual({ lat: 3.8155, lng: 113.7811, specimen_id: specimen(1).id, status: "active" });
  expect(errors).toEqual([]);
});

test("an admin moves a node and turns it off after confirming", async ({ page }) => {
  const state = adminState();
  await open(page, state, "#/nodes");
  await page.getByRole("button", { name: `Edit Node ${NODE.slice(0, 4)}` }).first().click();
  await page.getByLabel("Latitude").fill("3.9");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const moved = state.writes.find((w) => w.method === "PATCH");
  expect(moved.body).toEqual({ lat: 3.9, lng: 113.78, specimen_id: null }); // status unchanged: not sent

  const row = page.locator("tr", { hasText: NODE });
  await row.getByRole("button", { name: "Turn off" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Turn off" }).click();
  await expect(row.getByText("Turned off")).toBeVisible();
  expect(state.writes.filter((w) => w.method === "PATCH").at(-1).body).toEqual({ status: "retired" });
  await expect(row.getByRole("button", { name: "Turn on" })).toBeVisible();
});

test("an admin narrows which alerts an officer hears about, then resets it", async ({ page }) => {
  const state = adminState();
  await open(page, state, "#/nodes");
  const row = page.locator(`tr[data-person="${ME}"]`);
  await expect(row).toContainText("Every node");
  await row.getByRole("button", { name: /Change alerts/ }).click();
  await page.getByLabel("Only these nodes").check();
  await page.getByRole("checkbox", { name: `Node ${NODE.slice(0, 4)}` }).check();
  await page.getByLabel("Severity").selectOption("high");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(row).toContainText(`Node ${NODE.slice(0, 4)}`);
  await expect(row).toContainText("High and up");
  expect(state.writes.find((w) => w.method === "PUT").body).toEqual({ node_ids: [NODE], min_severity: "high" });

  await row.getByRole("button", { name: /Change alerts/ }).click();
  await page.getByRole("button", { name: "Back to every alert" }).click();
  await expect(row).toContainText("Every node");
  await expect(row).toContainText("Every alert");
  expect(state.writes.at(-1)).toMatchObject({ method: "DELETE", path: `/alert-routes/${ME}` });
});

test("officers cannot open the Sensor nodes page", async ({ page }) => {
  await open(page, newState({ role: "officer" }), "#/nodes");
  await expect(page.getByRole("heading", { name: "Sensor nodes" })).toHaveCount(0);
});
