// apps/web/src/components/CanopyLight.jsx
// The home page's one ambient moment (Daun v2): faint specks of canopy light that drift behind
// the headline and link when they come close, like the park's sensor mesh. It is decoration only:
// hidden from screen readers, drawn once and left still when the device asks for reduced motion,
// and paused while the tab is in the background.
import { useEffect, useRef } from "react";

const COUNT = 30;
const LINK = 150; // px: specks closer than this are joined by a line

export default function CanopyLight() {
  const ref = useRef(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!ctx) return undefined;
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const dots = Array.from({ length: COUNT }, (_, i) => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.009, vy: (Math.random() - 0.5) * 0.009,
      phase: Math.random() * 6.28, big: i % 8 === 0,
    }));
    let raf = 0;
    let last = 0;

    const draw = (ms) => {
      const sec = ms / 1000;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (w && h) {
        if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
          cv.width = Math.round(w * dpr);
          cv.height = Math.round(h * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        // Colours come from the theme, so the specks follow light and dark mode.
        const css = getComputedStyle(cv);
        const acc = css.getPropertyValue("--acc").trim() || "#2f7a3c";
        const info = css.getPropertyValue("--info").trim() || "#1b6e85";
        const dt = calm ? 0 : Math.min(0.05, sec - last);
        last = sec;
        for (const d of dots) {
          d.x = (d.x + d.vx * dt + 1) % 1;
          d.y = (d.y + d.vy * dt + 1) % 1;
        }
        ctx.lineWidth = 1;
        ctx.strokeStyle = acc;
        for (let i = 0; i < dots.length; i++) {
          for (let j = i + 1; j < dots.length; j++) {
            const a = dots[i];
            const b = dots[j];
            const dist = Math.hypot((a.x - b.x) * w, (a.y - b.y) * h);
            if (dist < LINK) {
              ctx.globalAlpha = (1 - dist / LINK) * 0.14;
              ctx.beginPath();
              ctx.moveTo(a.x * w, a.y * h);
              ctx.lineTo(b.x * w, b.y * h);
              ctx.stroke();
            }
          }
        }
        for (const d of dots) {
          const twinkle = 0.55 + 0.45 * Math.sin(sec * 1.4 + d.phase);
          const r = d.big ? 3 : 1.7;
          ctx.fillStyle = d.big ? info : acc;
          ctx.globalAlpha = 0.08 * twinkle;
          ctx.beginPath();
          ctx.arc(d.x * w, d.y * h, r * 5, 0, 6.29);
          ctx.fill();
          ctx.globalAlpha = 0.2 + 0.35 * twinkle;
          ctx.beginPath();
          ctx.arc(d.x * w, d.y * h, r, 0, 6.29);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      if (!calm && !document.hidden) raf = requestAnimationFrame(draw);
    };

    const restart = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };
    restart();
    // Redraw when the tab comes back, the window resizes, or the theme changes.
    document.addEventListener("visibilitychange", restart);
    window.addEventListener("resize", restart);
    const themed = new MutationObserver(restart);
    const site = cv.closest(".site");
    if (site) themed.observe(site, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", restart);
      window.removeEventListener("resize", restart);
      themed.disconnect();
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" />;
}
