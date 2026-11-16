import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { Caption, Chapter, Icon, kf, pop, Sfx, tw } from "../lib";
import { Browser, Cursor, Layer, Ring } from "../frames";
import meta from "../webMeta.json";

const h = (k: string) => (meta as Record<string, { h: number }>)[k].h;
const L = (src: string, from: number): Layer => ({ src, from, h: h(src) });
const LAYERS: Layer[] = [L("dash", 0), L("review", 250), L("review-2", 394), L("review-3", 634), L("review-3b", 690), L("review-4", 722), L("species", 800), L("tags", 1010), L("tags-2", 1112), L("reports", 1220), L("mon", 1430), L("users", 1800), L("audit", 1904)];
// [frame, page x, page y, zoom]: what the browser is looking at.
const CAM = [
  [96, 720, 405, 1], [150, 620, 330, 1.45], [205, 620, 330, 1.45], [236, 690, 420, 1.3], [249, 690, 420, 1.3],
  [250, 720, 405, 1], [276, 720, 405, 1], [320, 1000, 600, 1.4], [352, 1000, 600, 1.4], [384, 1000, 800, 1.4], [450, 1000, 800, 1.4],
  [520, 1000, 1160, 1.3], [556, 1000, 1160, 1.3], [606, 900, 1700, 1.3], [633, 900, 1700, 1.3],
  [634, 720, 405, 1], [662, 720, 400, 1.5], [721, 720, 400, 1.5], [722, 720, 405, 1], [744, 850, 460, 1.3], [799, 850, 460, 1.3],
  [800, 720, 405, 1], [840, 720, 405, 1], [960, 900, 560, 1.3], [1009, 900, 560, 1.3],
  [1010, 720, 405, 1], [1060, 640, 520, 1.3], [1111, 640, 520, 1.3], [1112, 720, 405, 1.15], [1150, 720, 420, 1.5], [1219, 720, 420, 1.5],
  [1220, 720, 405, 1], [1250, 720, 405, 1], [1310, 800, 640, 1.3], [1350, 800, 640, 1.3], [1400, 800, 1800, 1.2], [1429, 800, 1900, 1.2],
  [1430, 720, 405, 1], [1470, 720, 405, 1], [1520, 850, 860, 1.25], [1560, 850, 860, 1.25], [1610, 850, 1220, 1.4], [1640, 850, 1220, 1.4], [1690, 900, 1800, 1.25], [1716, 900, 1800, 1.25], [1756, 640, 2590, 1.55], [1799, 640, 2590, 1.55],
  [1800, 720, 405, 1], [1830, 720, 405, 1], [1890, 800, 440, 1.2], [1903, 800, 440, 1.2], [1904, 720, 405, 1], [1930, 720, 405, 1], [2000, 800, 420, 1.25],
];
const URL: [number, string][] = [[0, "dashboard"], [250, "review"], [800, "species"], [1010, "tags"], [1220, "reports"], [1430, "monitoring"], [1800, "users"], [1904, "audit"]];

export const Web: React.FC = () => {
  const f = useCurrentFrame();
  const enter = tw(f, 66, 96), leave = tw(f, 1996, 2016, 0, 1, (n) => n * n);
  const url = [...URL].reverse().find(([a]) => f >= a)![1];
  const X = 80, Y = 230, W = 470;
  const push = tw(f, 1722, 1744) * (1 - tw(f, 1790, 1800));
  return (
    <AbsoluteFill>
      <Chapter n="PART 02" title="At the office" sub="The web portal for officers and admins" />
      <Sfx name="whoosh" at={62} v={0.5} /><Sfx name="click" at={236} v={0.6} /><Sfx name="whoosh" at={246} v={0.3} />
      <Sfx name="click" at={392} v={0.6} /><Sfx name="pop" at={396} v={0.4} /><Sfx name="click" at={630} v={0.6} />
      {Array.from({ length: 7 }, (_, i) => <Sfx key={i} name="key" at={662 + i * 4} v={0.3} />)}
      <Sfx name="click" at={718} v={0.6} /><Sfx name="success" at={724} v={0.55} />
      {[800, 1010, 1220, 1430, 1800, 1904].map((a) => <Sfx key={a} name="whoosh" at={a - 6} v={0.3} />)}
      <Sfx name="click" at={1108} v={0.6} /><Sfx name="pop" at={1114} v={0.4} /><Sfx name="click" at={1296} v={0.5} /><Sfx name="rise" at={1300} v={0.35} />
      <Sfx name="click" at={1600} v={0.5} /><Sfx name="alert" at={1722} v={0.6} /><Sfx name="whoosh2" at={1992} v={0.4} />

      <div style={{ position: "absolute", left: 600, top: 160, opacity: enter * (1 - leave), translate: `${(1 - enter) * 200 + leave * 200}px ${Math.sin(f / 60) * 5}px`, scale: String(0.94 + 0.06 * enter) }}>
        <Browser w={1250} url={`daunsense.app/#/${url}`} layers={LAYERS} cam={kf(f, CAM)}>
          <Ring at={150} out={215} x={290} y={227} w={585} h={51} />
          <Cursor keys={[[196, 980, 620], [230, 690, 500], [249, 690, 500]]} clicks={[236]} />
          <Ring at={300} out={350} x={632} y={546} w={740} h={180} />
          <Cursor keys={[[350, 1250, 700], [386, 1050, 892], [448, 1070, 900]]} clicks={[392]} />
          <Ring at={398} out={452} x={632} y={786} w={474} h={44} />
          <Ring at={520} out={560} x={633} y={1060} w={738} h={178} />
          <Cursor keys={[[590, 1150, 1650], [624, 735, 1840], [633, 735, 1840]]} clicks={[630]} />
          <Cursor keys={[[640, 900, 560], [712, 575, 500], [721, 575, 500]]} clicks={[718]} />
          <Ring at={736} out={798} x={310} y={434} w={1085} h={72} color={C.success} />
          <Ring at={870} out={1000} x={1150} y={404} w={36} h={300} color={C.success} r={18} />
          <Cursor keys={[[1070, 900, 700], [1102, 380, 630], [1111, 380, 630]]} clicks={[1108]} />
          <Cursor keys={[[1262, 1000, 520], [1292, 1296, 300], [1320, 1296, 300]]} clicks={[1296]} />
          <Ring at={1296} out={1345} x={1221} y={277} w={151} h={44} />
          <Ring at={1474} out={1516} x={332} y={372} w={250} h={76} color={C.danger} />
          <Cursor keys={[[1570, 1100, 1000], [1596, 470, 1136], [1640, 470, 1136]]} clicks={[1600]} />
          <Ring at={1690} out={1720} x={1079} y={1620} w={290} h={330} />
          <Ring at={1756} out={1799} x={332} y={2461} w={514} h={264} color={C.danger} />
        </Browser>
      </div>

      <Caption at={92} out={246} x={X} y={Y} w={W} kicker="Officer dashboard" title="What needs you, first." body="Each role lands on its own dashboard, with the next task on top." />
      <Caption at={256} out={628} x={X} y={Y} w={W} kicker="Review queue" tone={C.info} title="Every record gets checked." body="Officers see the photos, the location and the botanist's guess, then confirm the species." chips={["Photos", "Map", "Comments"]} />
      <Caption at={636} out={796} x={X} y={Y} w={W} kicker="Approve and publish" tone={C.success} title="One decision, on the record." body="Publishing asks for a typed confirmation, so nothing goes public by accident." chips={["Approve", "Return", "Reject"]} />
      <Caption at={806} out={1004} x={X} y={Y} w={W} kicker="Species catalogue" title="One reference list." body="IUCN status, descriptions and photos. A switch decides what the public can see." chips={["9 IUCN categories"]} />
      <Caption at={1016} out={1214} x={X} y={Y} w={W} kicker="QR tags" title="Print. Tag. Trace." body="Create tags in batches, print them, and follow each one from unused to on a plant." chips={["Batch labels", "Share or print"]} />
      <Caption at={1226} out={1424} x={X} y={Y} w={W} kicker="Reports" title="Answers in seconds." body="Counts by conservation status, family and species. Filter the records, then export them." chips={["CSV export", "Filters in the URL"]} />
      <Caption at={1436} out={1712} x={X} y={Y} w={W} kicker="IoT monitoring" tone={C.warning} title="Sensors on guard." body="ESP32 nodes beside endangered plants report temperature, humidity, soil moisture and movement." chips={["Live readings", "Stable ranges"]} />
      <Caption at={1718} out={1796} x={X} y={Y} w={W} kicker="Automatic alerts" tone={C.danger} title="Movement? Officers know." body="A reading out of range opens an alert, with a photo from the node's camera." />
      <Caption at={1806} out={1994} x={X} y={Y} w={W} kicker="Admin tools" title="Who can do what." body="Admins invite people, set roles and switch access off. Every change lands in an audit log that cannot be edited." chips={["Role-based access", "Audit log"]} />

      {/* the push notification that reaches the officer's phone */}
      <div style={{ position: "absolute", left: X, top: 770, width: W, opacity: push, translate: `${(1 - push) * -80}px 0px`, scale: String(0.9 + 0.1 * pop(f, 1722, 18)), background: "#1c2a22", border: `1.5px solid ${C.danger}88`, borderRadius: 26, padding: "20px 22px", boxShadow: `0 30px 60px rgba(0,0,0,.6), 0 0 60px -10px ${C.danger}66`, fontFamily: F.app, color: C.ink }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 19, color: C.ink3, fontWeight: 700 }}><span style={{ width: 30, height: 30, borderRadius: 9, background: "#294f33", display: "grid", placeItems: "center" }}><Icon name="leaf" size={18} color="#d6f093" /></span>Daun Sense · now</div>
        <div style={{ fontSize: 28, fontWeight: 800, marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}><Icon name="alert" size={28} color={C.danger} /> Motion detected</div>
        <div style={{ fontSize: 22, color: C.ink2, marginTop: 6, lineHeight: 1.35 }}>NODE-02 · Gaharu slope reported movement near a critically endangered plant.</div>
      </div>
    </AbsoluteFill>
  );
};
