// apps/web/tests/account-page.spec.js
// The account page greets the person, shows how complete their profile is, and helps them
// pick a strong new password. The API is mocked in the browser.
import { test, expect } from "@playwright/test";
import { newState, open } from "./helpers/mockApi.js";

test("account: a greeting, profile strength, and live password checks", async ({ page }) => {
  await open(page, newState(), "#/account");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Good (morning|afternoon|evening), Olive$/);

  // Nothing filled in yet: 0%, with each missing step as a shortcut.
  const strength = page.getByLabel(/Profile \d+% complete/);
  await expect(strength).toHaveAttribute("aria-label", "Profile 0% complete");
  await strength.getByRole("button", { name: "Add a phone number" }).click();
  await expect(page.getByLabel("Phone (optional)")).toBeFocused();

  // Password strength and match, as the person types.
  await page.getByLabel("New password", { exact: true }).fill("short");
  await expect(page.locator(".pwmeter")).toContainText("Too short");
  await page.getByLabel("New password", { exact: true }).fill("Forest2026!x");
  await expect(page.locator(".pwmeter")).toContainText("Strong");
  await page.getByLabel("Confirm new password").fill("Forest2026");
  await expect(page.getByText("Passwords do not match yet")).toBeVisible();
  await page.getByLabel("Confirm new password").fill("Forest2026!x");
  await expect(page.getByText("Passwords match")).toBeVisible();
});

test("tags: no separate QR button; the sticker preview opens the QR popup", async ({ page }) => {
  const state = newState({ role: "admin" });
  state.tags = [{ qr_id: "NIAH-0001", status: "unused", batch_label: "2026-11-A", created_at: "2026-11-01T00:00:00Z" }];
  await open(page, state, "#/tags");
  await expect(page.getByRole("button", { name: "Open QR code for NIAH-0001" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^QR$/ })).toHaveCount(0);
});
