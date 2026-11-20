// apps/web/tests/plant-photo-edit.spec.js
// RBAC.md: an officer edits the caption of, or removes, a tagged plant's photo,
// and it is saved through the API (it used to change only this browser's copy).
// The editor has no upload and no reordering for a plant: photos are added on
// a visit. The API is mocked in the browser.
import { test, expect } from "@playwright/test";
import { newState, open, photo, specimen } from "./helpers/mockApi.js";

const json = (body, status = 200) => ({ status, contentType: "application/json", body: body === undefined ? "" : JSON.stringify(body) });

async function photoRoutes(page, state) {
  state.photoCalls = [];
  await page.route(/\/v1\/observations\/[^/]+\/photos\/[^/]+$/, async (route) => {
    const req = route.request();
    const [, obsId, photoId] = new URL(req.url()).pathname.match(/\/observations\/([^/]+)\/photos\/([^/]+)$/);
    if (req.method() === "PATCH") {
      const { caption } = req.postDataJSON();
      state.photoCalls.push(`PATCH ${photoId} ${caption}`);
      state.photos = state.photos.map((p) => (p.id === photoId ? { ...p, caption } : p));
      return route.fulfill(json(state.photos.find((p) => p.id === photoId)));
    }
    if (req.method() === "DELETE") {
      state.photoCalls.push(`DELETE ${photoId}`);
      state.photos = state.photos.filter((p) => !(p.id === photoId && p.observation_id === obsId));
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fallback();
  });
}

test("officer: change a photo's caption and remove another, both saved through the API", async ({ page }) => {
  const second = { ...photo(1), id: "cccccccc-0000-4000-8000-000000000009", s3_key: "k9" };
  const state = newState({ role: "officer", photos: [photo(1), second] });
  await open(page, state, `#/tag/${specimen(1).qr_id}`);
  await photoRoutes(page, state);

  await page.getByRole("button", { name: "Edit photos" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Edit captions or remove photos");
  await expect(dialog.getByText("Upload photos")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Move earlier" })).toHaveCount(0);

  await dialog.getByLabel("Caption for photo 1").fill("Leaf, new growth");
  await dialog.getByRole("button", { name: "Remove photo" }).nth(1).click();
  await dialog.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Photos saved")).toBeVisible();
  expect(state.photoCalls).toEqual([`PATCH ${photo(1).id} Leaf, new growth`, `DELETE ${second.id}`]);
  expect(state.photos).toHaveLength(1);
});

test("admin: no Edit photos button on a tagged plant", async ({ page }) => {
  const state = newState({ role: "admin" });
  await open(page, state, `#/tag/${specimen(1).qr_id}`);
  await expect(page.locator("h1.tagid")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit photos" })).toHaveCount(0);
});
