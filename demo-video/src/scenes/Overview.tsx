import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { Icon, io, pop, Rise, Sfx, tw } from "../lib";

const STEPS: [string, string, string, string, string][] = [
  ["scan", "Record", "Botanist", "Tags and records plants in the forest", C.accent],
  ["clipboard", "Review", "Conservation officer", "Checks each record and confirms the species", C.info],
  ["eye", "Publish", "Visitor", "Explores verified plants, no sign-in needed", C.success],
  ["shield", "Protect", "Sensors and admins", "Guard endangered plants around the clock", C.warning],
];
export const Overview: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity: io(f, 0, 288, 14) }}>
      {STEPS.map((_, i) => <Sfx key={i} name="pop" at={40 + i * 34} v={0.45} />)}
      <div style={{ position: "absolute", left: 0, right: 0, top: 120, textAlign: "center" }}>
        <Rise at={4}><div style={{ fontFamily: F.mono, fontSize: 26, letterSpacing: 7, color: C.accent }}>ONE SYSTEM · FOUR ROLES</div></Rise>
        <Rise at={10}><div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 104, color: C.ink, letterSpacing: -2.5, marginTop: 14 }}>From the forest floor to the public map</div></Rise>
      </div>
      <div style={{ position: "absolute", left: 110, right: 110, top: 440, display: "flex", justifyContent: "space-between" }}>
        {STEPS.map(([ic, verb, who, what, tone], i) => {
          const at = 40 + i * 34, p = pop(f, at, 20);
          return (
            <div key={verb} style={{ width: 380, position: "relative" }}>
              {i < 3 && <svg width="130" height="30" style={{ position: "absolute", left: 318, top: 70 }}><path d="M4 15h112" stroke={C.line} strokeWidth="4" strokeDasharray="4 12" strokeLinecap="round" strokeDashoffset={-f * 1.2} opacity={tw(f, at + 16, at + 30)} /><path d="M104 5l14 10-14 10" fill="none" stroke={C.ink3} strokeWidth="4" strokeLinecap="round" opacity={tw(f, at + 24, at + 34)} /></svg>}
              <div style={{ width: 160, height: 160, borderRadius: 44, margin: "0 auto", background: tone + "1f", border: `2.5px solid ${tone}88`, display: "grid", placeItems: "center", scale: String(p), boxShadow: `0 0 70px -10px ${tone}66` }}><Icon name={ic} size={78} color={tone} sw={1.8} /></div>
              <div style={{ textAlign: "center", opacity: tw(f, at + 6, at + 22), translate: `0px ${(1 - tw(f, at + 6, at + 24)) * 20}px` }}>
                <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 64, color: C.ink, marginTop: 30 }}>{verb}</div>
                <div style={{ fontFamily: F.mono, fontSize: 22, letterSpacing: 2, color: tone, marginTop: 6, textTransform: "uppercase" }}>{who}</div>
                <div style={{ fontFamily: F.text, fontSize: 29, lineHeight: 1.35, color: C.ink2, marginTop: 16, padding: "0 20px" }}>{what}</div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
