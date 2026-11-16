// apps/web/tests/password-reset.spec.js
// Opening a password-reset link and choosing a new password. The link's session
// has no 6-digit code yet (aal1), so the API refuses it everywhere except
// POST /me/password. Before the fix the start-up load was refused, the app
// signed the session out, and Save answered "Enter your email".
import { test, expect } from "@playwright/test";
import { jwt, mockApi, newState } from "./helpers/mockApi.js";

const LINK = jwt("officer"); // the reset link's access token
const AAL2 = jwt("admin"); // a different token, for the session after the 6-digit code

async function openResetLink(page, { hasApp }) {
  const seen = [];
  await page.route(/(tile\.openstreetmap|arcgisonline|opentopomap)/, (r) => r.abort());
  await mockApi(page, newState());
  // Registered last, so it answers first; anything else falls back to mockApi.
  await page.route("**/v1/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/v1/, "");
    const token = (req.headers().authorization || "").replace(/^Bearer /, "");
    const json = (status, data) => route.fulfill({ status, contentType: "application/json", body: data === undefined ? "" : JSON.stringify(data) });
    if (token === LINK && path === "/workspace") return json(403, { code: "MFA_REQUIRED", message: "Sign in again and enter the 6-digit code." });
    if (path === "/me/password") {
      seen.push({ path, token, body: req.postDataJSON() });
      if (hasApp && token === LINK) return json(403, { code: "MFA_CODE_NEEDED", message: "Enter the 6-digit code from your authenticator app to save your new password." });
      return json(204);
    }
    if (path === "/auth/mfa/verify") {
      seen.push({ path, token, body: req.postDataJSON() });
      return json(200, { access_token: AAL2, refresh_token: "r2", expires_in: 3600, user: { id: "x", email: "officer@example.com" } });
    }
    if (path === "/auth/sign-out") {
      seen.push({ path, token });
      return json(204);
    }
    return route.fallback();
  });
  await page.goto(`/#access_token=${LINK}&refresh_token=r&expires_at=${Math.floor(Date.now() / 1000) + 3600}&type=recovery`);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  return seen;
}

test("reset link: the new password is saved with the link's session, then sign in again", async ({ page }) => {
  const seen = await openResetLink(page, { hasApp: false });
  await page.getByLabel("New password").fill("forest-2026!");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("heading", { name: "Staff sign in" })).toBeVisible();
  await expect(page.getByText("Password changed. Sign in with your new password.")).toBeVisible();
  await expect(page.getByText("Enter your email")).toHaveCount(0);
  const saved = seen.find((s) => s.path === "/me/password");
  expect(saved).toMatchObject({ token: LINK, body: { new_password: "forest-2026!" } });
  expect(seen.some((s) => s.path === "/auth/sign-out")).toBe(true); // the link's session is closed
});

test("reset link with an authenticator app: asks for the 6-digit code, then saves", async ({ page }) => {
  const seen = await openResetLink(page, { hasApp: true });
  await page.getByLabel("New password").fill("forest-2026!");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("Enter the 6-digit code from your authenticator app to save your new password.")).toBeVisible();
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("heading", { name: "Staff sign in" })).toBeVisible();
  expect(seen.find((s) => s.path === "/auth/mfa/verify")).toMatchObject({ token: LINK, body: { code: "123456" } });
  expect(seen.filter((s) => s.path === "/me/password").at(-1)).toMatchObject({ token: AAL2 });
});
