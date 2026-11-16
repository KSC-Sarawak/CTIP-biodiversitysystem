import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { Caption, Chapter, clamp, Icon, io, pop, Sfx, tw } from "../lib";
import { AppBar, Phone, PH, PW, TabBar, Tap } from "../frames";

const plant = (n: string) => staticFile(`plants/${n}.svg`);
const typed = (f: number, a: number, b: number, s: string) => s.slice(0, Math.round(interpolate(f, [a, b], [0, s.length], clamp)));
const keys = (a: number, b: number, step = 5) => Array.from({ length: Math.floor((b - a) / step) }, (_, i) => <Sfx key={a + i} name="key" at={a + i * step} v={0.22} />);
const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => <div style={{ fontSize: 13, fontWeight: 800, color: C.ink2, marginBottom: 6 }}>{children}</div>;
const Field: React.FC<{ children: React.ReactNode; focus?: boolean; h?: number }> = ({ children, focus, h = 46 }) => (
  <div style={{ minHeight: h, borderRadius: 12, background: C.sunken, border: `1.5px solid ${focus ? C.accent : C.line}`, padding: "11px 14px", fontSize: 16, display: "flex", alignItems: h > 50 ? "flex-start" : "center", gap: 8, boxSizing: "border-box" }}>{children}</div>
);
const StatusChip: React.FC<{ tone: string; icon?: string; children: React.ReactNode }> = ({ tone, icon, children }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 800, color: tone, background: tone + "22", border: `1px solid ${tone}55`, borderRadius: 99, padding: "3px 9px" }}>{icon && <Icon name={icon} size={12} sw={2.6} />}{children}</span>
);
/** One screen of the phone, sliding in at `a` and out at `b`. */
const Screen: React.FC<{ a: number; b: number; children: React.ReactNode }> = ({ a, b, children }) => {
  const f = useCurrentFrame();
  if (f < a - 1 || f > b + 1) return null;
  const i = tw(f, a, a + 14), o = tw(f, b - 12, b, 0, 1, (n) => n * n);
  return <div style={{ position: "absolute", inset: 0, opacity: i * (1 - o), translate: `${(1 - i) * 60 - o * 60}px 0px` }}>{children}</div>;
};

// ---------- A. scan ----------
const ScanScreen: React.FC = () => {
  const f = useCurrentFrame();
  const hit = tw(f, 186, 198), sheet = tw(f, 206, 228), dx = Math.sin(f / 23) * 7 * (1 - hit), dy = Math.cos(f / 31) * 6 * (1 - hit);
  const box = 230 - hit * 76, line = ((f - 80) % 50) / 50;
  return (
    <div style={{ position: "absolute", inset: 0, background: C.camera }}>
      <div style={{ position: "absolute", inset: -20, translate: `${dx}px ${dy}px` }}>
        <Img src={plant("forest")} style={{ width: PW + 40, height: PH + 40, objectFit: "cover", filter: "brightness(.55)" }} />
        <div style={{ position: "absolute", left: 120, top: -10, width: 190, height: 900, background: "linear-gradient(90deg,#2e2117,#5a4330 40%,#4a3626 70%,#241a12)" }} />
        {[90, 210, 480, 610, 720].map((y, i) => <div key={y} style={{ position: "absolute", left: 140 + (i % 3) * 40, top: y, width: 5, height: 60 + i * 9, background: "#1e150e", borderRadius: 3, opacity: 0.6 }} />)}
        <div style={{ position: "absolute", left: 152, top: 290, width: 126, height: 150, background: "#f4f1e6", borderRadius: 10, padding: 10, boxSizing: "border-box", boxShadow: "0 8px 20px rgba(0,0,0,.5)", rotate: "-3deg" }}>
          <Img src={staticFile("qr.svg")} style={{ width: 106, height: 106 }} />
          <div style={{ fontFamily: F.mono, fontSize: 13, color: "#15301f", textAlign: "center", marginTop: 2 }}>NIAH-0018</div>
        </div>
      </div>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.25)" }} />
      <div style={{ position: "absolute", top: 70, left: 0, right: 0, textAlign: "center", fontSize: 18, fontWeight: 700, textShadow: "0 2px 8px #000" }}>{hit > 0.5 ? "Tag found" : "Point at the plant's tag"}</div>
      <div style={{ position: "absolute", left: 195 - box / 2, top: 348 - box / 2, width: box, height: box }}>
        {[[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => <div key={`${x}${y}`} style={{ position: "absolute", [x ? "right" : "left"]: 0, [y ? "bottom" : "top"]: 0, width: 38, height: 38, borderColor: hit > 0.3 ? C.accent : "#fff", borderStyle: "solid", borderWidth: 0, [`border${y ? "Bottom" : "Top"}Width`]: 5, [`border${x ? "Right" : "Left"}Width`]: 5, [`border${y ? "Bottom" : "Top"}${x ? "Right" : "Left"}Radius`]: 16 } as React.CSSProperties} />)}
        {hit < 0.2 && <div style={{ position: "absolute", left: 8, right: 8, top: 8 + line * (box - 20), height: 3, background: C.accent, boxShadow: `0 0 18px 4px ${C.accent}`, opacity: 0.9 }} />}
      </div>
      <div style={{ position: "absolute", inset: 0, background: C.accent, opacity: interpolate(f, [186, 190, 200], [0, 0.35, 0], clamp) }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 40, display: "flex", justifyContent: "center", gap: 12, opacity: 1 - sheet }}>
        {["From gallery", "Type ID"].map((t) => <span key={t} style={{ padding: "10px 18px", borderRadius: 99, background: "rgba(13,31,21,.8)", border: `1px solid ${C.line}`, fontWeight: 700, fontSize: 14 }}>{t}</span>)}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, translate: `0px ${(1 - sheet) * 330}px`, background: C.surface, borderRadius: "26px 26px 0 0", padding: "14px 22px 34px", borderTop: `1px solid ${C.line}` }}>
        <div style={{ width: 44, height: 5, borderRadius: 3, background: C.line, margin: "0 auto 16px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontFamily: F.mono, fontSize: 15, color: C.accent, background: C.accent + "22", padding: "4px 10px", borderRadius: 8 }}>NIAH-0018</span><StatusChip tone={C.neutral}>Unused tag</StatusChip></div>
        <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 23, marginTop: 12 }}>Start a new plant record?</div>
        <div style={{ fontSize: 14.5, color: C.ink2, lineHeight: 1.4, marginTop: 6 }}>This tag isn't linked to a plant yet. Once you save, it belongs to this plant for good.</div>
        <div style={{ marginTop: 16, height: 52, borderRadius: 14, background: C.accent, color: C.onAccent, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 17 }}>Start plant record</div>
      </div>
      <Tap at={300} x={195} y={782} />
    </div>
  );
};

// ---------- B. add plant ----------
const AddScreen: React.FC = () => {
  const f = useCurrentFrame();
  const shots: [string, string, number][] = [["pitcher1", "Whole plant", 372], ["leaf1", "Leaf", 398], ["pitcher2", "Flower", 424]];
  const picked = f >= 522, gps = f >= 650, sent = tw(f, 722, 738);
  const flash = Math.max(...shots.map(([, , at]) => interpolate(f, [at, at + 2, at + 9], [0, 0.55, 0], clamp)));
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <AppBar title="New plant" sub="NIAH-0018" back />
      <div style={{ padding: "16px 18px" }}>
        <Label>Photos</Label>
        <div style={{ display: "flex", gap: 10 }}>
          {shots.map(([src, trait, at]) => (
            <div key={src} style={{ width: 80 }}>
              <div style={{ width: 80, height: 80, borderRadius: 12, overflow: "hidden", border: `1.5px solid ${C.line}`, background: C.sunken, scale: String(f >= at ? pop(f, at, 12) : 1) }}>{f >= at ? <Img src={plant(src)} style={{ width: 80, height: 80, objectFit: "cover" }} /> : null}</div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: C.ink3, textAlign: "center", marginTop: 4, opacity: f >= at ? 1 : 0 }}>{trait}</div>
            </div>
          ))}
          <div style={{ width: 80, height: 80, borderRadius: 12, border: `1.5px dashed ${C.line}`, display: "grid", placeItems: "center", color: C.accent }}><Icon name="camera" size={28} /></div>
        </div>
        <div style={{ height: 16 }} />
        <Label>Species guess</Label>
        <Field focus={f >= 448 && !picked}>
          {picked ? <><i style={{ fontFamily: F.display, flex: 1 }}>Nepenthes ampullaria</i><Icon name="check" size={18} color={C.success} sw={3} /></> : <span style={{ color: f < 450 ? C.ink3 : C.ink }}>{f < 450 ? "Start typing a botanical or common name…" : typed(f, 450, 496, "Nepenthes amp")}{f >= 450 && f % 16 < 9 ? "|" : ""}</span>}
        </Field>
        <div style={{ height: 14 }} />
        <Label>Height (cm)</Label>
        <Field focus={f >= 540 && f < 560}><span style={{ fontFamily: F.mono }}>{typed(f, 544, 552, "25")}</span></Field>
        <div style={{ height: 14 }} />
        <Label>Appearance</Label>
        <Field h={72} focus={f >= 562 && f < 630}>{typed(f, 566, 626, "Round green pitchers in a carpet on the ground")}</Field>
        <div style={{ height: 14 }} />
        <Label>Location</Label>
        <div style={{ display: "flex", alignItems: "center", gap: 10, height: 48, borderRadius: 12, padding: "0 14px", background: gps ? C.success + "1c" : C.sunken, border: `1.5px solid ${gps ? C.success + "77" : C.line}`, scale: String(gps ? 0.96 + 0.04 * pop(f, 650, 12) : 1) }}>
          <Icon name="pin" size={20} color={gps ? C.success : C.ink3} />
          {gps ? <span style={{ fontFamily: F.mono, fontSize: 15 }}>3.80038, 113.77358 <span style={{ color: C.ink3 }}>±4 m</span></span> : <span style={{ color: C.ink3, opacity: f > 636 ? 0.5 + 0.5 * Math.sin(f / 2) : 1 }}>{f > 636 ? "Getting your location…" : "Use my location"}</span>}
        </div>
      </div>
      {f >= 470 && !picked && (
        <div style={{ position: "absolute", left: 18, right: 18, top: 334, background: C.raised, borderRadius: 14, border: `1px solid ${C.line}`, boxShadow: "0 16px 30px rgba(0,0,0,.5)", opacity: tw(f, 470, 480), overflow: "hidden" }}>
          {[["Nepenthes ampullaria", "Flask-shaped pitcher plant"], ["Nepenthes rafflesiana", "Raffles' pitcher plant"]].map(([s, c], i) => <div key={s} style={{ padding: "11px 14px", background: i === 0 && f > 506 ? C.accent + "26" : "transparent", borderTop: i ? `1px solid ${C.line}` : "none" }}><i style={{ fontFamily: F.display, fontSize: 16 }}>{s}</i><div style={{ fontSize: 13, color: C.ink3 }}>{c}</div></div>)}
        </div>
      )}
      <div style={{ position: "absolute", left: 18, right: 18, bottom: 36, height: 54, borderRadius: 14, background: C.accent, color: C.onAccent, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontWeight: 800, fontSize: 17, opacity: gps ? 1 : 0.45 }}><Icon name="send" size={19} /> Send for review</div>
      <div style={{ position: "absolute", left: 30, right: 30, top: 120, borderRadius: 16, background: C.success, color: "#0b2a14", padding: "14px 18px", display: "flex", gap: 10, alignItems: "center", fontWeight: 800, fontSize: 16, opacity: sent, translate: `0px ${(1 - sent) * -40}px`, boxShadow: "0 14px 30px rgba(0,0,0,.5)" }}><Icon name="check" size={22} sw={3} /> Sent for review</div>
      <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: flash }} />
      <Tap at={520} x={150} y={360} /><Tap at={640} x={195} y={617} /><Tap at={716} x={195} y={781} />
    </div>
  );
};

// ---------- C. offline and sync ----------
const OfflineScreen: React.FC = () => {
  const f = useCurrentFrame();
  const off = f >= 806 && f < 1040, syncing = f >= 1046;
  const rows: [string, string, string, number, number][] = [["pitcher3", "Unknown orchid", "NIAH-0020", 950, 1150], ["ginger", "Torch ginger (Kantan)", "NIAH-0019", 900, 1118], ["pitcher1", "Flask-shaped pitcher plant", "NIAH-0018", 850, 1085]];
  const old: [string, string, string][] = [["fern", "Umbrella fern", "NIAH-0006"], ["tree", "Belian (Borneo ironwood)", "NIAH-0003"], ["rafflesia", "Rafflesia", "NIAH-0002"]];
  const count = rows.filter((r) => f >= r[3] && f < r[4]).length, done = f >= 1160;
  const prog = interpolate(f, [1050, 1085, 1118, 1150], [0.04, 0.34, 0.67, 1], clamp);
  let y = 0;
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <AppBar title="My records" />
      <div style={{ padding: "14px 16px", position: "relative" }}>
        <div style={{ height: 58, borderRadius: 14, padding: "0 14px", display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 700, lineHeight: 1.25, background: (done ? C.success : syncing ? C.info : off ? C.warning : C.accent) + "1f", border: `1.5px solid ${(done ? C.success : syncing ? C.info : off ? C.warning : C.accent)}66`, color: done ? C.success : syncing ? C.info : off ? C.warning : C.ink2, position: "relative", overflow: "hidden" }}>
          <Icon name={done ? "check" : syncing ? "upload" : off ? "wifiOff" : "wifi"} size={22} sw={2.4} />
          <span style={{ color: C.ink }}>{done ? "All records sent" : syncing ? `Sending… ${Math.min(3, 1 + rows.filter((r) => f >= r[4]).length)} of 3` : off ? "You're offline. New records are saved on this phone." : "Everything is up to date"}</span>
          {syncing && !done && <div style={{ position: "absolute", left: 0, bottom: 0, height: 4, width: `${prog * 100}%`, background: C.info }} />}
        </div>
        <div style={{ position: "relative", marginTop: 12 }}>
          {[...rows.map((r) => ({ src: r[0], name: r[1], tag: r[2], at: r[3], sentAt: r[4] })), ...old.map((r) => ({ src: r[0], name: r[1], tag: r[2], at: -1, sentAt: -1 }))].map((r) => {
            const a = r.at < 0 ? 1 : tw(f, r.at, r.at + 16);
            const top = y; y += 82 * a;
            const sent = r.sentAt < 0 || f >= r.sentAt;
            return (
              <div key={r.tag} style={{ position: "absolute", left: 0, right: 0, top, height: 72, borderRadius: 14, background: C.surface, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 12, padding: "0 12px", boxSizing: "border-box", opacity: a, scale: String(0.9 + 0.1 * a) }}>
                <Img src={plant(r.src)} style={{ width: 50, height: 50, borderRadius: 10, objectFit: "cover" }} />
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div><div style={{ fontFamily: F.mono, fontSize: 12, color: C.ink3, marginTop: 2 }}>{r.tag}</div></div>
                <span style={{ scale: String(r.sentAt > 0 && f >= r.sentAt ? pop(f, r.sentAt, 12) : 1) }}>{r.sentAt < 0 ? <StatusChip tone={C.success}>Published</StatusChip> : sent ? <StatusChip tone={C.info} icon="check">Needs review</StatusChip> : <StatusChip tone={C.neutral} icon="lock">On this phone</StatusChip>}</span>
              </div>
            );
          })}
        </div>
      </div>
      <TabBar active={0} badge={count} offline={off} />
    </div>
  );
};

// ---------- D. quick survey ----------
const SurveyScreen: React.FC = () => {
  const f = useCurrentFrame();
  const items: [string, string][] = [["palm", "Biris fan palm"], ["fern", "Umbrella fern"], ["ginger", "Torch ginger (Kantan)"], ["orchid", "Unknown orchid"], ["flower", "Engkabang"], ["pitcher2", "Raffles' pitcher plant"]];
  const at = (i: number) => 1330 + i * 30, n = items.filter((_, i) => f >= at(i)).length;
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <AppBar title="Survey" sub="Plot 4, river trail" back />
      <div style={{ padding: "14px 16px" }}>
        <div style={{ borderRadius: 14, padding: "12px 14px", background: C.accent + "1c", border: `1.5px solid ${C.accent}55`, fontSize: 14, lineHeight: 1.35, display: "flex", gap: 10 }}><Icon name="layers" size={22} color={C.accent} /><span>Survey in progress. Record plant after plant, even with no signal.</span></div>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          {[[String(n), "Plants recorded", C.accent], [String(20 - n), "Kept tags left", C.info]].map(([v, l, tone]) => <div key={l} style={{ flex: 1, borderRadius: 14, background: C.surface, border: `1px solid ${C.line}`, padding: "10px 14px" }}><div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 34, color: tone }}>{v}</div><div style={{ fontSize: 12.5, color: C.ink3, fontWeight: 700 }}>{l}</div></div>)}
        </div>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column-reverse", gap: 8 }}>
          {items.map(([src, name], i) => {
            const a = tw(f, at(i), at(i) + 14);
            return a <= 0 ? null : (
              <div key={name} style={{ height: 56 * a, opacity: a, borderRadius: 12, background: C.surface, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 10, padding: "0 10px", overflow: "hidden", boxSizing: "border-box" }}>
                <Img src={plant(src)} style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover" }} /><span style={{ flex: 1, fontWeight: 800, fontSize: 14.5 }}>{name}</span><span style={{ fontFamily: F.mono, fontSize: 12, color: C.ink3 }}>NIAH-{String(21 + i).padStart(4, "0")}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ position: "absolute", left: 16, right: 16, bottom: 36, display: "flex", gap: 10 }}>
        <div style={{ flex: 1.6, height: 52, borderRadius: 14, background: C.accent, color: C.onAccent, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontWeight: 800, fontSize: 16 }}><Icon name="scan" size={19} /> Next plant</div>
        <div style={{ flex: 1, height: 52, borderRadius: 14, border: `1.5px solid ${C.line}`, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 15, color: C.ink2 }}>End survey</div>
      </div>
    </div>
  );
};

// ---------- E. map ----------
const MapScreen: React.FC = () => {
  const f = useCurrentFrame();
  const pins: [number, number, string][] = [[90, 250, "#9bcf6a"], [250, 190, "#e8bd5c"], [300, 330, "#82c8dc"], [140, 420, "#f2907b"], [215, 300, "#c59be8"], [60, 360, "#9bcf6a"], [330, 240, "#8fd18a"], [180, 170, "#e8bd5c"]];
  const card = tw(f, 1640, 1662);
  return (
    <div style={{ position: "absolute", inset: 0, background: "#123021" }}>
      <svg width={PW} height={PH} style={{ position: "absolute", scale: String(1.12 - tw(f, 1560, 1800, 0, 0.1, (n) => n)) }}>
        {[[80, 200, 190], [300, 420, 220], [200, 620, 240], [340, 120, 140]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill={i % 2 ? "#173a28" : "#1c4530"} opacity="0.8" />)}
        <path d="M-20 520 C80 470 120 380 200 350 S330 300 420 180" fill="none" stroke="#1d5a66" strokeWidth="22" strokeLinecap="round" />
        <path d="M20 120 C90 220 190 250 215 300 S150 440 220 560" fill="none" stroke="#5d7d55" strokeWidth="4" strokeDasharray="10 9" strokeLinecap="round" />
      </svg>
      {pins.map(([x, y, col], i) => {
        const p = pop(f, 1580 + i * 5, 14), sel = i === 4;
        return <div key={i} style={{ position: "absolute", left: x - 11, top: y - 11, width: 22, height: 22, borderRadius: 12, background: col, border: "3px solid #0d1f15", scale: String(p * (sel ? 1 + card * 0.5 : 1)), boxShadow: sel && card > 0 ? `0 0 0 ${6 + Math.sin(f / 5) * 3}px ${col}55` : "0 3px 8px rgba(0,0,0,.5)" }} />;
      })}
      <div style={{ position: "absolute", top: 54, left: 16, right: 16, height: 46, borderRadius: 23, background: C.surface, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 10, padding: "0 16px", color: C.ink3, fontSize: 15 }}><Icon name="search" size={18} /> Name, tag or family</div>
      <div style={{ position: "absolute", left: 12, right: 12, bottom: 96, borderRadius: 20, background: C.surface, border: `1px solid ${C.line}`, padding: 14, opacity: card, translate: `0px ${(1 - card) * 60}px`, boxShadow: "0 -10px 40px rgba(0,0,0,.5)" }}>
        <div style={{ display: "flex", gap: 12 }}>
          <Img src={plant("pitcher1")} style={{ width: 84, height: 84, borderRadius: 14, objectFit: "cover" }} />
          <div><div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 19 }}>Raffles' pitcher plant</div><i style={{ fontFamily: F.display, fontSize: 14, color: C.ink2 }}>Nepenthes rafflesiana</i><div style={{ display: "flex", gap: 6, marginTop: 8 }}><StatusChip tone={C.success}>Least concern</StatusChip><span style={{ fontFamily: F.mono, fontSize: 12, color: C.ink3, alignSelf: "center" }}>NIAH-0001</span></div></div>
        </div>
        <div style={{ marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 10, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 12.5, color: C.ink3, fontWeight: 700, width: 110 }}>Height over 3 visits</div>
          <svg width="150" height="40" viewBox="0 0 150 40"><path d="M6 32 L75 22 L144 8" fill="none" stroke={C.accent} strokeWidth="3" strokeLinecap="round" strokeDasharray="160" strokeDashoffset={160 * (1 - tw(f, 1668, 1700))} />{[[6, 32], [75, 22], [144, 8]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={4.5 * pop(f, 1672 + i * 12, 10)} fill={C.accent} />)}</svg>
          <span style={{ fontFamily: F.mono, fontSize: 15, color: C.accent }}>180 cm</span>
        </div>
      </div>
      <TabBar active={1} />
      <Tap at={1634} x={215} y={300} />
    </div>
  );
};

export const Mobile: React.FC = () => {
  const f = useCurrentFrame();
  const enter = tw(f, 66, 96), leave = tw(f, 1778, 1800, 0, 1, (n) => n * n);
  const online = !(f >= 806 && f < 1040);
  const cx = 880, cy = 250, cw = 920;
  return (
    <AbsoluteFill>
      <Chapter n="PART 01" title="In the field" sub="The botanist's Android app" />
      <Sfx name="whoosh" at={62} v={0.5} />
      <Sfx name="scan" at={184} v={0.55} /><Sfx name="pop" at={206} v={0.4} /><Sfx name="click" at={300} v={0.6} /><Sfx name="whoosh" at={318} v={0.35} />
      {[372, 398, 424].map((a) => <Sfx key={a} name="shutter" at={a} v={0.55} />)}
      {keys(450, 496)}<Sfx name="click" at={520} v={0.5} />{keys(544, 552, 4)}{keys(566, 626, 6)}<Sfx name="click" at={640} v={0.5} /><Sfx name="pop" at={650} v={0.5} /><Sfx name="click" at={716} v={0.6} /><Sfx name="success" at={722} v={0.5} />
      <Sfx name="whoosh" at={768} v={0.35} /><Sfx name="drop" at={806} v={0.5} />
      {[850, 900, 950].map((a) => <Sfx key={a} name="pop" at={a} v={0.4} />)}
      <Sfx name="swell" at={1016} v={0.4} />{[1085, 1118, 1150].map((a) => <Sfx key={a} name="tick" at={a} v={0.4} />)}<Sfx name="success" at={1160} v={0.55} />
      <Sfx name="whoosh" at={1278} v={0.35} />{Array.from({ length: 6 }, (_, i) => <Sfx key={i} name="pop" at={1330 + i * 30} v={0.3} />)}
      <Sfx name="whoosh" at={1548} v={0.35} /><Sfx name="click" at={1634} v={0.5} /><Sfx name="rise" at={1668} v={0.3} /><Sfx name="whoosh2" at={1774} v={0.4} />

      <div style={{ position: "absolute", left: 250, top: 62, opacity: enter * (1 - leave), translate: `${-leave * 200}px ${(1 - enter) * 160 + Math.sin(f / 50) * 6}px`, rotate: `${(1 - enter) * -6 + Math.sin(f / 80) * 0.5}deg` }}>
        <Phone scale={1.1} online={online}>
          <Screen a={70} b={330}><ScanScreen /></Screen>
          <Screen a={322} b={780}><AddScreen /></Screen>
          <Screen a={772} b={1290}><OfflineScreen /></Screen>
          <Screen a={1282} b={1560}><SurveyScreen /></Screen>
          <Screen a={1552} b={1800}><MapScreen /></Screen>
        </Phone>
      </div>

      <Caption at={92} out={322} x={cx} y={cy} w={cw} kicker="Step 1" title={<>Scan the tag.</>} body="Every plant carries a QR tag. One scan opens its record, or starts a new one." chips={["QR-tagged plants", "One tag, one plant"]} />
      <Caption at={336} out={772} x={cx} y={cy} w={cw} kicker="Step 2" title={<>Record what you see.</>} body="Photos by plant part, a species guess from the reference list, height, notes and a GPS fix. All in one form." chips={["Labelled photos", "Species lookup", "GPS location"]} />
      <Caption at={790} out={1030} x={cx} y={cy} w={cw} kicker="Offline first" tone={C.warning} title={<>No signal?<br />No problem.</>} body="Records are saved first to an encrypted database on the phone. The forest has no coverage, so the app doesn't need any." chips={["Encrypted on device", "Tags work offline"]} />
      <Caption at={1040} out={1282} x={cx} y={cy} w={cw} kicker="Automatic sync" tone={C.info} title={<>Back in range,<br />it sends itself.</>} body="Queued records upload in order when the connection returns. No duplicates, nothing lost." chips={["No double entry", "Safe to retry"]} />
      <Caption at={1296} out={1552} x={cx} y={cy} w={cw} kicker="Our innovation" title={<>Quick survey mode.</>} body="Record a whole plot in one visit. The phone keeps QR tags ready, so new plants can be tagged with no signal at all." chips={["Up to 20 kept tags", "Plot after plot"]} />
      <Caption at={1566} out={1780} x={cx} y={cy} w={cw} kicker="Find it again" title={<>Every plant,<br />on the map.</>} body="Walk back to any tagged plant, see every visit and follow its growth over time." chips={["Plant map", "Growth history"]} />
      <div style={{ position: "absolute", left: cx, top: 930, display: "flex", gap: 12, opacity: io(f, 96, 1778) }}>
        {[[92, 336], [336, 790], [790, 1296], [1296, 1566], [1566, 1800]].map(([a, b], i) => <div key={i} style={{ width: 70, height: 6, borderRadius: 3, background: C.line, overflow: "hidden" }}><div style={{ width: `${tw(f, a, b, 0, 1, (n) => n) * 100}%`, height: "100%", background: C.accent }} /></div>)}
      </div>
    </AbsoluteFill>
  );
};
