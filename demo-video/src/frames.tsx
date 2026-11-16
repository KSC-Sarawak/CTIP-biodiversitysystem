import React from "react";
import { Img, staticFile, useCurrentFrame } from "remotion";
import { C, F } from "./theme";
import { clamp, Icon, tw } from "./lib";
import { interpolate } from "remotion";

export const PW = 390, PH = 844;
/** An Android phone. Children are drawn on a 390 x 844 screen. */
export const Phone: React.FC<{ scale?: number; online?: boolean; children: React.ReactNode; style?: React.CSSProperties }> = ({ scale = 1, online = true, children, style }) => (
  <div style={{ width: (PW + 24) * scale, height: (PH + 24) * scale, ...style }}>
    <div style={{ width: PW + 24, height: PH + 24, scale: String(scale), transformOrigin: "0 0", borderRadius: 58, background: "#050a07", boxShadow: "0 0 0 2px #2a3a30, 0 50px 120px -20px rgba(0,0,0,.75), 0 0 90px -10px rgba(155,207,106,.18)", padding: 12, position: "relative" }}>
      <div style={{ width: PW, height: PH, borderRadius: 46, overflow: "hidden", position: "relative", background: C.bg, fontFamily: F.app, color: C.ink }}>
        {children}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 26px", fontFamily: F.app, fontWeight: 700, fontSize: 15, color: C.ink, zIndex: 50 }}>
          <span>10:30</span>
          <span style={{ display: "flex", gap: 7, alignItems: "center" }}>
            <Icon name={online ? "wifi" : "wifiOff"} size={17} color={online ? C.ink : C.danger} sw={2.4} />
            <span style={{ width: 25, height: 12, borderRadius: 4, border: `1.6px solid ${C.ink}`, padding: 1.5, display: "flex" }}><span style={{ width: "72%", background: C.ink, borderRadius: 2 }} /></span>
          </span>
        </div>
        <div style={{ position: "absolute", top: 13, left: PW / 2 - 7, width: 14, height: 14, borderRadius: 9, background: "#020403", zIndex: 51 }} />
        <div style={{ position: "absolute", bottom: 8, left: PW / 2 - 60, width: 120, height: 5, borderRadius: 3, background: C.ink, opacity: 0.5, zIndex: 51 }} />
      </div>
    </div>
  </div>
);

const TABS = [["file", "My records"], ["leaf", "Plants"], ["scan", "Add plant"], ["bell", "Alerts"], ["more", "More"]];
export const TabBar: React.FC<{ active?: number; badge?: number; offline?: boolean }> = ({ active = 0, badge = 0, offline = false }) => (
  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 20 }}>
    {offline && <div style={{ height: 32, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#26382c", borderTop: `1px solid ${C.line}`, color: C.ink2, fontSize: 12.5 }}><Icon name="wifiOff" size={14} /> Offline. Showing what is saved on this phone.</div>}
    <div style={{ height: 84, background: C.chrome, borderTop: `1px solid ${C.line}`, display: "flex", justifyContent: "space-around", alignItems: "flex-start", paddingTop: 10 }}>
      {TABS.map(([ic, label], i) => i === 2 ? (
        <div key={label} style={{ width: 58, height: 58, borderRadius: 30, background: C.accent, marginTop: -24, display: "grid", placeItems: "center", boxShadow: "0 8px 20px rgba(0,0,0,.4)", border: `4px solid ${C.chrome}` }}><Icon name="scan" size={26} color={C.onAccent} sw={2.4} /></div>
      ) : (
        <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: i === active ? C.accent : C.ink3, fontSize: 11.5, fontWeight: 700, position: "relative", width: 64 }}>
          <Icon name={ic} size={23} />{label}
          {i === 0 && badge > 0 && <span style={{ position: "absolute", top: -5, right: 10, minWidth: 18, height: 18, borderRadius: 9, background: C.warning, color: "#2b1d00", fontSize: 11, display: "grid", placeItems: "center", fontWeight: 800 }}>{badge}</span>}
        </div>
      ))}
    </div>
  </div>
);
export const AppBar: React.FC<{ title: string; sub?: string; back?: boolean }> = ({ title, sub, back }) => (
  <div style={{ paddingTop: 50, paddingLeft: 18, paddingRight: 18, paddingBottom: 12, background: C.chrome, borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 10 }}>
    {back && <Icon name="back" size={24} color={C.ink2} />}
    <div><div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 22 }}>{title}</div>{sub && <div style={{ fontFamily: F.mono, fontSize: 12, color: C.ink3, marginTop: 1 }}>{sub}</div>}</div>
  </div>
);

/** Finger tap: a ring that expands at (x, y) on the phone screen. */
export const Tap: React.FC<{ at: number; x: number; y: number }> = ({ at, x, y }) => {
  const f = useCurrentFrame();
  if (f < at - 8 || f > at + 16) return null;
  const down = tw(f, at - 8, at), up = tw(f, at, at + 16);
  return <div style={{ position: "absolute", left: x - 26, top: y - 26, width: 52, height: 52, borderRadius: 30, background: "rgba(255,255,255,.28)", border: "2px solid rgba(255,255,255,.7)", opacity: down * (1 - up), scale: String(0.6 + up * 0.9 + (1 - down) * 0.5), zIndex: 60 }} />;
};

export type Layer = { src: string; from: number; h: number };
/** A browser window showing a still of the real web portal. cam = [page x, page y, zoom] at the centre of the view. */
export const Browser: React.FC<{ w: number; layers: Layer[]; cam: number[]; url: string; light?: boolean; children?: React.ReactNode; style?: React.CSSProperties }> = ({ w, layers, cam, url, light, children, style }) => {
  const f = useCurrentFrame();
  const vh = (w * 810) / 1440, [cx, cy, z] = cam, s = (w / 1440) * z;
  const cur = [...layers].reverse().find((l) => f >= l.from) || layers[0];
  const tx = Math.min(0, Math.max(w - 1440 * s, w / 2 - cx * s)), ty = Math.min(0, Math.max(vh - cur.h * s, vh / 2 - cy * s));
  const bar = light ? "#e9efe2" : "#0a1610", ink = light ? "#4a6652" : C.ink3;
  return (
    <div style={{ width: w, borderRadius: 18, overflow: "hidden", boxShadow: "0 0 0 1.5px #2e4d38, 0 60px 140px -30px rgba(0,0,0,.8), 0 0 120px -20px rgba(155,207,106,.16)", background: bar, ...style }}>
      <div style={{ height: 46, display: "flex", alignItems: "center", padding: "0 18px", gap: 9 }}>
        {["#f2907b", "#e8bd5c", "#8fd18a"].map((c) => <span key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
        <div style={{ marginLeft: 18, flex: 1, maxWidth: 560, height: 28, borderRadius: 14, background: light ? "#fff" : "#15291d", display: "flex", alignItems: "center", gap: 8, padding: "0 14px", fontFamily: F.mono, fontSize: 14, color: ink }}><Icon name="lock" size={13} /> {url}</div>
      </div>
      <div style={{ width: w, height: vh, overflow: "hidden", position: "relative", background: light ? "#f3f6ec" : C.bg }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 1440, transformOrigin: "0 0", translate: `${tx}px ${ty}px`, scale: String(s) }}>
          {layers.map((l, i) => (l === cur || (layers[i + 1] === cur && f < cur.from + 6)) && <Img key={l.src} src={staticFile(`web/${l.src}.png`)} style={{ position: "absolute", left: 0, top: 0, width: 1440, height: l.h, opacity: l === cur && l.from > 0 ? interpolate(f, [l.from, l.from + 5], [0, 1], clamp) : 1 }} />)}
          {children}
        </div>
      </div>
    </div>
  );
};

/** Mouse pointer in page coordinates. keys: [frame, x, y]; clicks: frames. */
export const Cursor: React.FC<{ keys: number[][]; clicks?: number[]; size?: number }> = ({ keys, clicks = [], size = 30 }) => {
  const f = useCurrentFrame();
  const end = keys[keys.length - 1][0];
  if (f < keys[0][0] - 6 || f > end + 14) return null;
  let i = 1; while (i < keys.length - 1 && f > keys[i][0]) i++;
  const a = keys[i - 1], b = keys[Math.min(i, keys.length - 1)];
  const t = tw(f, a[0], b[0], 0, 1, (n) => n * n * (3 - 2 * n));
  const x = a[1] + (b[1] - a[1]) * t, y = a[2] + (b[2] - a[2]) * t - Math.sin(t * Math.PI) * 14;
  const c = clicks.find((k) => f >= k - 3 && f < k + 18);
  return (
    <>
      {c !== undefined && <div style={{ position: "absolute", left: x - 30, top: y - 30, width: 60, height: 60, borderRadius: 40, border: "3px solid #c8f08a", opacity: 1 - tw(f, c, c + 18), scale: String(0.3 + tw(f, c, c + 18) * 1.1) }} />}
      <svg width={size} height={size} viewBox="0 0 24 24" style={{ position: "absolute", left: x, top: y, scale: String(c !== undefined && f < c + 4 ? 0.82 : 1), transformOrigin: "0 0", opacity: tw(f, keys[0][0] - 6, keys[0][0]) * (1 - tw(f, end + 6, end + 14)), filter: "drop-shadow(0 3px 5px rgba(0,0,0,.6))" }}>
        <path d="M4 2l15 9.5-6.6 1.3L9 19.5Z" fill="#fff" stroke="#0b1b12" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </>
  );
};

/** Outline that draws attention to a region of the page. */
export const Ring: React.FC<{ at: number; out: number; x: number; y: number; w: number; h: number; color?: string; r?: number }> = ({ at, out, x, y, w, h, color = "#c8f08a", r = 12 }) => {
  const f = useCurrentFrame();
  if (f < at || f > out) return null;
  const o = Math.min(tw(f, at, at + 10), 1 - tw(f, out - 10, out)), p = 10 + (1 - tw(f, at, at + 14)) * 26;
  return <div style={{ position: "absolute", left: x - p, top: y - p, width: w + p * 2, height: h + p * 2, borderRadius: r + p, border: `4px solid ${color}`, boxShadow: `0 0 0 6px ${color}33, 0 0 40px ${color}55`, opacity: o }} />;
};
