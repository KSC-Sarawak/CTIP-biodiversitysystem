// apps/web/src/components/ForestScene.jsx
// Illustrated Niah rainforest (Daun v2): misty hills, the park's limestone karst with a cave
// mouth (Niah is known for its Great Cave), a tree line with tall emergents, and large leaves in
// front. Drawn as inline SVG so every colour comes from the theme tokens (light and dark both
// work) and individual parts can move: leaves sway, mist drifts, specks of light twinkle.
// Motion is CSS only and stops under the device's reduced-motion setting (App.css, section 13).
//
//   sky={false}  leaves out the sky and hills, for use along the bottom of a panel.
//   anchor="bottom" keeps the ground in view when the box is taller than it is wide.
import { useId } from "react";

// Mid-canopy crowns along the tree line: [x, y, radius].
const CANOPY = [
  [-10, 430, 60], [60, 410, 52], [120, 425, 48], [175, 400, 58], [240, 418, 50], [300, 405, 56],
  [360, 425, 46], [610, 410, 54], [665, 425, 48], [720, 400, 60], [785, 420, 52], [840, 410, 58],
];
// Front crowns, darker and closer.
const FRONT = [
  [-20, 520, 70], [70, 505, 62], [150, 525, 58], [235, 500, 66], [320, 520, 60], [410, 510, 64],
  [500, 525, 58], [585, 505, 66], [670, 520, 60], [755, 500, 68], [830, 520, 62],
];
// Tall emergent trees (like the tapang) rising above the canopy: [x, top, crown width].
const EMERGENT = [[205, 250, 120], [690, 270, 110], [395, 300, 90]];
// Specks of light: [x, y, delay in s].
const SPECKS = [[120, 300, 0], [260, 220, 1.2], [520, 330, 0.6], [640, 210, 2.1], [730, 330, 1.6], [330, 360, 2.6], [90, 420, 3.1], [560, 450, 0.9], [470, 260, 3.6]];

// One fern frond: a curved stem with paired leaflets, generated rather than hand-drawn.
function Frond({ x, y, len, angle, flip = 1, className }) {
  const pairs = 14;
  const leaflets = [];
  for (let i = 1; i <= pairs; i++) {
    const t = i / (pairs + 1);
    const px = t * len;
    const py = -Math.sin(t * Math.PI * 0.9) * len * 0.12;
    const size = len * 0.17 * (1 - t * 0.75);
    leaflets.push(
      <path key={"a" + i} d={`M${px} ${py} q ${size * 0.35} ${-size * 0.9} ${size * 0.1} ${-size * 1.25} q ${-size * 0.35} ${size * 0.55} ${-size * 0.1} ${size * 1.25}z`} />,
      <path key={"b" + i} d={`M${px} ${py} q ${size * 0.35} ${size * 0.9} ${size * 0.1} ${size * 1.25} q ${-size * 0.35} ${-size * 0.55} ${-size * 0.1} ${-size * 1.25}z`} />,
    );
  }
  return (
    <g className={className} transform={`translate(${x} ${y}) rotate(${angle}) scale(${flip} 1)`}>
      <path className="fs-stem" d={`M0 0 Q ${len * 0.5} ${-len * 0.16} ${len} ${-len * 0.02}`} />
      {leaflets}
    </g>
  );
}

export default function ForestScene({ className = "", sky = true, anchor = "middle" }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ratio = anchor === "bottom" ? "xMidYMax slice" : "xMidYMid slice";

  return (
    <svg className={"forest " + className} viewBox="0 0 800 600" preserveAspectRatio={ratio} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id + "sky"} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="fs-sky-top" />
          <stop offset="1" className="fs-sky-low" />
        </linearGradient>
        <radialGradient id={id + "sun"} cx="0.74" cy="0.16" r="0.42">
          <stop offset="0" className="fs-sun-in" />
          <stop offset="1" className="fs-sun-out" />
        </radialGradient>
      </defs>

      {sky && (
        <>
          <rect width="800" height="600" fill={`url(#${id}sky)`} />
          <rect width="800" height="600" fill={`url(#${id}sun)`} />
          {/* Far hills */}
          <path className="fs-far" d="M0 330 C 110 285 210 300 315 272 C 420 244 520 282 615 252 C 700 228 760 246 800 238 L800 600 L0 600 Z" />
          <g className="fs-mist fs-mist-a"><ellipse cx="260" cy="318" rx="260" ry="26" /><ellipse cx="660" cy="300" rx="220" ry="20" /></g>
        </>
      )}

      {/* Limestone karst with a cave mouth */}
      <path className="fs-rock" d="M418 600 L428 352 C432 304 452 282 474 290 C480 252 512 240 532 262 C548 230 584 236 594 274 C606 312 612 350 618 388 L640 600 Z" />
      <path className="fs-rock-shade" d="M532 262 C548 230 584 236 594 274 C606 312 612 350 618 388 L640 600 L560 600 C572 520 566 420 548 340 C542 310 538 284 532 262 Z" />
      <path className="fs-cave" d="M486 600 C486 520 504 470 530 470 C556 470 574 520 574 600 Z" />

      {/* Tree line */}
      <g className="fs-canopy">{CANOPY.map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} />)}</g>
      <rect className="fs-canopy" x="0" y="420" width="800" height="180" />

      {/* Emergent trees */}
      {EMERGENT.map(([x, top, w], i) => (
        <g key={x} className={"fs-emergent fs-sway-" + (i % 2)}>
          <path className="fs-trunk" d={`M${x - 5} 600 L${x - 3} ${top + 30} L${x + 3} ${top + 30} L${x + 5} 600 Z`} />
          <ellipse cx={x} cy={top + 24} rx={w * 0.5} ry={w * 0.2} />
          <ellipse cx={x - w * 0.22} cy={top + 10} rx={w * 0.26} ry={w * 0.14} />
          <ellipse cx={x + w * 0.2} cy={top + 6} rx={w * 0.28} ry={w * 0.15} />
        </g>
      ))}

      {sky && <g className="fs-mist fs-mist-b"><ellipse cx="400" cy="452" rx="330" ry="24" /></g>}

      {/* Front canopy */}
      <g className="fs-front">{FRONT.map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} />)}</g>
      <rect className="fs-front" x="0" y="520" width="800" height="80" />

      {/* Specks of light */}
      <g className="fs-specks">
        {SPECKS.map(([x, y, d]) => <circle key={x + "-" + y} cx={x} cy={y} r="2.6" style={{ animationDelay: d + "s" }} />)}
      </g>

      {/* Foreground leaves and ferns */}
      <g className="fs-leaf fs-leaf-l">
        <path d="M-30 610 C 10 520 90 470 190 470 C 150 540 70 590 -30 610 Z" />
        <path className="fs-rib" d="M-20 604 C 50 548 110 508 180 474" />
      </g>
      <Frond className="fs-fern fs-fern-l" x={-10} y={600} len={300} angle={-38} />
      <g className="fs-leaf fs-leaf-r">
        <path d="M830 615 C 790 520 710 462 600 470 C 650 545 730 596 830 615 Z" />
        <path className="fs-rib" d="M822 608 C 760 552 690 506 610 474" />
      </g>
      <Frond className="fs-fern fs-fern-r" x={810} y={600} len={280} angle={38} flip={-1} />
    </svg>
  );
}
