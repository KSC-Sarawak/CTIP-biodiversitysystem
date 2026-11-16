import React from "react";
import { Easing, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Audio } from "@remotion/media";
import { C, F } from "./theme";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const INOUT = Easing.bezier(0.65, 0, 0.35, 1);
/** 0 to 1 between frames a and b. */
export const tw = (f: number, a: number, b: number, from = 0, to = 1, easing: (n: number) => number = OUT) =>
  interpolate(f, [a, b], [from, to], { ...clamp, easing });
/** 1 while between inAt and outAt, easing in and out. */
export const io = (f: number, inAt: number, outAt: number, d = 14) => Math.min(tw(f, inAt, inAt + d), 1 - tw(f, outAt - d, outAt, 0, 1, Easing.in(Easing.cubic)));
/** Overshooting pop, 0 to 1. */
export const pop = (f: number, at: number, d = 16) => interpolate(f, [at, at + d], [0, 1], { ...clamp, easing: Easing.bezier(0.34, 1.56, 0.64, 1) });
/** Follow keyframes [frame, ...values] with ease in-out between them. */
export function kf(f: number, keys: number[][]): number[] {
  if (f <= keys[0][0]) return keys[0].slice(1);
  for (let i = 1; i < keys.length; i++) {
    if (f <= keys[i][0]) { const t = INOUT((f - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])); return keys[i].slice(1).map((v, k) => keys[i - 1][k + 1] + (v - keys[i - 1][k + 1]) * t); }
  }
  return keys[keys.length - 1].slice(1);
}

export const Sfx: React.FC<{ name: string; at: number; v?: number }> = ({ name, at, v = 0.5 }) => (
  <Sequence from={at} durationInFrames={90} layout="none"><Audio src={staticFile(`audio/sfx/${name}.wav`)} volume={v} /></Sequence>
);

/** Fades and slides its children in at `at`, out at `out`. */
export const Rise: React.FC<{ at: number; out?: number; y?: number; d?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ at, out = 1e9, y = 28, d = 18, style, children }) => {
  const f = useCurrentFrame();
  const a = tw(f, at, at + d), b = tw(f, out - 12, out, 0, 1, Easing.in(Easing.cubic));
  return <div style={{ opacity: a * (1 - b), translate: `0px ${(1 - a) * y - b * 18}px`, ...style }}>{children}</div>;
};

export const Chip: React.FC<{ children: React.ReactNode; tone?: string; size?: number }> = ({ children, tone = C.accent, size = 26 }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: `${size * 0.36}px ${size * 0.7}px`, borderRadius: 999, background: tone + "22", border: `1.5px solid ${tone}66`, color: tone, fontFamily: F.text, fontWeight: 600, fontSize: size, whiteSpace: "nowrap" }}>{children}</span>
);

/** The text column next to a phone or browser: kicker, title, body, chips. */
export const Caption: React.FC<{ at: number; out: number; x: number; y: number; w: number; kicker?: string; title: React.ReactNode; body?: React.ReactNode; chips?: string[]; tone?: string }> = ({ at, out, x, y, w, kicker, title, body, chips = [], tone = C.accent }) => (
  <div style={{ position: "absolute", left: x, top: y, width: w }}>
    {kicker && <Rise at={at} out={out}><div style={{ fontFamily: F.mono, fontSize: 24, letterSpacing: 4, color: tone, textTransform: "uppercase", marginBottom: 18 }}>{kicker}</div></Rise>}
    <Rise at={at + 4} out={out}><div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 76, lineHeight: 1.04, color: C.ink, letterSpacing: -1.5 }}>{title}</div></Rise>
    {body && <Rise at={at + 10} out={out}><div style={{ fontFamily: F.text, fontSize: 33, lineHeight: 1.42, color: C.ink2, marginTop: 26 }}>{body}</div></Rise>}
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 30 }}>
      {chips.map((c, i) => <Rise key={c} at={at + 20 + i * 7} out={out} y={16}><Chip tone={tone}>{c}</Chip></Rise>)}
    </div>
  </div>
);

/** Big numbered card that opens each part. */
export const Chapter: React.FC<{ n: string; title: string; sub: string; dur?: number }> = ({ n, title, sub, dur = 75 }) => {
  const f = useCurrentFrame();
  if (f > dur + 2) return null;
  const o = io(f, 0, dur, 12);
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: o }}>
      <div style={{ fontFamily: F.mono, fontSize: 30, letterSpacing: 8, color: C.accent, translate: `0px ${(1 - tw(f, 0, 20)) * 30}px` }}>{n}</div>
      <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 132, color: C.ink, letterSpacing: -3, marginTop: 14, translate: `0px ${(1 - tw(f, 3, 24)) * 40}px` }}>{title}</div>
      <div style={{ width: tw(f, 8, 34) * 220, height: 4, borderRadius: 2, background: C.accent, margin: "22px 0 26px" }} />
      <div style={{ fontFamily: F.text, fontSize: 38, color: C.ink2, opacity: tw(f, 12, 30) }}>{sub}</div>
    </div>
  );
};

const ICONS: Record<string, string> = {
  leaf: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12",
  scan: "M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M7 12h10",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.94 1.94 0 0 0 3.4 0",
  file: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z M14 2v4a2 2 0 0 0 2 2h4",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  pin: "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  camera: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z M12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  check: "M20 6 9 17l-5-5",
  lock: "M5 11h14v10H5z M7 11V7a5 5 0 0 1 10 0v4",
  wifi: "M5 13a10 10 0 0 1 14 0 M8.5 16.5a5 5 0 0 1 7 0 M2 8.82a15 15 0 0 1 20 0 M12 20h.01",
  wifiOff: "M8.5 16.5a5 5 0 0 1 7 0 M12 20h.01 M2 2l20 20 M5 13a10 10 0 0 1 4-2.6 M2 8.82a15 15 0 0 1 4.2-2.7 M10.7 5.1A15 15 0 0 1 22 8.82 M16 11.3a10 10 0 0 1 3 1.7",
  upload: "M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2 M12 12v9 M16 16l-4-4-4 4",
  shield: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
  qr: "M3 3h6v6H3z M15 3h6v6h-6z M3 15h6v6H3z M15 15h2v2h-2z M19 19h2v2h-2z M19 15h2 M15 19v2",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  chart: "M3 3v18h18 M8 17V9 M13 17V5 M18 17v-6",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  clipboard: "M9 2h6v4H9z M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M9 14l2 2 4-4",
  plus: "M12 5v14 M5 12h14",
  search: "M21 21l-4.3-4.3 M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z",
  send: "M22 2 11 13 M22 2l-7 20-4-9-9-4Z",
  cpu: "M6 6h12v12H6z M9 9h6v6H9z M9 2v4 M15 2v4 M9 18v4 M15 18v4 M2 9h4 M2 15h4 M18 9h4 M18 15h4",
  laptop: "M4 5h16v11H4z M2 20h20",
  phone: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z M11 18h2",
  alert: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z M12 9v4 M12 17h.01",
  download: "M12 3v12 M7 10l5 5 5-5 M5 21h14",
  x: "M18 6 6 18 M6 6l12 12",
  db: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Z M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  layers: "M12 2 2 7l10 5 10-5-10-5Z M2 12l10 5 10-5 M2 17l10 5 10-5",
  back: "M15 18l-6-6 6-6",
  rain: "M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2 M8 19v2 M12 18v3 M16 19v2",
  edit: "M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z",
  copy: "M9 9h11v11H9z M5 15H4V4h11v1",
  ruler: "M3 17 17 3l4 4L7 21Z M7 13l2 2 M10 10l2 2 M13 7l2 2",
};
export const Icon: React.FC<{ name: string; size?: number; color?: string; sw?: number }> = ({ name, size = 24, color = "currentColor", sw = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={name === "more" ? 3 : sw} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    {ICONS[name].split(" M").map((d, i) => <path key={i} d={(i ? "M" : "") + d} />)}
  </svg>
);

export const Logo: React.FC<{ size?: number }> = ({ size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120">
    <rect width="120" height="120" rx="26" fill="#294f33" />
    <g fill="none" stroke="#e9f7c8" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9">
      <path d="M22 38V28a6 6 0 0 1 6-6h10" /><path d="M82 22h10a6 6 0 0 1 6 6v10" /><path d="M98 82v10a6 6 0 0 1-6 6H82" /><path d="M38 98H28a6 6 0 0 1-6-6V82" />
    </g>
    <path d="M35.2 86.2C28 54.3 51.8 32.1 85.8 33.8 88.1 67.8 68.2 87.9 35.2 86.2Z" fill="#d6f093" />
    <path d="M38 83C52 66 66 52 80 40" fill="none" stroke="#0b3322" strokeWidth="2.6" strokeLinecap="round" />
    <g fill="none" stroke="#0b3322" strokeWidth="2.2" strokeLinecap="round">
      <path d="M50.7 67.5C47.5 63.9 48.3 54.5 50.7 51.2" /><path d="M60.6 56.9c-2.5-3.8-2.3-9.8 0-12.3" /><path d="M70 48.8C68.4 47.1 68.8 42.8 70 41.2" /><path d="M41.7 77.8C39.2 75 39.6 69.7 40.7 65.5" />
      <path d="M68 68.3C64.4 71.5 55 70.6 51.7 68.3" /><path d="M74.1 57.8C70.3 60.3 64.3 60 61.7 57.7" /><path d="M78.1 49.3c-1.7 1.6-6 1.2-7.6 0" /><path d="M55.1 78.1c-2.9 2.5-8.2 2.1-12.3 1" />
    </g>
  </svg>
);

/** The living backdrop behind every scene. */
export const Backdrop: React.FC = () => {
  const f = useCurrentFrame();
  const flies = Array.from({ length: 26 }, (_, i) => {
    const s = (n: number) => { const v = Math.sin(i * 127.1 + n * 311.7) * 43758.5453; return v - Math.floor(v); };
    const x = s(1) * 1920 + Math.sin(f / (60 + s(3) * 80) + i) * 60, y = ((s(2) * 1080 - f * (0.15 + s(4) * 0.35)) % 1180 + 1180) % 1180 - 50;
    return <div key={i} style={{ position: "absolute", left: x, top: y, width: 5 + s(5) * 7, height: 5 + s(5) * 7, borderRadius: 99, background: i % 4 ? "#c8f08a" : "#9fe0e8", opacity: (0.12 + s(6) * 0.3) * (0.6 + 0.4 * Math.sin(f / (14 + s(7) * 20) + i)), boxShadow: "0 0 14px 3px rgba(190,240,130,.35)" }} />;
  });
  const leafAt = (x: number, y: number, r: number, sc: number, flip = 1) => (
    <svg width={520} height={520} viewBox="0 0 520 520" style={{ position: "absolute", left: x, top: y, rotate: `${r + Math.sin(f / 70 + x) * 2.5}deg`, scale: `${sc * flip} ${sc}`, opacity: 0.5 }}>
      {[-34, -12, 12, 36].map((a, i) => <path key={i} d="M260 500 C190 380 190 180 260 40 C330 180 330 380 260 500Z" fill={i % 2 ? "#143a24" : "#102e1d"} transform={`rotate(${a} 260 500)`} />)}
    </svg>
  );
  return (
    <div style={{ position: "absolute", inset: 0, background: `linear-gradient(160deg, #0b1b12 0%, ${C.bg} 55%, #08150d 100%)`, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: -300 + Math.sin(f / 190) * 120, top: -350, width: 1500, height: 1200, background: `radial-gradient(closest-side, ${C.washLeaf}cc, transparent)` }} />
      <div style={{ position: "absolute", left: 900 + Math.cos(f / 230) * 140, top: 300, width: 1400, height: 1100, background: `radial-gradient(closest-side, ${C.washWater}aa, transparent)` }} />
      {leafAt(-170, 640, 28, 1.25)}{leafAt(1560, 660, -30, 1.3, -1)}{leafAt(1500, -330, 200, 1.0)}{leafAt(-160, -340, 150, 0.9)}
      {flies}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.45) 100%)" }} />
    </div>
  );
};
