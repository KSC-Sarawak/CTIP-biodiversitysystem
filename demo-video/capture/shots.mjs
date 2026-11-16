// Captures the web-portal stills the video animates. Run with the Vite dev server up: node capture/shots.mjs
import { chromium, openPage, fx } from "./harness.mjs";
import fs from "fs";
const out = new URL("../public/web/", import.meta.url).pathname; fs.mkdirSync(out, { recursive: true });
const W = 1440, H = 810, meta = {};
const b = await chromium.launch();
const only = process.argv[2];
async function shot(name, opts, fn) {
  if (only && !name.startsWith(only)) return;
  const { page, ctx } = await openPage(b, { width: W, height: H, scale: 2, ...opts });
  const snap = async (suffix = "", full = false) => {
    const key = name + suffix;
    if (full) { const h = await page.evaluate(() => document.documentElement.scrollHeight); await page.setViewportSize({ width: W, height: h }); await page.waitForTimeout(500); }
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${out}${key}.png` });
    if (full) { await page.setViewportSize({ width: W, height: H }); await page.waitForTimeout(300); }
    meta[key] = { w: W, h: full ? await page.evaluate(() => document.documentElement.scrollHeight) : H, boxes: meta[key]?.boxes || {} };
    console.log(key, meta[key].h);
  };
  const box = async (key, label, loc) => {
    const el = typeof loc === "string" ? page.locator(loc).first() : loc.first();
    const bb = await el.boundingBox().catch(() => null);
    const sy = await page.evaluate(() => window.scrollY);
    (meta[key] ||= { boxes: {} }).boxes[label] = bb ? { x: Math.round(bb.x), y: Math.round(bb.y + sy), w: Math.round(bb.width), h: Math.round(bb.height) } : null;
    if (!bb) console.log("  !! no box", key, label);
  };
  const keep = JSON.stringify([fx.specimens, fx.observations]);
  try { await fn(page, snap, box); } catch (e) { console.log("FAIL", name, e.message.split("\n")[0]); await page.screenshot({ path: `/tmp/claude-0/fail-${name}.png` }); }
  const [a, o] = JSON.parse(keep); fx.specimens.splice(0, fx.specimens.length, ...a); fx.observations.splice(0, fx.observations.length, ...o);
  await ctx.close();
}

await shot("dash", { role: "officer", hash: "#/dashboard" }, async (p, snap, box) => {
  await box("dash", "review", p.getByRole("link", { name: /Review this record/ }));
  await box("dash", "headline", "h1");
  await snap();
});
await shot("review", { role: "officer", hash: "#/review" }, async (p, snap, box) => {
  await box("review", "photos", ".gallery, .photos, [class*=photo]");
  await box("review", "guess", p.getByRole("button", { name: /Use guess/ }));
  await box("review", "approve", p.getByRole("button", { name: /Approve/ }));
  await box("review", "stat", p.getByText("Needs review").first());
  await box("review", "minimap", ".leaflet-container");
  await snap("", true);
  await p.getByRole("button", { name: /Use guess/ }).click();
  await p.waitForTimeout(900);
  await box("review-2", "approve", p.getByRole("button", { name: /Approve/ }));
  await box("review-2", "select", "select >> nth=1");
  await snap("-2", true);
  await p.getByRole("button", { name: /Approve/ }).scrollIntoViewIfNeeded();
  await p.getByRole("button", { name: /Approve/ }).click();
  await p.waitForTimeout(600);
  await snap("-3");
  await p.keyboard.type("PUBLISH");
  await snap("-3b");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.scrollTo(0, 0));
  await snap("-4");
});
await shot("mon", { role: "officer", hash: "#/monitoring" }, async (p, snap, box) => {
  await p.getByText("NODE-02 · Gaharu slope").first().click();
  await p.waitForTimeout(800);
  await box("mon", "map", ".leaflet-container");
  await box("mon", "row", p.getByText("NODE-02 · Gaharu slope").first());
  await box("mon", "charts", p.getByText("Readings over time"));
  await box("mon", "photos", p.getByText("Latest photos"));
  await box("mon", "alert", ".alertcard");
  await box("mon", "ack", p.getByRole("button", { name: /Acknowledge/ }));
  await snap("", true);
});
await shot("species", { role: "officer", hash: "#/species" }, async (p, snap, box) => { await box("species", "add", p.getByRole("button", { name: /Add species/ })); await snap(); });
await shot("tags", { role: "officer", hash: "#/tags" }, async (p, snap, box) => {
  await box("tags", "create", p.getByRole("button", { name: /Create tags/ }));
  await box("tags", "print", p.getByRole("button", { name: /Print tags/ }));
  await snap();
  await p.locator(".qrthumb").first().click(); await p.waitForTimeout(500);
  await box("tags-2", "dialog", "[role=dialog], dialog, .modal");
  await snap("-2");
});
await shot("reports", { role: "officer", hash: "#/reports" }, async (p, snap, box) => {
  await box("reports", "csv", p.getByRole("button", { name: /Export CSV/ }));
  await box("reports", "table", "table");
  await snap("", true);
});
await shot("users", { role: "admin", hash: "#/users" }, async (p, snap) => snap());
await shot("audit", { role: "admin", hash: "#/audit" }, async (p, snap) => snap());
await shot("nodes", { role: "admin", hash: "#/nodes" }, async (p, snap) => snap());
await shot("login", { role: "visitor", hash: "#/login" }, async (p, snap) => snap());
for (const theme of ["light"]) {
  await shot("pub-home", { role: "visitor", hash: "#/", theme }, async (p, snap, box) => { await box("pub-home", "search", "input"); await snap(); });
  await shot("pub-cat", { role: "visitor", hash: "#/plants", theme }, async (p, snap) => snap("", true));
  await shot("pub-plant", { role: "visitor", hash: "#/tag/NIAH-0002", theme }, async (p, snap) => snap("", true));
  await shot("pub-species", { role: "visitor", hash: "#/plants/" + "33333333-0000-4000-8000-000000000005", theme }, async (p, snap) => snap("", true));
  await shot("pub-map", { role: "visitor", hash: "#/map", theme }, async (p, snap, box) => {
    await box("pub-map", "note", p.getByText(/endangered plants? (are|is) not/));
    await box("pub-map", "map", ".leaflet-container");
    await snap();
  });
}
await b.close();
fs.writeFileSync(new URL("../src/webMeta.json", import.meta.url).pathname, JSON.stringify(meta, null, 1));
