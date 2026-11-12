// apps/web/src/components/JungleArt.jsx
// Flat jungle illustration for the plant library header: layered leaves frame the left,
// right and bottom edges, with a bright clearing behind the title. Colours are CSS
// variables (--j-*, App.css), so light and dark themes both work.
//
// Wind: moving the pointer across the header pushes the leaves the same way, then they
// spring back. Each plant is a `.sway` group that rotates about its base by
//   --wx * --k  (sideways pointer motion)  +  --wy * --k * --dir  (up/down motion)
// where --wx / --wy (about -1..1) are set here on the container. --k is how far that plant
// bends (negative for vines hanging from above) and --dir is which way it leans.
// Decoration only: hidden from screen readers, and still under reduced motion.
import { useEffect, useRef } from "react";

const f = (n) => Math.round(n * 10) / 10;

// A point and the direction (degrees from +x) along a quadratic curve.
function along([p0, p1, p2], t) {
  const u = 1 - t;
  const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0];
  const y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
  const dx = 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
  const dy = 2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
  return { x, y, deg: (Math.atan2(dy, dx) * 180) / Math.PI };
}
const curve = ([p0, p1, p2]) => `M${p0.map(f)}Q${p1.map(f)} ${p2.map(f)}`;

// Leaf shapes, drawn from their base at 0,0 pointing up.
const leafD = (len, w) => `M0 0C${f(-w)} ${f(-len * 0.25)} ${f(-w * 0.85)} ${f(-len * 0.75)} 0 ${f(-len)}C${f(w * 0.85)} ${f(-len * 0.75)} ${f(w)} ${f(-len * 0.25)} 0 0Z`;
const halfD = (len, w) => `M0 0C${f(w)} ${f(-len * 0.25)} ${f(w * 0.85)} ${f(-len * 0.75)} 0 ${f(-len)}Z`;
const roundD = (l) => `M0 0C${f(-l * 0.2)} ${f(-l * 0.02)} ${f(-l * 0.55)} ${f(-l * 0.15)} ${f(-l * 0.5)} ${f(-l * 0.55)}C${f(-l * 0.45)} ${f(-l * 0.95)} ${f(l * 0.45)} ${f(-l * 0.95)} ${f(l * 0.5)} ${f(-l * 0.55)}C${f(l * 0.55)} ${f(-l * 0.15)} ${f(l * 0.2)} ${f(-l * 0.02)} 0 0Z`;
const roundHalfD = (l) => `M0 0C${f(l * 0.2)} ${f(-l * 0.02)} ${f(l * 0.55)} ${f(-l * 0.15)} ${f(l * 0.5)} ${f(-l * 0.55)}C${f(l * 0.47)} ${f(-l * 0.8)} ${f(l * 0.2)} ${f(-l * 0.86)} 0 ${f(-l * 0.86)}Z`;

// A plant that bends in the wind about its base (x, y), turned by r degrees (0 = up).
function Sway({ x, y, r = 0, k = 6, dir = 1, delay = 0, children }) {
  return (
    <g className="sway" style={{ transformOrigin: `${x}px ${y}px`, "--k": k, "--dir": dir, animationDelay: `${-delay}s` }}>
      <g transform={`translate(${x} ${y}) rotate(${r})`}>{children}</g>
    </g>
  );
}

// A broad leaf with a shaded half and a pale midrib.
function Broad({ deg = 0, len, w, tone, at = [0, 0] }) {
  return (
    <g className={`j-${tone}`} transform={`translate(${at[0]} ${at[1]}) rotate(${deg})`}>
      <path d={leafD(len, w)} />
      <path className="j-shade" d={halfD(len, w)} />
      <path className="j-rib" d={`M0 0L0 ${f(-len * 0.9)}`} />
    </g>
  );
}

// A rounded leaf on a stalk (the dark leaves in the top corners).
function Round({ deg, len, stem, tone = "deep" }) {
  return (
    <g className={`j-${tone}`} transform={`rotate(${deg})`}>
      <path className="j-stem" d={`M0 0Q${f(stem * 0.12)} ${f(-stem * 0.5)} 0 ${-stem}`} />
      <g transform={`translate(0 ${-stem})`}>
        <path d={roundD(len)} />
        <path className="j-shade" d={roundHalfD(len)} />
        <path className="j-rib" d={`M0 0L0 ${f(-len * 0.75)}`} />
      </g>
    </g>
  );
}

// A fern frond: a curved stem with paired leaflets that shrink toward the tip.
function Frond({ len, bend = 0, pairs = 14, pin = 60, tone, angle = 62, width = 0.2 }) {
  const c = [[0, 0], [0, -len * 0.55], [bend, -len]];
  const leaflets = [];
  for (let i = 0; i < pairs; i++) {
    const t = 0.1 + (i / (pairs - 1)) * 0.88;
    const a = along(c, t);
    const l = pin * (1 - t * 0.72);
    for (const s of [-1, 1]) {
      leaflets.push(<path key={`${i}${s}`} d={leafD(l, l * width)} transform={`translate(${f(a.x)} ${f(a.y)}) rotate(${f(a.deg + 90 + s * angle)})`} />);
    }
  }
  return (
    <g className={`j-${tone}`}>
      <path className="j-stem" d={curve(c)} />
      {leaflets}
    </g>
  );
}

// A tuft of grass blades fanning out from one base: [angle, length, bend, tone].
function Tuft({ blades, w = 7 }) {
  return blades.map(([deg, len, bend, tone], i) => (
    <path key={i} className={`j-${tone}`} transform={`rotate(${deg})`}
      d={`M${-w} 0Q${f(bend * 0.4 - w * 0.5)} ${f(-len * 0.6)} ${bend} ${-len}Q${f(bend * 0.4 + w * 0.5)} ${f(-len * 0.6)} ${w} 0Z`} />
  ));
}

// A vine hanging from the top edge, with small leaves on alternate sides.
function Vine({ len, bend = 0, tone = "dark", size = 26 }) {
  const c = [[0, 0], [bend * 0.2, len * 0.5], [bend, len]];
  const leaves = [];
  for (let i = 0; i < 9; i++) {
    const t = 0.14 + i * 0.1;
    const a = along(c, t);
    leaves.push(<path key={i} d={leafD(size * (1.1 - t * 0.4), size * 0.3)} transform={`translate(${f(a.x)} ${f(a.y)}) rotate(${f(a.deg + 90 + (i % 2 ? 55 : -55))})`} />);
  }
  return (
    <g className={`j-${tone}`}>
      <path className="j-stem" d={curve(c)} />
      {leaves}
    </g>
  );
}

// Blades spread evenly between two angles, longest in the middle.
const fan = (from, to, n, len, tones) => Array.from({ length: n }, (_, i) => {
  const t = n === 1 ? 0.5 : i / (n - 1);
  const deg = from + (to - from) * t;
  return [f(deg), f(len[0] + (len[1] - len[0]) * Math.sin(Math.PI * t)), f(deg * 0.9), tones[i % tones.length]];
});

function LeftSide() {
  return (
    <svg className="jside l" viewBox="0 0 460 520" preserveAspectRatio="xMinYMax meet" focusable="false">
      {/* far back, pale */}
      <Sway x={330} y={520} r={6} k={3} delay={1}><Frond len={360} bend={50} pin={58} tone="back" /></Sway>
      <Sway x={250} y={520} r={-6} k={3} dir={-1} delay={2}><Frond len={290} bend={-40} pin={50} tone="back2" /></Sway>
      {/* dark rounded leaves reaching in from the top-left corner */}
      <Sway x={-10} y={230} k={4} delay={0.5}>
        <Round deg={12} len={100} stem={180} />
        <Round deg={34} len={92} stem={120} />
        <Round deg={58} len={82} stem={80} />
        <Round deg={78} len={70} stem={160} tone="dark" />
      </Sway>
      {/* a frond along the top edge */}
      <Sway x={-10} y={26} r={102} k={2.5} delay={3}><Frond len={270} bend={-30} pin={54} tone="green" /></Sway>
      {/* the big ferns */}
      <Sway x={30} y={520} r={8} k={7} delay={1.6}><Frond len={330} bend={40} pin={64} tone="dark" /></Sway>
      <Sway x={100} y={520} r={20} k={8} delay={0.2}><Frond len={400} bend={90} pairs={16} pin={70} tone="green" /></Sway>
      {/* rust blades and green grass in front */}
      <Sway x={40} y={520} k={9} delay={2.4}><Tuft w={9} blades={fan(-38, 26, 7, [150, 230], ["rust", "rust2"])} /></Sway>
      <Sway x={0} y={520} r={42} k={5} delay={1.1}><Broad len={160} w={52} tone="dark" /></Sway>
      <Sway x={210} y={520} k={10} delay={0.8}><Tuft blades={fan(-42, 40, 9, [90, 170], ["green", "leaf", "dark"])} /></Sway>
    </svg>
  );
}

function RightSide() {
  return (
    <svg className="jside r" viewBox="0 0 460 520" preserveAspectRatio="xMaxYMax meet" focusable="false">
      <Sway x={140} y={520} r={-14} k={3} dir={-1} delay={1.4}><Frond len={330} bend={-50} pin={56} tone="back" /></Sway>
      <Sway x={190} y={520} k={3} dir={-1} delay={2.2}>
        <Broad deg={-25} len={170} w={52} tone="back2" />
        <Broad deg={15} len={140} w={44} tone="back" />
      </Sway>
      {/* vines hanging from the top edge swing the other way */}
      <Sway x={250} y={-4} k={-6} dir={0} delay={0.4}><Vine len={250} bend={-20} /></Sway>
      <Sway x={330} y={-4} k={-7} dir={0} delay={1.9}><Vine len={180} bend={14} tone="green" size={22} /></Sway>
      {/* dark rounded leaves in the top-right corner */}
      <Sway x={470} y={210} k={4} dir={-1} delay={2.7}>
        <Round deg={-14} len={100} stem={170} />
        <Round deg={-38} len={90} stem={110} />
        <Round deg={-62} len={80} stem={75} />
        <Round deg={-82} len={72} stem={150} tone="dark" />
      </Sway>
      {/* rust fern */}
      <Sway x={200} y={520} r={-8} k={8} dir={-1} delay={0.9}><Frond len={230} bend={-30} pairs={12} pin={58} angle={50} width={0.32} tone="rust" /></Sway>
      <Sway x={250} y={520} r={12} k={8} delay={2}><Frond len={180} bend={20} pairs={11} pin={50} angle={50} width={0.32} tone="rust2" /></Sway>
      {/* a mid-green cluster on its own stalk */}
      <Sway x={312} y={520} k={6} dir={-1} delay={1.2}>
        <path className="j-dark j-stem" d="M0 0Q-6 -60 0 -110" />
        <Broad at={[0, -110]} deg={-38} len={150} w={50} tone="green" />
        <Broad at={[0, -110]} deg={12} len={130} w={44} tone="dark" />
        <Broad at={[0, -110]} deg={-74} len={136} w={44} tone="green" />
      </Sway>
      {/* the big bright leaves */}
      <Sway x={470} y={520} k={6} dir={-1} delay={0.3}>
        <Broad deg={-22} len={220} w={70} tone="leaf" />
        <Broad deg={-52} len={260} w={86} tone="lime" />
        <Broad deg={-78} len={200} w={64} tone="lime" />
      </Sway>
      <Sway x={380} y={520} r={-8} k={7} dir={-1} delay={1.7}><Broad len={180} w={60} tone="lime" /></Sway>
      <Sway x={130} y={520} k={10} delay={2.5}><Tuft blades={fan(-40, 38, 8, [80, 150], ["leaf", "green", "dark"])} /></Sway>
    </svg>
  );
}

// Low grass along the whole bottom edge, so the two sides meet. Spacing, height and lean
// vary from tuft to tuft (a fixed pseudo-random sequence, so it looks the same every time).
const rnd = (i) => { const v = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return v - Math.floor(v); };
function Ground() {
  const tufts = [];
  for (let i = 0, x = 10; x < 1240; i++) {
    const tall = 34 + rnd(i) * 52;
    const lean = (rnd(i + 50) - 0.5) * 24;
    const n = 3 + Math.floor(rnd(i + 90) * 4);
    const tones = [["dark", "green", "leaf"], ["green", "leaf"], ["leaf", "lime", "green"], ["dark", "green"]][Math.floor(rnd(i + 130) * 4)];
    tufts.push(
      <Sway key={i} x={f(x)} y={92} r={f(lean * 0.3)} k={8 + rnd(i + 170) * 4} dir={lean > 0 ? 1 : -1} delay={f(rnd(i + 210) * 3)}>
        <Tuft w={4 + rnd(i + 250) * 2} blades={fan(-30 + lean, 30 + lean, n, [tall * 0.55, tall], tones)} />
      </Sway>,
    );
    x += 30 + rnd(i + 290) * 70;
  }
  return (
    <svg className="jground" viewBox="0 0 1240 92" preserveAspectRatio="xMidYMax slice" focusable="false">
      {tufts}
    </svg>
  );
}

export default function JungleArt() {
  const ref = useRef(null);

  // The pointer's movement becomes a gust that the leaves spring back from.
  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const s = { tx: 0, ty: 0, x: 0, y: 0, vx: 0, vy: 0 };
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    let last = null;
    let raf = 0;
    const tick = () => {
      s.vx = (s.vx + (s.tx - s.x) * 0.06) * 0.86;
      s.vy = (s.vy + (s.ty - s.y) * 0.06) * 0.86;
      s.x += s.vx;
      s.y += s.vy;
      s.tx *= 0.94; // the gust dies down when the pointer stops
      s.ty *= 0.94;
      const still = [s.tx, s.ty, s.x, s.y, s.vx, s.vy].every((v) => Math.abs(v) < 0.002);
      el.style.setProperty("--wx", still ? "0" : s.x.toFixed(3));
      el.style.setProperty("--wy", still ? "0" : s.y.toFixed(3));
      raf = still ? 0 : requestAnimationFrame(tick);
    };
    const onMove = (e) => {
      if (last) {
        const box = host.getBoundingClientRect();
        s.tx = clamp(s.tx + ((e.clientX - last.x) / box.width) * 7);
        s.ty = clamp(s.ty + ((e.clientY - last.y) / box.height) * 7);
        if (!raf) raf = requestAnimationFrame(tick);
      }
      last = { x: e.clientX, y: e.clientY };
    };
    const onLeave = () => { last = null; };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="jungle" ref={ref} aria-hidden="true">
      <LeftSide />
      <RightSide />
      <Ground />
    </div>
  );
}
