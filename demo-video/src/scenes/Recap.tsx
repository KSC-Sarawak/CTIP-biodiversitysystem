import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { Icon, Logo, pop, Rise, Sfx, tw } from "../lib";

const TILES: [string, string, string, string][] = [
  ["wifiOff", "Offline-first field app", "Record with no signal. Sync later, with no duplicates.", C.accent],
  ["qr", "QR-tagged plants", "One tag, one plant, from the trail to the database.", C.info],
  ["clipboard", "Officer review", "Nothing is published until a species is confirmed.", C.success],
  ["cpu", "IoT alerts", "Sensor nodes and a camera watch endangered plants.", C.warning],
  ["shield", "Protected locations", "Rare plants never appear on the public map.", C.danger],
  ["users", "Roles and audit log", "Four roles, two-step sign-in and a full change history.", "#c59be8"],
];
export const Recap: React.FC = () => {
  const f = useCurrentFrame();
  const gone = tw(f, 318, 346, 0, 1, (n) => n * n), logo = pop(f, 350, 26);
  return (
    <AbsoluteFill>
      {TILES.map((_, i) => <Sfx key={i} name="pop" at={34 + i * 24} v={0.4} />)}
      <Sfx name="whoosh2" at={316} v={0.5} /><Sfx name="impact" at={348} v={0.7} /><Sfx name="success" at={372} v={0.4} />
      <div style={{ opacity: 1 - gone, scale: String(1 - gone * 0.12) }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 96, textAlign: "center" }}>
          <Rise at={4}><div style={{ fontFamily: F.mono, fontSize: 26, letterSpacing: 7, color: C.accent }}>IN SHORT</div></Rise>
          <Rise at={10}><div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 100, color: C.ink, letterSpacing: -2.5, marginTop: 10 }}>Paper out. <span style={{ color: C.accent, fontStyle: "italic" }}>Daun Sense in.</span></div></Rise>
        </div>
        <div style={{ position: "absolute", left: 130, top: 350, width: 1660, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 30 }}>
          {TILES.map(([ic, title, body, tone], i) => {
            const at = 34 + i * 24, p = pop(f, at, 18);
            return (
              <div key={title} style={{ height: 270, borderRadius: 30, background: "rgba(21,41,29,.82)", border: `2px solid ${tone}55`, padding: "30px 34px", boxSizing: "border-box", opacity: tw(f, at, at + 10), scale: String(0.85 + 0.15 * p), boxShadow: `0 30px 60px -20px rgba(0,0,0,.6), 0 0 80px -30px ${tone}` }}>
                <div style={{ width: 76, height: 76, borderRadius: 22, background: tone + "22", display: "grid", placeItems: "center" }}><Icon name={ic} size={40} color={tone} /></div>
                <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 44, color: C.ink, marginTop: 20 }}>{title}</div>
                <div style={{ fontFamily: F.text, fontSize: 27, lineHeight: 1.35, color: C.ink2, marginTop: 8 }}>{body}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: f < 344 ? 0 : 1 }}>
        <div style={{ position: "absolute", width: 1000, height: 1000, borderRadius: 500, background: `radial-gradient(closest-side, ${C.accent}30, transparent)`, scale: String(0.4 + logo * 0.8 + Math.sin(f / 30) * 0.03), opacity: logo }} />
        <div style={{ scale: String(logo) }}><Logo size={190} /></div>
        <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 140, color: C.ink, letterSpacing: -4, marginTop: 22, opacity: tw(f, 360, 378), translate: `0px ${(1 - tw(f, 360, 384)) * 36}px` }}>Daun <span style={{ color: C.accent }}>Sense</span></div>
        <div style={{ fontFamily: F.display, fontStyle: "italic", fontWeight: 600, fontSize: 50, color: C.ink2, marginTop: 4, opacity: tw(f, 376, 396) }}>Know every plant in Niah National Park.</div>
        <div style={{ width: tw(f, 392, 430) * 300, height: 3, background: C.line, margin: "44px 0 26px" }} />
        <div style={{ fontFamily: F.text, fontSize: 28, color: C.ink3, textAlign: "center", lineHeight: 1.5, opacity: tw(f, 404, 426) }}>COS30049 Computing Technology Innovation Project · Swinburne Sarawak<br />Built with NeuonAI and Sarawak Forestry Corporation</div>
      </div>
      <AbsoluteFill style={{ background: "#000", opacity: tw(f, 630, 664, 0, 1, (n) => n) }} />
    </AbsoluteFill>
  );
};
