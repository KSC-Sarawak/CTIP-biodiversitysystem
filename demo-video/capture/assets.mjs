// Writes the illustrations the mobile scenes use into public/.
import fs from "fs"; import { createRequire } from "module";
import { plantSvg, camSvg } from "./art.mjs";
const QR = createRequire(import.meta.url)("qrcode");
const out = new URL("../public/", import.meta.url).pathname; fs.mkdirSync(out + "plants", { recursive: true });
const P = { pitcher1: ["pitcher", 37, "forest"], pitcher2: ["pitcher", 62, "dusk"], leaf1: ["leafy", 44, "mist"], pitcher3: ["pitcher", 11, "mist"], orchid: ["orchid", 5], fern: ["fern", 9], rafflesia: ["rafflesia", 4], tree: ["tree", 7], palm: ["palm", 8], ginger: ["ginger", 12], flower: ["flowerTree", 14], forest: ["fern", 21, "dusk"] };
for (const [k, [kind, seed, tone]] of Object.entries(P)) fs.writeFileSync(`${out}plants/${k}.svg`, plantSvg(kind, seed, tone));
fs.writeFileSync(out + "plants/cam.svg", camSvg());
fs.writeFileSync(out + "qr.svg", await QR.toString("https://daunsense.example/#/tag/NIAH-0018", { type: "svg", margin: 1, errorCorrectionLevel: "M" }));
console.log("assets ok");
