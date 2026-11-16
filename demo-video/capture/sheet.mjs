// Contact sheet of PNGs: node sheet.mjs out.png cols cellW cropH file...
import { chromium } from "./harness.mjs"; import fs from "fs";
const [out, cols, w, crop, ...files] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: cols * w, height: 100 } });
await p.setContent(`<body style="margin:0;background:#333;display:grid;grid-template-columns:repeat(${cols},${w}px);gap:2px;font:12px sans-serif;color:#fff">${files.map((f) => `<div style="height:${crop}px;overflow:hidden;position:relative"><img style="width:100%" src="data:image/png;base64,${fs.readFileSync(f).toString("base64")}"><b style="position:absolute;left:0;top:0;background:#000">${f.split("/").pop()}</b></div>`).join("")}</body>`);
await p.screenshot({ path: out, fullPage: true }); await b.close();
