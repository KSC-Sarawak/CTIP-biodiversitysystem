// apps/web/tests/rbac-email.spec.js
// RBAC D14: an admin corrects an email with a confirmation link to the new
// address. The API is mocked, so this never touches the live database.
import { test, expect } from "@playwright/test";
import { newState, open, BOTANIST } from "./helpers/mockApi.js";

test("admin: Correct email sends a link and says the email changes only when it is clicked", async ({ page }) => {
  const state = newState({ role: "admin" });
  await open(page, state, "#/users");
  // After open(): the newest route wins over the general mock.
  await page.route(`**/v1/profiles/${BOTANIST}/email`, (route) => {
    state.writes.push({ path: "email", body: route.request().postDataJSON() });
    return route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ user_id: BOTANIST, pending_email: "new@example.com", expires_at: "2026-11-21T00:00:00Z" }) });
  });
  await page.getByRole("button", { name: "Correct email" }).first().click();
  const box = page.getByLabel(/Correct email for/);
  await box.fill("new@example.com");
  await page.getByRole("button", { name: "Send link" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Send link" }).click();
  await expect(page.getByText(/Confirmation link sent to new@example.com/)).toBeVisible();
  expect(state.writes.find((w) => w.path === "email").body).toEqual({ email: "new@example.com" });
});

test("the link from the email confirms the change on the sign-in page", async ({ page }) => {
  // A token whose user_metadata marks it as an email correction.
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const token = `${b64({ alg: "HS256" })}.${b64({ sub: "p1", exp: 4102444800, user_metadata: { email_change_request: "11111111-1111-4111-8111-111111111111" } })}.sig`;
  let sent;
  await page.route("**/v1/auth/email-change/confirm", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ email: "new@example.com" }) });
  });
  const empty = Object.fromEntries(["species", "species_media", "qr_tags", "specimens", "observations", "observation_photos", "observation_reviews",
    "observation_comments", "alerts", "alert_notes", "sensor_nodes", "notifications", "audit_logs", "profiles", "zones"].map((k) => [k, []]));
  await page.route("**/v1/public/workspace", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(empty) }));
  await page.goto(`/#access_token=${token}&expires_at=4102444800&refresh_token=r&token_type=bearer&type=invite`);
  await expect(page.getByText("Your email is now")).toBeVisible();
  await expect(page.getByText("new@example.com")).toBeVisible();
  expect(sent).toEqual({ access_token: token });
  expect(page.url()).toContain("#/login?emailchange=1");
});
