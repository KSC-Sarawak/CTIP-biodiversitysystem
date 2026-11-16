// Opens the real web portal (Vite dev server on :5173) against the sample data, with no live API.
import { createRequire } from "module";
import { mockApi, newState, jwt } from "../../apps/web/tests/helpers/mockApi.js";
import * as fx from "./fixture.mjs";
export const { chromium } = createRequire(import.meta.url)("playwright");

// Stylised terrain tiles drawn in SVG (the real tile servers are not reachable from the build machine).
// The noise is a function of world position, so neighbouring tiles join up.
const h2 = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
const sm = (t) => t * t * (3 - 2 * t);
function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi); const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1); return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf; }
const fbm = (x, y) => vnoise(x, y) * 0.55 + vnoise(x * 2.1 + 9, y * 2.1 + 4) * 0.3 + vnoise(x * 4.3 + 3, y * 4.3 + 8) * 0.15;
const RIVER = [[3.782, 113.796], [3.789, 113.789], [3.7925, 113.781], [3.7975, 113.7765], [3.7995, 113.770], [3.805, 113.766], [3.808, 113.758], [3.815, 113.752], [3.822, 113.749]];
const TRAIL = [[3.7995, 113.770], [3.8015, 113.7725], [3.8040, 113.7735], [3.8065, 113.7700], [3.8085, 113.7665], [3.8115, 113.7625], [3.8135, 113.7600]];
const TRAIL2 = [[3.8015, 113.7725], [3.7990, 113.7770], [3.7965, 113.7800], [3.7950, 113.7835]];
function tile(url, dark) {
  const m = url.match(/\/(\d+)\/(\d+)\/(\d+)(?:\.\w+)?(?:\?.*)?$/);
  const [z, a, b] = m ? m.slice(1).map(Number) : [15, 0, 0];
  const yx = /arcgis/.test(url); const x = yx ? b : a, y = yx ? a : b;
  const pal = dark ? ["#0e281b", "#113020", "#153826", "#19412c", "#1e4b33", "#235539"] : ["#cfe2c1", "#d7e8ca", "#deecd3", "#e5f0db", "#ecf4e4", "#f2f8ec"];
  const N = 128, c = 256 / N, k = Math.pow(2, 15 - z) / 190;
  let rects = "";
  for (let j = 0; j < N; j++) {
    let run = -1, start = 0;
    for (let i = 0; i <= N; i++) {
      const band = i === N ? -2 : Math.min(pal.length - 1, Math.floor(fbm((x * 256 + i * c) * k, (y * 256 + j * c) * k) * 1.35 * pal.length - 1.1 < 0 ? 0 : fbm((x * 256 + i * c) * k, (y * 256 + j * c) * k) * 1.35 * pal.length - 1.1));
      if (band !== run) { if (run >= 1) rects += `<rect x="${start * c}" y="${j * c}" width="${(i - start) * c}" height="${c + 0.3}" fill="${pal[run]}"/>`; run = band; start = i; }
    }
  }
  const px = ([lat, lng]) => { const n = 256 * Math.pow(2, z); const wx = ((lng + 180) / 360) * n, r = (lat * Math.PI) / 180; const wy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n; return `${(wx - x * 256).toFixed(1)},${(wy - y * 256).toFixed(1)}`; };
  const line = (pts, col, w, dash = "") => `<polyline points="${pts.map(px).join(" ")}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;
  const zw = Math.pow(2, z - 15);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="${pal[0]}"/>${rects}${line(RIVER, dark ? "#1d5a66" : "#a9d3dc", 8 * zw)}${line(TRAIL, dark ? "#5d7d55" : "#b9a77c", 2.5 * zw, `${7 * zw} ${6 * zw}`)}${line(TRAIL2, dark ? "#5d7d55" : "#b9a77c", 2.5 * zw, `${7 * zw} ${6 * zw}`)}</svg>`;
}

export async function openPage(browser, { role = "officer", theme = "dark", width = 1920, height = 1080, scale = 1, hash = "#/" } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: theme, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(fx.NOW));
  const me = role === "admin" ? fx.PEOPLE.admin : role === "botanist" ? fx.PEOPLE.bot1 : fx.PEOPLE.officer;
  await page.addInitScript(([session, theme]) => {
    window.localStorage.setItem("daun-theme", theme);
    if (session) window.localStorage.setItem("daun_session", JSON.stringify(session));
  }, [role === "visitor" ? null : { access_token: jwt(role).replace(/^h\.[^.]+/, "h." + Buffer.from(JSON.stringify({ sub: me.id, email: me.email, user_role: role, exp: Math.floor(fx.NOW / 1000) + 86400 })).toString("base64").replace(/=+$/, "")), refresh_token: "r", expires_at: Math.floor(fx.NOW / 1000) + 86400, user: { id: me.id, email: me.email } }, theme]);
  const state = newState({ role, species: fx.species, specimens: fx.specimens, observations: fx.observations, photos: fx.observation_photos, tags: fx.qr_tags, sensorNodes: fx.sensor_nodes, telemetry: fx.telemetry, alerts: fx.alerts, stableRanges: fx.sensor_stable_ranges, sensorImages: fx.sensor_images, staffSpecies: fx.species, audit: fx.audit_logs });
  await mockApi(page, state);
  await page.route("**/v1/**", async (route) => {
    const req = route.request(), path = new URL(req.url()).pathname.replace(/^\/v1/, "");
    const json = (d) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(d) });
    if (/\/reviews$/.test(path) && req.method() === "POST") { const o = fx.observations.find((x) => x.id === path.split("/")[2]); const b = req.postDataJSON() || {}; if (o) { o.status = "approved"; const sp = fx.specimens.find((x) => x.id === o.specimen_id); if (b.species_id) sp.species_id = b.species_id; } return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true, status: "approved" }) }); }
    if (/^\/specimens\/[^/]+$/.test(path) && req.method() === "PATCH") { const sp = fx.specimens.find((x) => x.id === path.split("/")[2]); Object.assign(sp, req.postDataJSON() || {}); return json(sp); }
    if (path === "/workspace") return json(fx.workspace(role));
    if (path === "/public/workspace") return json(fx.publicWorkspace());
    if (path === "/me") return json(me);
    if (path === "/health" || path === "/healthz") return json({ ok: true, status: "ok" });
    if (path === "/distribution") return route.fulfill({ status: 404, contentType: "application/json", body: "{}" }); // the map then uses the workspace plants
    return route.fallback();
  });
  await page.route(/(tile\.openstreetmap|arcgisonline|opentopomap)/, (r) => r.fulfill({ headers: { "access-control-allow-origin": "*" }, contentType: "image/svg+xml", body: tile(r.request().url(), theme === "dark") }));
  page.on("pageerror", (e) => console.log("PAGEERROR", hash, e.message.slice(0, 200)));
  await page.goto("http://localhost:5173/" + hash);
  await page.addStyleTag({ content: ".leaflet-tile{opacity:1!important} *{caret-color:transparent!important}" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(700);
  return { page, ctx, state };
}
export { fx };
