// apps/web/src/components/SensorParts.jsx
// Pieces of the Monitoring page: the node map (CTIP-39), readings over time
// (CTIP-81) and the webcam photos per node (CTIP-82).
import { useEffect, useState } from "react";
import LeafletMap from "./LeafletMap.jsx";
import Icon from "./Icon.jsx";
import { Empty, Modal } from "./Bits.jsx";
import { useStore } from "../../../shared/store.js";
import { MAP_BOUNDS } from "../../../shared/site.js";
import { fmtDateTime, label } from "../../../shared/utils.js";
import { NODE_STATE, has, nodeState } from "../sensorState.js";

/* ---------- node map (CTIP-39) ---------- */

// Every sensor node at its registered location, coloured by state. `whereOf(node)` gives
// { lat, lng } (the node's own location, else its plant's) or null. Selecting a pin picks that node.
// The view fits every node; it does not zoom to the chosen one, so none drop out of sight.
export function NodeMap({ nodes, whereOf, openByNode, onSelect }) {
  const placed = [];
  const unplaced = [];
  for (const n of nodes) {
    const at = whereOf(n);
    const state = nodeState(n, openByNode[n.id] || 0);
    if (!at) { unplaced.push(n); continue; }
    placed.push({
      id: n.id,
      name: n.name,
      family: n.status === "active" || state === "alert" ? NODE_STATE[state].text : label(n.status),
      color: NODE_STATE[state].color,
      lat: at.lat,
      lng: at.lng,
      protect: !!at.protect,
    });
  }
  const count = (s) => nodes.filter((n) => nodeState(n, openByNode[n.id] || 0) === s).length;

  return (
    <div>
      {placed.length ? (
        <div className="minimap nodemap" role="group" aria-label="Map of sensor nodes">
          <LeafletMap points={placed} bounds={MAP_BOUNDS} height={340} showControls={false} onSelect={(id) => onSelect(id)} />
        </div>
      ) : (
        <Empty icon="map">No sensor node has a location yet.</Empty>
      )}
      <ul className="legend plain" aria-label="Map key">
        {Object.entries(NODE_STATE).map(([k, s]) => (
          <li key={k}><i style={{ background: s.color }} aria-hidden="true" />{s.text} <b>{count(k)}</b></li>
        ))}
      </ul>
      {unplaced.length > 0 && (
        <p className="mute small">Not on the map (no location recorded): {unplaced.map((n) => n.name).join(", ")}.</p>
      )}
    </div>
  );
}

/* ---------- readings over time (CTIP-81) ---------- */

// Axis labels: times for a short range, dates for a long one.
function tickText(t, span) {
  const day = 24 * 3600e3;
  if (span <= day) return new Date(t).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" });
  if (span <= 3 * day) return new Date(t).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return new Date(t).toLocaleDateString("en-MY", { day: "numeric", month: "short" });
}
const round = (v, digits) => String(Number(v.toFixed(digits)));

// A line chart of one reading over time. Time runs left to right across the whole chosen
// range (`start` to `end`, in ms), so quiet periods show as gaps. Hover or touch for values.
export function TimeChart({ title, unit = "", rows, field, digits = 1, limit, start, end }) {
  const [hover, setHover] = useState(null);
  const pts = rows.filter((r) => has(r[field]) && r.ts).map((r) => ({ t: Date.parse(r.ts), v: Number(r[field]), ts: r.ts }));
  if (!pts.length) {
    return (
      <figure className="tchart">
        <figcaption>{title}</figcaption>
        <Empty icon="activity">No {title.toLowerCase()} readings in this range.</Empty>
      </figure>
    );
  }

  const t0 = Math.min(start ?? pts[0].t, pts[0].t);
  const t1 = Math.max(end ?? pts.at(-1).t, pts.at(-1).t, t0 + 60e3);
  const vals = pts.map((p) => p.v);
  if (has(limit)) vals.push(Number(limit));
  const pad = (Math.max(...vals) - Math.min(...vals)) * 0.1 || 1;
  const lo = Math.min(...vals) - pad;
  const hi = Math.max(...vals) + pad;
  const X = (t) => ((t - t0) / (t1 - t0)) * 1000;
  const Y = (v) => 100 - ((v - lo) / (hi - lo)) * 100;

  // Break the line where the node sent nothing for a long time (5× its usual gap, at least 30 min).
  const steps = pts.slice(1).map((p, i) => p.t - pts[i].t).sort((a, b) => a - b);
  const maxGap = Math.max(30 * 60e3, (steps[Math.floor(steps.length / 2)] || 0) * 5);
  const lines = [[]];
  pts.forEach((p, i) => {
    if (i && p.t - pts[i - 1].t > maxGap) lines.push([]);
    lines.at(-1).push(p);
  });
  const path = (seg) => (seg.length === 1
    ? `${X(seg[0].t).toFixed(1)},${Y(seg[0].v).toFixed(2)} ${(X(seg[0].t) + 1.5).toFixed(1)},${Y(seg[0].v).toFixed(2)}`
    : seg.map((p) => `${X(p.t).toFixed(1)},${Y(p.v).toFixed(2)}`).join(" "));

  const pick = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const t = t0 + ((e.clientX - box.left) / box.width) * (t1 - t0);
    let best = pts[0];
    for (const p of pts) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
    setHover(best);
  };
  const last = pts.at(-1);
  const span = t1 - t0;
  const ticks = [0, 1 / 3, 2 / 3, 1].map((f) => t0 + f * span);

  return (
    <figure className="tchart">
      <figcaption>{title}: <b>{round(last.v, digits)}{unit}</b> <span className="mute small">latest, {fmtDateTime(last.ts)}</span></figcaption>
      <div
        className="tchart-plot"
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`${title} from ${fmtDateTime(new Date(t0).toISOString())} to ${fmtDateTime(new Date(t1).toISOString())}: lowest ${round(Math.min(...pts.map((p) => p.v)), digits)}${unit}, highest ${round(Math.max(...pts.map((p) => p.v)), digits)}${unit}, latest ${round(last.v, digits)}${unit}.`}
      >
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
          {[25, 50, 75].map((y) => <line key={y} x1="0" x2="1000" y1={y} y2={y} className="tchart-grid" />)}
          {has(limit) && <line x1="0" x2="1000" y1={Y(Number(limit))} y2={Y(Number(limit))} className="spark-limit" />}
          {lines.map((seg, i) => <polyline key={i} points={path(seg)} className="spark-line" />)}
        </svg>
        <span className="tchart-y top">{round(hi, digits)}{unit}</span>
        <span className="tchart-y bottom">{round(lo, digits)}{unit}</span>
        {hover && (
          <>
            <span className="tchart-cursor" style={{ left: `${X(hover.t) / 10}%` }} />
            <span className="tchart-dot" style={{ left: `${X(hover.t) / 10}%`, top: `${Y(hover.v)}%` }} />
            <span className={"tchart-tip" + (X(hover.t) > 650 ? " flip" : "")} style={{ left: `${X(hover.t) / 10}%` }}>
              <b>{round(hover.v, digits)}{unit}</b> {fmtDateTime(hover.ts)}
            </span>
          </>
        )}
      </div>
      <div className="tchart-x" aria-hidden="true">
        {ticks.map((t, i) => <span key={i} style={{ left: `${(i / 3) * 100}%` }}>{tickText(t, span)}</span>)}
      </div>
    </figure>
  );
}

/* ---------- webcam photos (CTIP-82) ---------- */

const PHOTOS_SHOWN = 12;
const PHOTO_RELOAD_MS = 60_000; // new photos, and fresh links before the old ones expire

// The newest photos the webcam took when this node saw movement. They come from the
// private sensor-images bucket through the API, as links that work for an hour.
export function NodeImages({ node, alerts }) {
  const { loadNodeImages } = useStore();
  const [got, setGot] = useState({ key: null, images: [], error: null });
  const [reload, setReload] = useState(0);
  const [big, setBig] = useState(null);

  useEffect(() => {
    if (!loadNodeImages) return;
    let stale = false;
    loadNodeImages(node.id, PHOTOS_SHOWN).then((res) => {
      if (!stale) setGot({ key: node.id, images: res.ok ? res.images : [], error: res.ok ? null : res.message });
    });
    return () => { stale = true; };
  }, [node.id, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setInterval(() => setReload((r) => r + 1), PHOTO_RELOAD_MS);
    return () => clearInterval(timer);
  }, []);

  const loading = got.key !== node.id;
  const alertOf = (img) => alerts.find((a) => a.id === img.alert_id);

  return (
    <div>
      <div className="row between wrap">
        <h3 className="sub">Latest photos</h3>
        <button type="button" className="btn ghost small-btn" onClick={() => setReload((r) => r + 1)}><Icon name="refresh" size={16} /> Refresh</button>
      </div>
      {loading ? (
        <p className="mute small">Loading photos…</p>
      ) : got.error ? (
        <p className="warntext small">Could not load photos: {got.error}</p>
      ) : got.images.length === 0 ? (
        <Empty icon="camera">No photos from {node.name} yet. The webcam takes one when this node detects movement.</Empty>
      ) : (
        <ul className="shots plain">
          {got.images.map((img) => (
            <li key={img.id}>
              <button type="button" className="shot" onClick={() => setBig(img)} disabled={!img.view_url} aria-label={`Enlarge photo from ${fmtDateTime(img.captured_at)}`}>
                {img.view_url ? <img src={img.view_url} alt="" loading="lazy" /> : <span className="mute small">Photo not available</span>}
              </button>
              <small className="block">{fmtDateTime(img.captured_at)}</small>
              {alertOf(img) && <small className="block warntext">{label(alertOf(img).type)}</small>}
            </li>
          ))}
        </ul>
      )}
      {big && (
        <Modal title={`${node.name} · ${fmtDateTime(big.captured_at)}`} wide="xl" onClose={() => setBig(null)}>
          <img className="shot-big" src={big.view_url} alt={`Webcam photo from ${node.name}, taken ${fmtDateTime(big.captured_at)}`} />
          {alertOf(big) && <p className="mute small gap-top-s">Taken for the alert: {label(alertOf(big).type)}.</p>}
        </Modal>
      )}
    </div>
  );
}
