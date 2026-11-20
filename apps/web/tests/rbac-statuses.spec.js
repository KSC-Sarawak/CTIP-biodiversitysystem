// apps/web/tests/rbac-statuses.spec.js
// RBAC D11: four conservation statuses, and a species cannot be saved without one.
// The API is mocked, so this never touches the live database.
import { test, expect } from "@playwright/test";
import { newState, open } from "./helpers/mockApi.js";

test("Add species offers only the four statuses and picks none", async ({ page }) => {
  const state = newState({ role: "officer" });
  await open(page, state, "#/species");
  await page.getByRole("button", { name: "Add species" }).click();
  const status = page.getByLabel("Conservation status");
  await expect(status).toHaveValue("");
  const options = await status.locator("option:not([disabled])").allTextContents();
  expect(options.map((o) => o.toLowerCase())).toEqual(["least concern", "near threatened", "vulnerable", "endangered"]);
  await expect(page.getByText("Choose the species' conservation status before saving.")).toBeVisible();
});

test("saving without a status is refused; with one it is sent", async ({ page }) => {
  const state = newState({ role: "officer" });
  await open(page, state, "#/species");
  await page.getByRole("button", { name: "Add species" }).click();
  await page.getByLabel("Scientific name").fill("Nepenthes testii");
  await page.getByRole("button", { name: /save/i }).first().click();
  await expect(page.getByText("Choose a conservation status from the list")).toBeVisible();
  expect(state.writes.filter((w) => w.path === "/species")).toHaveLength(0);
  await page.getByLabel("Conservation status").selectOption("vulnerable");
  await page.getByRole("button", { name: /save/i }).first().click();
  await expect.poll(() => state.writes.find((w) => w.path === "/species")?.body?.conservation_status).toBe("vulnerable");
});
