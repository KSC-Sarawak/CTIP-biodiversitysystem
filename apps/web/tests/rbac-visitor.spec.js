// apps/web/tests/rbac-visitor.spec.js
// RBAC D9: a visitor sees no location at all for a location-protected plant,
// only the note. The API is mocked, so this never touches the live database.
import { test, expect } from "@playwright/test";
import { newState, openAsVisitor, species } from "./helpers/mockApi.js";

const NOTE = "This plant's exact location is hidden to protect it.";
const tagPage = (fields) => ({ ...newState(), publicPlant: { qr_id: "NIAH-0002", species: species({ conservation_status: "endangered" }), ...fields } });

test("a protected plant's QR page shows the note and no map", async ({ page }) => {
  await openAsVisitor(page, tagPage({ lat: null, lng: null, location_reduced: true }), "#/tag/NIAH-0002");
  await expect(page.getByRole("heading", { name: "Where it grows" })).toBeVisible();
  await expect(page.getByText(NOTE)).toBeVisible();
  await expect(page.locator(".leaflet-container")).toHaveCount(0);
});

test("an ordinary plant's QR page shows its map", async ({ page }) => {
  await openAsVisitor(page, tagPage({ lat: 3.81, lng: 113.78, location_reduced: false }), "#/tag/NIAH-0002");
  await expect(page.getByRole("heading", { name: "Where it grows" })).toBeVisible();
  await expect(page.getByText(NOTE)).toHaveCount(0);
  await expect(page.getByRole("region", { name: /Map of where/ }).or(page.locator(".leaflet-container")).first()).toBeVisible();
});
