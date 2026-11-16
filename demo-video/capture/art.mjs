// Stylised botanical illustrations used as sample "photos" in the demo video.
// Pure SVG, drawn in code, so there is nothing to license. Swap in real photos if you have them.

function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function backdrop(r, tone = "forest") {
  const tones = {
    forest: ["#0f3d24", "#1f6b3a", "#8fce6e"],
    dusk: ["#12332f", "#1d5c57", "#7fd0c0"],
    floor: ["#2a2415", "#4a4420", "#a5b060"],
    mist: ["#1a4035", "#3b7d5c", "#c9e8a5"],
  };
  const [a, b, c] = tones[tone];
  let bokeh = "";
  for (let i = 0; i < 26; i++) {
    const x = r() * 800, y = r() * 600, rad = 18 + r() * 70;
    bokeh += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${rad.toFixed(0)}" fill="${r() > 0.5 ? c : b}" opacity="${(0.06 + r() * 0.16).toFixed(2)}"/>`;
  }
  let blades = "";
  for (let i = 0; i < 9; i++) {
    const x = r() * 800, h = 200 + r() * 320, w = 40 + r() * 60, lean = (r() - 0.5) * 220;
    blades += `<path d="M${x} 640 Q${x + lean * 0.4 - w} ${640 - h * 0.6} ${x + lean} ${640 - h} Q${x + lean * 0.4 + w} ${640 - h * 0.6} ${x} 640Z" fill="${a}" opacity="${(0.35 + r() * 0.3).toFixed(2)}"/>`;
  }
  return `<defs><linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient>
  <radialGradient id="sun" cx="0.75" cy="0.1" r="0.8"><stop offset="0" stop-color="#fff7c2" stop-opacity="0.55"/><stop offset="1" stop-color="#fff7c2" stop-opacity="0"/></radialGradient>
  <filter id="blur"><feGaussianBlur stdDeviation="7"/></filter>
  <radialGradient id="vig" cx="0.5" cy="0.5" r="0.75"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></radialGradient></defs>
  <rect width="800" height="600" fill="url(#bg)"/><g filter="url(#blur)">${bokeh}${blades}</g><rect width="800" height="600" fill="url(#sun)"/>`;
}

const leaf = (x, y, len, wid, rot, fill, vein = "#ffffff") =>
  `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M0 0 C${wid} ${-len * 0.25} ${wid} ${-len * 0.75} 0 ${-len} C${-wid} ${-len * 0.75} ${-wid} ${-len * 0.25} 0 0Z" fill="${fill}"/><path d="M0 0 L0 ${-len * 0.95}" stroke="${vein}" stroke-opacity="0.35" stroke-width="3" fill="none"/>${[0.25, 0.45, 0.65].map((t) => `<path d="M0 ${-len * t} L${wid * 0.62} ${-len * (t + 0.14)} M0 ${-len * t} L${-wid * 0.62} ${-len * (t + 0.14)}" stroke="${vein}" stroke-opacity="0.22" stroke-width="2"/>`).join("")}</g>`;

const subjects = {
  pitcher(r) {
    const hue = ["#b8433a", "#c9632e", "#8f3f5a"][Math.floor(r() * 3)];
    return `${leaf(250, 560, 330, 60, -38, "#2f8a45")}${leaf(560, 580, 360, 64, 30, "#3c9a50")}${leaf(400, 600, 300, 50, 4, "#277a3c")}
    <path d="M300 120 C340 60 430 60 450 150" stroke="#7fbf5a" stroke-width="9" fill="none" stroke-linecap="round"/>
    <path d="M360 190 C330 300 350 430 410 470 C480 440 500 300 470 190Z" fill="${hue}"/>
    <path d="M372 200 C350 300 366 410 410 448" stroke="#fff" stroke-opacity="0.25" stroke-width="12" fill="none" stroke-linecap="round"/>
    ${Array.from({ length: 14 }, () => `<circle cx="${380 + r() * 80}" cy="${230 + r() * 200}" r="${4 + r() * 7}" fill="#5b1f22" opacity="0.5"/>`).join("")}
    <ellipse cx="415" cy="190" rx="58" ry="18" fill="#e9d27a"/><ellipse cx="415" cy="190" rx="42" ry="10" fill="#3a1418"/>
    <path d="M448 178 C500 120 470 90 420 120 C400 140 420 170 448 178Z" fill="${hue}" stroke="#e9d27a" stroke-width="4"/>`;
  },
  orchid(r) {
    const pet = ["#f3d9f0", "#f7e08a", "#f0b7c9"][Math.floor(r() * 3)], lip = ["#b83280", "#c46a1d", "#8d2a5e"][Math.floor(r() * 3)];
    const flower = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-48" rx="24" ry="52" fill="${pet}" transform="rotate(${a})"/><path d="M0 -10 L0 -90" stroke="${lip}" stroke-opacity="0.25" stroke-width="3" transform="rotate(${a})"/>`).join("")}<path d="M-22 0 C-26 40 26 40 22 0 C10 -14 -10 -14 -22 0Z" fill="${lip}"/><circle r="9" fill="#ffe680"/></g>`;
    return `${leaf(330, 600, 280, 46, -24, "#2f8a45")}${leaf(470, 600, 300, 48, 20, "#3c9a50")}
    <path d="M400 600 C390 420 430 300 520 150" stroke="#6aa84f" stroke-width="10" fill="none" stroke-linecap="round"/>
    ${flower(500, 190, 1.25)}${flower(370, 300, 1.05)}${flower(545, 360, 0.8)}`;
  },
  fern(r) {
    let out = "";
    for (let i = 0; i < 7; i++) {
      const ang = -72 + i * 24 + (r() - 0.5) * 8, len = 330 + r() * 90, g = ["#2f8a45", "#3fa055", "#55b565"][i % 3];
      let pin = "";
      for (let k = 1; k < 13; k++) {
        const t = k / 13, w = 62 * (1 - t) + 12;
        pin += `<ellipse cx="${w / 2 + 3}" cy="${-len * t}" rx="${w / 2}" ry="9" fill="${g}" transform="rotate(-18 0 ${-len * t})"/><ellipse cx="${-w / 2 - 3}" cy="${-len * t}" rx="${w / 2}" ry="9" fill="${g}" transform="rotate(18 0 ${-len * t})"/>`;
      }
      out += `<g transform="translate(400 590) rotate(${ang})"><path d="M0 0 L0 ${-len}" stroke="#1f5c30" stroke-width="6" stroke-linecap="round"/>${pin}</g>`;
    }
    return out;
  },
  rafflesia(r) {
    let lobes = "";
    for (let i = 0; i < 5; i++) {
      let spots = "";
      for (let k = 0; k < 16; k++) spots += `<ellipse cx="${(r() - 0.5) * 120}" cy="${-110 - r() * 120}" rx="${6 + r() * 12}" ry="${4 + r() * 8}" fill="#f7d9c4" opacity="0.8"/>`;
      lobes += `<g transform="translate(400 320) rotate(${i * 72 + 10})"><path d="M-95 -70 C-130 -200 -60 -270 0 -270 C60 -270 130 -200 95 -70Z" fill="#b5321f"/>${spots}</g>`;
    }
    return `<ellipse cx="400" cy="520" rx="330" ry="50" fill="#1a1408" opacity="0.5"/>${lobes}<circle cx="400" cy="320" r="112" fill="#8c2414"/><circle cx="400" cy="320" r="82" fill="#3d0f0a"/>${Array.from({ length: 12 }, (_, i) => `<circle cx="${400 + Math.cos(i * 0.52) * 44}" cy="${320 + Math.sin(i * 0.52) * 44}" r="7" fill="#c9553a"/>`).join("")}<circle cx="400" cy="320" r="112" fill="none" stroke="#e9a184" stroke-width="5" opacity="0.6"/>`;
  },
  tree(r) {
    let canopy = "";
    for (let i = 0; i < 22; i++) canopy += `<circle cx="${220 + r() * 360}" cy="${40 + r() * 190}" r="${50 + r() * 60}" fill="${["#2f8a45", "#3c9a50", "#256e38", "#58b064"][i % 4]}" opacity="0.92"/>`;
    return `<path d="M350 600 C365 420 372 300 368 120 L432 120 C428 300 440 420 470 600Z" fill="#6b4a33"/>
    <path d="M350 600 C330 560 300 560 270 600Z M470 600 C490 555 520 560 545 600Z" fill="#5b3d2a"/>
    ${Array.from({ length: 9 }, () => `<path d="M${375 + r() * 40} ${180 + r() * 380} v${20 + r() * 50}" stroke="#3f2a1c" stroke-width="4" opacity="0.6"/>`).join("")}
    <path d="M385 140 C386 300 392 440 398 590" stroke="#fff" stroke-opacity="0.12" stroke-width="14" fill="none"/>${canopy}`;
  },
  palm() {
    let ribs = "";
    for (let i = 0; i < 19; i++) ribs += `<path d="M0 0 L0 -250" stroke="#1f5c30" stroke-width="4" opacity="0.7" transform="rotate(${-108 + i * 12})"/>`;
    return `<path d="M400 600 C395 520 400 460 400 400" stroke="#4f8a45" stroke-width="12" fill="none"/><g transform="translate(400 360)"><circle r="252" fill="#3c9a50"/><path d="M0 0 L-180 190 L180 190Z" fill="#1f6b3a" opacity="0"/><circle r="252" fill="none" stroke="#2f8a45" stroke-width="10" stroke-dasharray="26 14"/>${ribs}<circle r="20" fill="#256e38"/></g><path d="M250 610 L400 380 L550 610Z" fill="#17402a" opacity="0.55" filter="url(#blur)"/>`;
  },
  ginger() {
    let bracts = "";
    for (let row = 0; row < 7; row++) for (let i = 0; i < 9 - row; i++) {
      const w = 150 - row * 16, x = 400 + (i - (8 - row) / 2) * (w / (9 - row)) * 1.7, y = 330 - row * 34;
      bracts += `<path d="M${x - 24} ${y} C${x - 20} ${y - 50} ${x + 20} ${y - 50} ${x + 24} ${y} C${x + 10} ${y + 14} ${x - 10} ${y + 14} ${x - 24} ${y}Z" fill="${row % 2 ? "#e2456b" : "#f0668a"}" stroke="#fbd0da" stroke-width="2.5"/>`;
    }
    return `${leaf(240, 600, 420, 62, -20, "#2f8a45")}${leaf(590, 600, 440, 66, 18, "#3c9a50")}<path d="M400 600 L400 330" stroke="#5c9a4a" stroke-width="16" stroke-linecap="round"/>${bracts}`;
  },
  leafy(r) {
    const g = ["#2f8a45", "#3c9a50", "#55b565", "#256e38"];
    return `${leaf(400, 620, 520, 150, -6, g[0])}${leaf(230, 620, 380, 100, -42, g[1])}${leaf(590, 620, 400, 104, 40, g[2])}${Array.from({ length: 7 }, () => `<circle cx="${330 + r() * 150}" cy="${180 + r() * 300}" r="${3 + r() * 5}" fill="#fff" opacity="0.5"/>`).join("")}`;
  },
  flowerTree(r) {
    let fl = "";
    for (let i = 0; i < 16; i++) { const x = 180 + r() * 440, y = 120 + r() * 300; fl += `<g transform="translate(${x} ${y}) rotate(${r() * 90})">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-17" rx="8" ry="18" fill="#fff4d6" transform="rotate(${a})"/>`).join("")}<circle r="5" fill="#f2b441"/></g>`; }
    return `<path d="M120 600 C260 420 380 300 700 110" stroke="#6b4a33" stroke-width="22" fill="none" stroke-linecap="round"/><path d="M400 330 C450 380 520 400 620 400" stroke="#6b4a33" stroke-width="12" fill="none" stroke-linecap="round"/>${leaf(300, 420, 150, 46, -70, "#2f8a45")}${leaf(470, 290, 160, 48, 20, "#3c9a50")}${leaf(560, 400, 150, 44, 120, "#256e38")}${leaf(250, 470, 140, 40, 150, "#3c9a50")}${fl}`;
  },
};

export function plantSvg(kind, seed = 1, tone) {
  const r = rng(seed);
  const tones = ["forest", "dusk", "mist", "floor"];
  const bg = backdrop(r, tone || (kind === "rafflesia" ? "floor" : tones[seed % 3]));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600" preserveAspectRatio="xMidYMid slice">${bg}${subjects[kind](r)}<rect width="800" height="600" fill="url(#vig)"/></svg>`;
}

// A night-vision frame from the sensor node's camera: something moving near the tagged plant.
export function camSvg(stamp = "2026-11-16 02:14:07") {
  const r = rng(77);
  let noise = "";
  for (let i = 0; i < 260; i++) noise += `<rect x="${(r() * 800).toFixed(0)}" y="${(r() * 600).toFixed(0)}" width="2" height="2" fill="#d6ffd9" opacity="${(r() * 0.25).toFixed(2)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600"><defs><radialGradient id="ir" cx="0.5" cy="0.55" r="0.6"><stop offset="0" stop-color="#9fe8a8"/><stop offset="0.6" stop-color="#2f6b3d"/><stop offset="1" stop-color="#0a1c10"/></radialGradient></defs>
  <rect width="800" height="600" fill="url(#ir)"/>
  <path d="M0 470 Q400 420 800 480 V600 H0Z" fill="#173d22"/>
  ${leaf(180, 520, 300, 60, -20, "#0d2414", "#9fe8a8")}${leaf(250, 530, 260, 50, 12, "#11301b", "#9fe8a8")}${leaf(120, 540, 220, 44, -48, "#0d2414", "#9fe8a8")}
  <g fill="#0a1c10"><ellipse cx="560" cy="250" rx="34" ry="40"/><path d="M505 300 C520 270 600 270 618 300 L640 480 L590 480 L575 380 L550 380 L535 480 L486 480Z"/><path d="M512 310 L440 400 L458 414 L530 340Z"/></g>
  <circle cx="548" cy="246" r="5" fill="#eaffea"/><circle cx="570" cy="246" r="5" fill="#eaffea"/>
  ${noise}
  <rect x="436" y="196" width="230" height="300" fill="none" stroke="#f2907b" stroke-width="4" stroke-dasharray="14 8"/>
  <text x="440" y="186" font-family="monospace" font-size="20" fill="#f2907b">MOTION</text>
  <text x="24" y="40" font-family="monospace" font-size="22" fill="#eaffea">NODE-02 · IR CAM</text><text x="24" y="578" font-family="monospace" font-size="22" fill="#eaffea">${stamp}</text><circle cx="760" cy="34" r="9" fill="#f2907b"/></svg>`;
}

export const dataUrl = (svg) => "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
