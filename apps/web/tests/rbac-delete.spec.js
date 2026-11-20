// apps/web/tests/rbac-delete.spec.js
// RBAC.md D4: only officers delete and restore tagged plants (soft delete).
// An officer deletes a plant from its page, finds it under "Deleted plants" on
// Tagged plants and restores it. Botanists and admins see no delete button.
// The API is mocked in the browser.
import { test, expect } from "@playwright/test";
import { newState, open, specimen } from "./helpers/mockApi.js";

const json = (body, status = 200) => ({ status, contentType: "application/json", body: body === undefined ? "" : JSON.stringify(body) });

// The delete and restore calls, answered like the API (DELETE 204, restore 200).
async function deleteRoutes(page, state) {
  state.deleteCalls = [];
  await page.route(/\/v1\/specimens\/[^/]+(\/restore)?$/, async (route) => {
    const req = route.request();
    const [, id, restore] = new URL(req.url()).pathname.match(/\/specimens\/([^/]+)(\/restore)?$/);
    if (req.method() === "DELETE" || (req.method() === "POST" && restore)) {
      state.deleteCalls.push(`${req.method()} ${id}${restore || ""}`);
      state.specimens = state.specimens.map((s) => (s.id === id ? { ...s, is_deleted: !restore } : s));
      return route.fulfill(restore ? json(state.specimens.find((s) => s.id === id)) : { status: 204, body: "" });
    }
    return route.fallback();
  });
}

test("officer: delete a plant, then restore it from Tagged plants", async ({ page }) => {
  const state = newState({ role: "officer" });
  await open(page, state, `#/tag/${specimen(1).qr_id}`);
  await deleteRoutes(page, state);

  await page.getByRole("button", { name: "Delete plant" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("NIAH-0001");
  await dialog.getByRole("textbox").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete plant" }).click();

  await expect(page).toHaveURL(/#\/dashboard\/all$/);
  expect(state.deleteCalls).toEqual([`DELETE ${specimen(1).id}`]);
  const deleted = page.locator("section.deletedplants");
  await expect(deleted).toContainText("Deleted plants");
  await expect(deleted).toContainText("NIAH-0001");

  await deleted.getByRole("button", { name: "Restore" }).click();
  await expect(deleted).toContainText("No deleted plants.");
  expect(state.deleteCalls).toEqual([`DELETE ${specimen(1).id}`, `POST ${specimen(1).id}/restore`]);
});

for (const role of ["botanist", "admin"]) {
  test(`${role}: no delete button and no Deleted plants list`, async ({ page }) => {
    const state = newState({ role, specimens: [specimen(1), specimen(2, { is_deleted: true })] });
    await open(page, state, `#/tag/${specimen(1).qr_id}`);
    await expect(page.locator("h1.tagid")).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete plant" })).toHaveCount(0);
    await page.goto("/#/dashboard/all");
    await expect(page.locator("section.tablemain")).toBeVisible();
    await expect(page.locator("section.deletedplants")).toHaveCount(0);
  });
}
