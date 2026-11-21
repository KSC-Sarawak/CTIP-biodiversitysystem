// apps/web/tests/rbac-retag.spec.js
// RBAC.md D13: only officers move a plant to a new QR tag, and only after
// marking the old tag retired or damaged. The API is mocked in the browser.
import { test, expect } from "@playwright/test";
import { newState, open, specimen } from "./helpers/mockApi.js";

const tag = (qr_id, status) => ({ qr_id, status, batch_label: "B1", created_by: null, created_at: "2026-10-30T08:00:00.000Z" });

test("officer: mark the old tag, then move the plant to an unused tag", async ({ page }) => {
  const state = newState({ role: "officer", tags: [tag("NIAH-0001", "assigned"), tag("NIAH-0100", "unassigned")] });
  await open(page, state, `#/tag/${specimen(1).qr_id}`);
  const calls = [];
  await page.route(/\/v1\/specimens\/[^/]+\/retag$/, async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    state.tags = state.tags.map((t) => (t.qr_id === "NIAH-0001" ? { ...t, status: body.old_tag } : t.qr_id === body.qr_id ? { ...t, status: "assigned" } : t));
    state.specimens = state.specimens.map((s) => ({ ...s, qr_id: body.qr_id }));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(state.specimens[0]) });
  });

  await page.getByRole("button", { name: "Move to a new tag" }).click();
  const dialog = page.getByRole("dialog", { name: "Move to a new tag" });
  const move = dialog.getByRole("button", { name: "Mark old tag and move" });
  await dialog.getByLabel(/New tag/).fill("NIAH-0100");
  await expect(move).toBeDisabled(); // the old tag must be marked first
  await dialog.getByLabel(/Damaged/).check();
  await move.click();

  expect(calls).toEqual([{ qr_id: "NIAH-0100", old_tag: "damaged" }]);
  await expect(page).toHaveURL(/#\/tag\/NIAH-0100$/);
  await expect(page.locator("h1.tagid")).toHaveText("NIAH-0100");
});

for (const role of ["botanist", "admin"]) {
  test(`${role}: no "Move to a new tag" button`, async ({ page }) => {
    const state = newState({ role });
    await open(page, state, `#/tag/${specimen(1).qr_id}`);
    await expect(page.locator("h1.tagid")).toBeVisible();
    await expect(page.getByRole("button", { name: "Move to a new tag" })).toHaveCount(0);
  });
}
