import { chromium, openPage } from "./harness.mjs";
import fs from "fs";
const out = process.argv[2] || "/tmp/claude-0/tour"; fs.mkdirSync(out, { recursive: true });
const theme = process.argv[3] || "dark";
const only = process.argv[4];
const T = [["visitor","#/","home"],["visitor","#/plants","catalogue"],["visitor","#/map","map"],["visitor","#/book","book"],["visitor","#/tag/NIAH-0001","tag"],["visitor","#/login","login"],
 ["officer","#/dashboard","o-dash"],["officer","#/review","o-review"],["officer","#/monitoring","o-mon"],["officer","#/species","o-species"],["officer","#/tags","o-tags"],["officer","#/reports","o-reports"],["officer","#/notifications","o-notif"],["officer","#/discussion","o-disc"],["officer","#/map","o-map"],
 ["admin","#/dashboard","a-dash"],["admin","#/users","a-users"],["admin","#/audit","a-audit"],["admin","#/nodes","a-nodes"],["botanist","#/dashboard","b-dash"],["botanist","#/records","b-records"],["botanist","#/add","b-add"]];
const b = await chromium.launch();
for (const [role, hash, name] of T) {
  if (only && !name.includes(only)) continue;
  const { page, ctx } = await openPage(b, { role, hash, theme });
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  console.log(name, await page.evaluate(() => document.documentElement.scrollHeight));
  await ctx.close();
}
await b.close();
