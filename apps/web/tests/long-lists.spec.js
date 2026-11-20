// apps/web/tests/long-lists.spec.js
// Long staff lists stay readable: 10 rows first, then "View more"; the audit log shows a short
// change with a badge per kind, and the full change on request. The API is mocked in the browser.
import { test, expect } from "@playwright/test";
import { ME, newState, open, species, specimen } from "./helpers/mockApi.js";

const id = (prefix, n) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("species: ten at a time, View more adds ten, a search starts over", async ({ page }) => {
  const state = newState({ role: "admin" });
  state.staffSpecies = Array.from({ length: 23 }, (_, i) => species({ id: id("dddddddd", i + 1), scientific_name: `Nepenthes test${String(i + 1).padStart(2, "0")}`, common_name: `Pitcher ${String(i + 1).padStart(2, "0")}` }));
  state.species = state.staffSpecies; // the live refresh sends the same list
  await open(page, state, "#/species");
  const rows = page.locator("table").first().locator("tbody tr");
  await expect(rows).toHaveCount(10);
  await expect(page.getByText("Showing 10 of 23 species")).toBeVisible();
  await page.getByRole("button", { name: "View 10 more" }).click();
  await expect(rows).toHaveCount(20);
  await page.getByRole("button", { name: "View 3 more" }).click();
  await expect(rows).toHaveCount(23);
  // A new search starts again at the first ten.
  await page.getByLabel("Search species").fill("Nepenthes");
  await expect(rows).toHaveCount(10);
  await expect(page.getByText("Showing 10 of 23 species")).toBeVisible();
});

test("tags: ten at a time with a small QR preview that opens the big one", async ({ page }) => {
  const state = newState({ role: "officer" }); // QR tags are officer work (RBAC D5)
  state.tags = Array.from({ length: 14 }, (_, i) => ({ qr_id: `NIAH-${String(i + 1).padStart(4, "0")}`, status: "unused", batch_label: "2026-11-A", created_at: "2026-11-01T00:00:00Z" }));
  await open(page, state, "#/tags");
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await expect(page.getByText("Showing 10 of 14 tags")).toBeVisible();
  const thumb = page.getByRole("button", { name: "Open QR code for NIAH-0001" });
  await expect(thumb.locator("svg")).toBeVisible();
  await expect(thumb).toContainText("NIAH-0001");
  await thumb.click();
  await expect(page.getByRole("dialog", { name: /QR tag NIAH-0001/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "View 4 more" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(14);
});

test("audit: a badge per kind, a one-line change, and Expand for every field", async ({ page }) => {
  const state = newState({ role: "admin" });
  state.audit = [
    { id: id("eeeeeeee", 1), changed_by: ME, table_name: "observations", record_id: "x", action: "UPDATE", changed_at: "2026-11-15T10:00:00Z",
      old_value: { status: "synced", notes: "Near the path", version: 1, updated_at: "a" },
      new_value: { status: "approved", notes: "Near the path, by the big rock where the stream bends", version: 2, updated_at: "b" } },
    { id: id("eeeeeeee", 2), changed_by: ME, table_name: "qr_tags", record_id: "y", action: "INSERT", changed_at: "2026-11-15T09:00:00Z", old_value: null, new_value: { qr_id: "NIAH-0099", status: "unused" } },
    { id: id("eeeeeeee", 3), changed_by: null, table_name: "auth", record_id: "z", action: "SIGN_IN_FAILED", changed_at: "2026-11-15T08:00:00Z", old_value: null, new_value: { email: "who@example.com" } },
  ];
  await open(page, state, "#/audit");
  const table = page.locator("table.audittable");
  await expect(table.locator(".auditbadge")).toHaveText(["Edited", "Created", "Sign-in failed"]);
  // Changed fields only, long values cut short; version and updated_at stay out of the summary.
  await expect(table.locator(".auditsummary").first()).toHaveText(/^status: synced → approved · notes: Near the path → Near the path, by the.*…$/);
  await expect(table.getByText("NIAH-0099 · 2 fields")).toBeVisible();
  await expect(table.locator(".auditsummary").nth(2)).toHaveText("who@example.com");

  const expand = table.getByRole("button", { name: "Expand" }).first();
  await expand.click();
  await expect(table.getByRole("button", { name: "Hide" })).toHaveAttribute("aria-expanded", "true");
  const fields = table.locator(".auditfields");
  await expect(fields.getByText("Near the path, by the big rock where the stream bends")).toBeVisible(); // the whole value
  await expect(fields.locator("tr.changed")).toHaveCount(4); // status, notes, version, updated_at
  await expect(table.getByRole("button", { name: "Expand" })).toHaveCount(1); // the sign-in has nothing to expand
});

test("tagged plants: ten rows per page by default", async ({ page }) => {
  const state = newState({ role: "admin" });
  state.specimens = Array.from({ length: 12 }, (_, i) => specimen(i + 1, { id: id("aaaaaaaa", i + 1), qr_id: `NIAH-${String(i + 1).padStart(4, "0")}` }));
  state.observations = [];
  state.photos = [];
  await open(page, state, "#/dashboard/all");
  await expect(page.getByText("Showing 1–10 of 12")).toBeVisible();
  await expect(page.getByLabel("Rows per page")).toHaveValue("10");
});
