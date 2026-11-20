// apps/web/tests/rbac-admin.spec.js
// RBAC.md D2, D5, D6, D15: an admin sees the species list read-only, cannot open the
// officer pages (review, reports, QR tags), and can still hide a plant's location.
// The API is mocked in the browser.
import { test, expect } from "@playwright/test";
import { newState, open, species, specimen } from "./helpers/mockApi.js";

const id = (n) => `dddddddd-0000-4000-8000-${String(n).padStart(12, "0")}`;

function withSpecies(role) {
  const state = newState({ role });
  state.staffSpecies = [
    species({ id: id(1), scientific_name: "Nepenthes published", common_name: "Published pitcher", is_published: true }),
    species({ id: id(2), scientific_name: "Nepenthes draft", common_name: "Draft pitcher", is_published: false }),
  ];
  state.species = state.staffSpecies;
  return state;
}

test("admin: species list is read-only and includes unpublished species", async ({ page }) => {
  await open(page, withSpecies("admin"), "#/species");
  await expect(page.getByText("Draft pitcher")).toBeVisible();
  await expect(page.getByRole("table").getByText("Not published")).toBeVisible();
  await expect(page.getByText("View only")).toBeVisible();
  await expect(page.getByRole("button", { name: /Add species/ })).toHaveCount(0);
  await expect(page.getByRole("switch")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Delete / })).toHaveCount(0);
});

test("officer: species list keeps add, publish, edit and delete", async ({ page }) => {
  await open(page, withSpecies("officer"), "#/species");
  await expect(page.getByRole("button", { name: /Add species/ })).toBeVisible();
  await expect(page.getByRole("switch").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Edit / }).first()).toBeVisible();
});

test("admin: the dashboard links to Species but not QR tags, Review queue or Reports", async ({ page }) => {
  await open(page, withSpecies("admin"), "#/dashboard");
  await expect(page.getByRole("link", { name: /^Species/ }).first()).toBeVisible();
  for (const name of [/^QR tags/, /^Review/, /^Reports/]) {
    await expect(page.getByRole("link", { name })).toHaveCount(0);
  }
});

for (const hash of ["#/tags", "#/review", "#/reports"]) {
  test(`admin: ${hash} does not open`, async ({ page }) => {
    await open(page, withSpecies("admin"), hash);
    await expect(page.locator("section.prose h1")).toBeVisible(); // the "no access" page
    await expect(page.locator("main table, .reviewlist")).toHaveCount(0);
  });
}

test("admin: the hide-location switch shows on a tagged plant", async ({ page }) => {
  const state = withSpecies("admin");
  await open(page, state, `#/tag/${specimen(1).qr_id}`);
  await expect(page.locator("label.check.hidespot")).toBeVisible();
});
