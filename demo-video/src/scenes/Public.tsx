import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C } from "../theme";
import { Caption, Chapter, kf, Sfx, tw } from "../lib";
import { Browser, Cursor, Layer, Ring } from "../frames";
import meta from "../webMeta.json";

const h = (k: string) => (meta as Record<string, { h: number }>)[k].h;
const L = (src: string, from: number): Layer => ({ src, from, h: h(src) });
const LAYERS = [L("pub-home", 0), L("pub-cat", 180), L("pub-map", 310), L("pub-species", 430)];
const CAM = [
  [80, 720, 405, 1], [130, 720, 400, 1.3], [179, 720, 420, 1.3],
  [180, 720, 405, 1], [204, 720, 405, 1], [290, 720, 1250, 1.15], [309, 720, 1300, 1.15],
  [310, 720, 405, 1], [336, 720, 405, 1], [400, 860, 500, 1.3], [429, 860, 500, 1.3],
  [430, 720, 405, 1], [460, 720, 405, 1], [510, 720, 780, 1], [628, 720, 800, 1.05],
];
export const Public: React.FC = () => {
  const f = useCurrentFrame();
  const enter = tw(f, 52, 80), leave = tw(f, 630, 648, 0, 1, (n) => n * n);
  const url = f < 180 ? "" : f < 310 ? "#/plants" : f < 430 ? "#/map" : "#/plants/sanders-slipper-orchid";
  const X = 1380, Y = 230, W = 470;
  return (
    <AbsoluteFill>
      <Chapter n="PART 03" title="For everyone" sub="The public site. No sign-in needed." dur={60} />
      <Sfx name="whoosh" at={48} v={0.45} />{[180, 310, 430].map((a) => <Sfx key={a} name="whoosh" at={a - 6} v={0.3} />)}
      <Sfx name="click" at={372} v={0.5} /><Sfx name="rise" at={516} v={0.4} /><Sfx name="whoosh2" at={626} v={0.4} />
      <div style={{ position: "absolute", left: 70, top: 160, opacity: enter * (1 - leave), translate: `${(1 - enter) * -200 - leave * 200}px ${Math.sin(f / 60) * 5}px` }}>
        <Browser light w={1250} url={`daunsense.app/${url}`} layers={LAYERS} cam={kf(f, CAM)}>
          <Ring at={120} out={176} x={429} y={647} w={481} h={48} color="#2f7a3c" />
          <Cursor keys={[[344, 1100, 640], [370, 882, 446], [429, 882, 446]]} clicks={[372]} />
          <Ring at={516} out={628} x={44} y={830} w={1352} h={130} color="#b23c26" />
        </Browser>
      </div>
      <Caption at={76} out={176} x={X} y={Y} w={W} kicker="Visitors" title="Know every plant." body="Search by name or tag, or scan a QR tag on the trail to open that plant's page." />
      <Caption at={186} out={306} x={X} y={Y} w={W} kicker="Plant library" title="Verified records only." body="Only species and plants an officer has approved appear here." chips={["Browse by family"]} />
      <Caption at={316} out={426} x={X} y={Y} w={W} kicker="Plant map" title="See where they grow." body="Each pin is one tagged plant, coloured by its family." />
      <Caption at={436} out={630} x={X} y={Y} w={W} kicker="Protected by design" tone={C.warning} title="Rare plants stay hidden." body="Endangered species keep their stories, but never their location. The public gets no pin at all." chips={["Location hidden", "GPS stripped from photos"]} />
    </AbsoluteFill>
  );
};
