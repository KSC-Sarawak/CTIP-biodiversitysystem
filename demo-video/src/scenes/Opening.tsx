import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { Chip, Icon, io, Logo, pop, Rise, Sfx, tw } from "../lib";

const Paper: React.FC<{ x: number; y: number; r: number; at: number; tag: string; wet?: boolean }> = ({ x, y, r, at, tag, wet }) => {
  const f = useCurrentFrame();
  const a = tw(f, at, at + 22), gone = tw(f, 262, 292, 0, 1, (n) => n * n);
  const lines = [0.9, 0.7, 0.85, 0.5, 0.8, 0.62, 0.74];
  return (
    <div style={{ position: "absolute", left: x + gone * (960 - x - 150) , top: y + (1 - a) * 500 + gone * (470 - y - 190), width: 300, height: 380, rotate: `${r * a + gone * 240}deg`, scale: String(1 - gone * 0.96), opacity: a * (1 - tw(f, 282, 292)), background: "#efe7d2", borderRadius: 6, boxShadow: "0 30px 60px rgba(0,0,0,.5)", padding: 26, fontFamily: F.mono, color: "#4b4233" }}>
      <div style={{ fontSize: 15, letterSpacing: 2, borderBottom: "2px solid #b9ad8f", paddingBottom: 8, display: "flex", justifyContent: "space-between" }}><span>FIELD SHEET</span><span>{tag}</span></div>
      <svg width="250" height="250" viewBox="0 0 250 250" style={{ marginTop: 14 }}>
        {lines.map((w, i) => {
          const len = 240 * w, draw = tw(f, at + 14 + i * 5, at + 34 + i * 5);
          return <path key={i} d={`M4 ${18 + i * 33} ${Array.from({ length: 12 }, (_, k) => `q${len / 24} ${k % 2 ? 9 : -9} ${len / 12} 0`).join(" ")}`} fill="none" stroke="#3b4a7a" strokeWidth="3" strokeLinecap="round" strokeDasharray={len * 1.4} strokeDashoffset={len * 1.4 * (1 - draw)} opacity={wet && i > 2 ? 0.25 : 0.85} />;
        })}
        {wet && [[150, 120, 46], [90, 170, 34], [190, 200, 26]].map(([cx, cy, rr], i) => <circle key={i} cx={cx} cy={cy} r={rr * pop(f, at + 60 + i * 8, 20)} fill="#7d93b8" opacity="0.28" />)}
      </svg>
    </div>
  );
};

export const Opening: React.FC = () => {
  const f = useCurrentFrame();
  const problems: [string, string, number][] = [["edit", "Hard-to-read handwriting", 120], ["copy", "Typed in again at the office", 146], ["rain", "Sheets lost to rain and mud", 172], ["wifiOff", "No signal in the forest", 198]];
  const logoIn = pop(f, 292, 26);
  return (
    <AbsoluteFill>
      <Sfx name="swell" at={2} v={0.25} /><Sfx name="paper" at={88} v={0.5} /><Sfx name="paper" at={100} v={0.4} /><Sfx name="paper" at={112} v={0.4} />
      {problems.map(([, , at]) => <Sfx key={at} name="tick" at={at} v={0.25} />)}
      <Sfx name="whoosh2" at={258} v={0.6} /><Sfx name="impact" at={290} v={0.7} /><Sfx name="rise" at={318} v={0.4} />
      {/* 1. where we are */}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: io(f, 6, 92, 16) }}>
        <div style={{ fontFamily: F.mono, fontSize: 28, letterSpacing: 8, color: C.accent, opacity: tw(f, 8, 30) }}>NIAH NATIONAL PARK · SARAWAK</div>
        <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 124, color: C.ink, letterSpacing: -3, marginTop: 20, textAlign: "center", lineHeight: 1.05, translate: `0px ${(1 - tw(f, 14, 44)) * 40}px` }}>Every plant here<br />has a <span style={{ color: C.accent, fontStyle: "italic" }}>story.</span></div>
      </div>
      {/* 2. the paper problem */}
      <div style={{ position: "absolute", inset: 0, opacity: tw(f, 84, 96) }}>
        <Paper x={150} y={330} r={-9} at={88} tag="NP-0412" />
        <Paper x={400} y={380} r={6} at={100} tag="NP-0413" wet />
        <Paper x={640} y={320} r={-3} at={112} tag="NP-0414" />
        <div style={{ position: "absolute", left: 150, top: 110, opacity: 1 - tw(f, 250, 266) }}>
          <Rise at={92}><div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 92, color: C.ink, letterSpacing: -2 }}>Until now, it was written <span style={{ color: C.warning, fontStyle: "italic" }}>on paper.</span></div></Rise>
        </div>
        <div style={{ position: "absolute", left: 1090, top: 360, display: "flex", flexDirection: "column", gap: 26, opacity: 1 - tw(f, 250, 266) }}>
          {problems.map(([ic, label, at]) => (
            <Rise key={label} at={at} y={0} style={{ translate: `${(1 - tw(f, at, at + 18)) * 60}px 0px` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 22, fontFamily: F.text, fontSize: 40, fontWeight: 500, color: C.ink }}>
                <span style={{ width: 72, height: 72, borderRadius: 20, background: C.danger + "22", border: `2px solid ${C.danger}66`, display: "grid", placeItems: "center" }}><Icon name={ic} size={36} color={C.danger} /></span>{label}
              </div>
            </Rise>
          ))}
        </div>
      </div>
      {/* 3. the answer */}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: f < 286 ? 0 : 1 - tw(f, 418, 432) }}>
        <div style={{ position: "absolute", width: 900, height: 900, borderRadius: 500, background: `radial-gradient(closest-side, ${C.accent}33, transparent)`, scale: String(0.4 + logoIn * 0.8), opacity: logoIn * 0.9 }} />
        <div style={{ scale: String(logoIn), rotate: `${(1 - logoIn) * -40}deg` }}><Logo size={200} /></div>
        <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 150, color: C.ink, letterSpacing: -4, marginTop: 26, opacity: tw(f, 304, 322), translate: `0px ${(1 - tw(f, 304, 328)) * 36}px` }}>Daun <span style={{ color: C.accent }}>Sense</span></div>
        <div style={{ fontFamily: F.text, fontSize: 40, color: C.ink2, marginTop: 6, opacity: tw(f, 318, 336) }}>Smart ground-truthing and digital biodiversity system</div>
        <div style={{ display: "flex", gap: 18, marginTop: 44 }}>
          {[["phone", "Field app"], ["laptop", "Web portal"], ["cpu", "IoT sensors"]].map(([ic, t], i) => <Rise key={t} at={338 + i * 8} y={20}><Chip size={30}><Icon name={ic} size={30} /> {t}</Chip></Rise>)}
        </div>
      </div>
    </AbsoluteFill>
  );
};
