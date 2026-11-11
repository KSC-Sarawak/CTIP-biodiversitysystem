// apps/web/src/pages/SensorOverview.jsx
import { useEffect, useState } from "react";
import Shell from "../components/Shell.jsx";
import Icon from "../components/Icon.jsx";
import PageHead from "../components/PageHead.jsx";
import { Chip, Empty, Mono, Pills } from "../components/Bits.jsx";
import { NodeImages, NodeMap, TimeChart } from "../components/SensorParts.jsx";
import { NODE_STATE, has, nodeState } from "../sensorState.js";
import { useConfirm } from "../useConfirm.jsx";
import { useStore } from "../../../shared/store.js";
import { nameOf, plantView, shownCoords } from "../../../shared/selectors.js";
import { isExactProtected } from "../../../shared/mapConfig.js";
import { fmtDateTime, label } from "../../../shared/utils.js";

const latest = (rows) => rows?.[rows.length - 1];
// "21.4" not "21.400000001"; "-" when the sensor sent nothing.
const num = (v, digits = 1) => (has(v) ? String(Number(Number(v).toFixed(digits))) : "-");
const motionText = (v) => (v == null ? "-" : v ? "Movement" : "None");
const HOUR = 3600e3;
const DAY = 24 * HOUR;
const MAX_RANGE_DAYS = 30; // the API's limit for one request
const RANGES = [
  { key: 24, label: "24 hours" },
  { key: 24 * 7, label: "7 days" },
  { key: 24 * 30, label: "30 days" },
  { key: "custom", label: "Choose dates" },
];
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Is a reading outside the node's alert limits?
const tooHot = (r, t) => has(r?.temperature) && has(t?.temp_max) && Number(r.temperature) > Number(t.temp_max);
const tooDry = (r, t) => has(r?.soil_moisture) && has(t?.moisture_min) && Number(r.soil_moisture) < Number(t.moisture_min);

function stats(rows, key) {
  const vals = rows.map((r) => r[key]).filter(has).map(Number);
  if (!vals.length) return null;
  return { min: Math.min(...vals), max: Math.max(...vals), avg: vals.reduce((a, b) => a + b, 0) / vals.length };
}

// The chosen custom dates as a time range (whole local days), or { error }.
function customRange({ from, to }) {
  if (!from || !to) return { error: "Pick both dates." };
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T23:59:59.999`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { error: "Pick both dates." };
  if (start > end) return { error: "The first date must be on or before the second." };
  if (end - start > MAX_RANGE_DAYS * DAY) return { error: `Pick at most ${MAX_RANGE_DAYS} days.` };
  return { start: start.getTime(), end: end.getTime() };
}

// IoT dashboard for officers and admins (the API refuses everyone else):
// - CTIP-39 map of every node with its state, and the open alerts with their handling (CTIP-78)
// - CTIP-79 each node's latest readings, kept current by the workspace poll (no page refresh)
// - CTIP-81 charts of one node's readings over a chosen time range
// - CTIP-82 the latest webcam photos for that node
export default function SensorOverview() {
  const { db, role, setThresholds, notify, loadNodeTelemetry } = useStore();
  const [nodeId, setNodeId] = useState(db.nodes?.[0]?.id || null);
  const [tab, setTab] = useState("acknowledged");
  const [range, setRange] = useState(24);
  const [dates, setDates] = useState(() => ({ from: ymd(new Date(Date.now() - 6 * DAY)), to: ymd(new Date()) }));
  const [longRange, setLongRange] = useState({ key: null, rows: [], error: null });
  const [ask, confirmDialog] = useConfirm();
  // "Now" for the rolling ranges, moved on every minute so the charts keep sliding.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const nodes = db.nodes || [];
  const telemetry = db.telemetry || {};
  const node = nodes.find((n) => n.id === nodeId) || nodes[0] || null;

  // Which time span the charts cover. The last 24 hours come live with the workspace
  // load; longer or chosen ranges are asked for per node.
  const custom = range === "custom" ? customRange(dates) : null;
  const span = custom && !custom.error ? custom : { start: now - (custom ? 24 : range) * HOUR, end: now };
  const rangeKey = !node || range === 24 || custom?.error ? null : `${node.id}:${range}:${custom ? `${custom.start}-${custom.end}` : ""}`;
  useEffect(() => {
    if (!rangeKey || !loadNodeTelemetry) return;
    let stale = false; // loading shows while longRange.key is not this range's key
    const want = custom ? { from: new Date(custom.start).toISOString(), to: new Date(custom.end).toISOString() } : range;
    loadNodeTelemetry(node.id, want).then((res) => {
      if (stale) return;
      setLongRange({ key: rangeKey, rows: res.ok ? res.rows : [], error: res.ok ? null : res.message });
    });
    return () => { stale = true; };
  }, [rangeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const data = !node || custom?.error ? [] : range === 24 ? telemetry[node.id] || [] : longRange.key === rangeKey ? longRange.rows : [];
  const loading = !!rangeKey && longRange.key !== rangeKey;
  const loadError = rangeKey && longRange.key === rangeKey ? longRange.error : null;

  // A node can be unassigned, or its plant not visible to this role: show a placeholder, never crash.
  const plantRow = (n) => db.plants.find((p) => p.id === n.specimen_id);
  const plantOf = (n) => plantView(db, plantRow(n)) || { name: "No plant assigned", qr_id: "-" };
  // Where a node is: its own installed location, else the plant it watches.
  const whereOf = (n) => {
    const p = plantRow(n);
    if (has(n.lat) && has(n.lng)) return { lat: Number(n.lat), lng: Number(n.lng), protect: p ? isExactProtected(p) : false };
    const c = p && shownCoords(p, role);
    return c ? { ...c, protect: isExactProtected(p) } : null;
  };
  const byNewest = (a, b) => b.created_at.localeCompare(a.created_at);
  const open = db.alerts.filter((a) => a.status === "open").sort(byNewest);
  const openByNode = {};
  for (const a of open) openByNode[a.node_id] = (openByNode[a.node_id] || 0) + 1;
  const history = db.alerts.filter((a) => a.status !== "open" && (tab === "all" || a.status === tab)).sort(byNewest);
  const online = nodes.filter((n) => n.status === "active").length;
  const readings24h = Object.values(telemetry).reduce((sum, rows) => sum + rows.length, 0);
  const newestTs = Object.values(telemetry).map((rows) => latest(rows)?.ts).filter(Boolean).sort().at(-1) || null;
  const outOfLimits = nodes.filter((n) => { const r = latest(telemetry[n.id]); return tooHot(r, n.thresholds) || tooDry(r, n.thresholds); }).length;

  // Open the node and bring its first open alert into view.
  const showAlerts = (n) => {
    const first = open.find((a) => a.node_id === n.id);
    document.getElementById(first ? `alert-${first.id}` : "attn")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const saveLimits = async (e) => {
    e.preventDefault();
    if (!node) return;
    const f = new FormData(e.target);
    if (!(await ask({ title: "Change alert limits", body: `Change the alert limits for ${node.name} to ${Number(f.get("temp_max"))}°C max and ${Number(f.get("moisture_min"))}% soil moisture min? New alerts will use these limits.`, confirmLabel: "Save limits" }))) return;
    setThresholds(node.id, { temp_max: Number(f.get("temp_max")), moisture_min: Number(f.get("moisture_min")) });
    notify("Limits saved");
  };

  const live = node ? latest(telemetry[node.id]) : null; // newest reading, always from the live load
  const temp = stats(data, "temperature");
  const soil = stats(data, "soil_moisture");
  const humid = stats(data, "humidity");
  const motionCount = data.filter((r) => r.motion_detected === true).length;
  const breaches = node ? data.filter((r) => tooHot(r, node.thresholds) || tooDry(r, node.thresholds)).length : 0;
  const rangeLabel = custom && !custom.error ? `${fmtDateTime(new Date(span.start).toISOString())} to ${fmtDateTime(new Date(span.end).toISOString())}` : `the last ${RANGES.find((r) => r.key === range)?.label}`;

  return (
    <Shell seg="monitoring" plain>
      {confirmDialog}
      <PageHead
        overline="Sensor network"
        title="Monitoring"
        lead={
          open.length ? `${open.length} open ${open.length === 1 ? "alert needs" : "alerts need"} your attention.`
            : nodes.length - online ? `No open alerts, but ${nodes.length - online} ${nodes.length - online === 1 ? "node is" : "nodes are"} offline or faulty.`
              : nodes.length ? "All quiet. Every node is online and no alerts are open."
                : "No sensor nodes are set up yet."
        }
        tone={open.length ? "bad" : nodes.length - online ? "warn" : nodes.length ? "ok" : "info"}
        stats={[
          { label: "Open alerts", value: open.length, tone: "bad", href: "#attn" },
          { label: `Nodes online of ${nodes.length}`, value: online },
          { label: "Offline or faulty", value: nodes.length - online, tone: "warn" },
          { label: "Outside alert limits", value: outOfLimits, tone: "warn" },
          { label: "Readings, last 24 h", value: readings24h },
        ]}
      >
        <p className="mute small"><span className="livedot" aria-hidden="true" /> Live: readings update on their own every few seconds{newestTs ? ` · newest ${fmtDateTime(newestTs)}` : ""}</p>
      </PageHead>

      <div className="monitor-top gap-section-s">
        <section className="glass pad" aria-labelledby="nodemap">
          <h2 id="nodemap">Node map</h2>
          <p className="mute small">Select a pin to see that node's readings and photos.</p>
          <NodeMap nodes={nodes} whereOf={whereOf} openByNode={openByNode} onSelect={setNodeId} />
        </section>

        <section aria-labelledby="attn-h" id="attn">
          <h2 id="attn-h">Needs attention</h2>
          {open.length === 0 ? (
            <div className="glass pad"><Empty icon="shield">No open alerts. All quiet.</Empty></div>
          ) : (
            open.map((a) => <AlertCard key={a.id} alert={a} />)
          )}
        </section>
      </div>

      <section className="gap-section-s" aria-labelledby="nodes">
        <h2 id="nodes">Sensor nodes</h2>
        {nodes.length === 0 ? (
          <div className="glass pad"><Empty icon="shield">No sensor nodes have been registered yet.</Empty></div>
        ) : (
          <div className="grid g3">
            {nodes.map((n) => {
              const last = latest(telemetry[n.id]);
              const state = nodeState(n, openByNode[n.id] || 0);
              const seen = last?.ts || n.last_seen;
              return (
                <article key={n.id} className={"glass nodecard" + (n.id === node?.id ? " on" : "") + (state === "offline" ? " down" : "") + (state === "alert" ? " alerting" : "")}>
                  <button type="button" className="nodepick" aria-pressed={n.id === node?.id} onClick={() => setNodeId(n.id)}>
                    <span className="row between"><b>{n.name}</b><span className={"dotstatus " + state}>{state === "offline" ? label(n.status) : NODE_STATE[state].text}</span></span>
                    <small className="mute">{plantOf(n).name} · <Mono>{plantOf(n).qr_id}</Mono></small>
                  </button>
                  {last ? (
                    <dl className="readings">
                      <div className={tooHot(last, n.thresholds) ? "warntext" : ""}><dt>Temp</dt><dd><Mono>{num(last.temperature)}°C</Mono></dd></div>
                      <div><dt>Humidity</dt><dd><Mono>{num(last.humidity, 0)}%</Mono></dd></div>
                      <div className={tooDry(last, n.thresholds) ? "warntext" : ""}><dt>Soil</dt><dd><Mono>{num(last.soil_moisture, 0)}%</Mono></dd></div>
                      <div><dt>Distance</dt><dd><Mono>{num(last.distance_cm)} cm</Mono></dd></div>
                      <div className={last.motion_detected ? "warntext" : ""}><dt>Motion</dt><dd>{motionText(last.motion_detected)}</dd></div>
                    </dl>
                  ) : (
                    <span className="warntext"><b>{n.last_seen ? `No readings since ${fmtDateTime(n.last_seen)}` : "No readings yet"}</b></span>
                  )}
                  <small className="mute">{n.status !== "active" ? "Check the node's battery or Wi-Fi" : seen ? `Updated ${fmtDateTime(seen)}` : "Waiting for the first reading"}</small>
                  {openByNode[n.id] > 0 && (
                    <button type="button" className="textlink warntext" onClick={() => showAlerts(n)}>
                      {openByNode[n.id]} open alert{openByNode[n.id] === 1 ? "" : "s"} <Icon name="arrowR" size={14} />
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {node && (
        <section className="glass pad gap-section-s" aria-labelledby="readings">
          <h2 id="readings">{node.name}</h2>
          <p className="mute small">{plantOf(node).name} · <Mono>{plantOf(node).qr_id}</Mono></p>

          <h3 className="sub">Right now</h3>
          {live ? (
            <>
              <div className="tiles" aria-live="polite">
                <div className={"glass tile" + (tooHot(live, node.thresholds) ? " tile-warn" : "")}><span className="mute">Temperature</span><b>{num(live.temperature)}°C</b></div>
                <div className="glass tile"><span className="mute">Humidity</span><b>{num(live.humidity, 0)}%</b></div>
                <div className={"glass tile" + (tooDry(live, node.thresholds) ? " tile-warn" : "")}><span className="mute">Soil moisture</span><b>{num(live.soil_moisture, 0)}%</b></div>
                <div className="glass tile"><span className="mute">Distance</span><b>{num(live.distance_cm)} cm</b></div>
                <div className={"glass tile" + (live.motion_detected ? " tile-warn" : "")}><span className="mute">Motion</span><b>{motionText(live.motion_detected)}</b></div>
              </div>
              <p className="mute small">Reading from {fmtDateTime(live.ts)}. This updates without refreshing the page.</p>
            </>
          ) : (
            <p className="mute">No readings from {node.name} in the last 24 hours.</p>
          )}

          <div className="row between wrap gap-top">
            <h3 className="sub">Over time</h3>
            <Pills label="Time range" value={range} onChange={setRange} items={RANGES} />
          </div>
          {range === "custom" && (
            <div className="row wrap gap-top-s">
              <label className="inline">From
                <input type="date" value={dates.from} max={dates.to || ymd(new Date())} onChange={(e) => setDates((d) => ({ ...d, from: e.target.value }))} />
              </label>
              <label className="inline">to
                <input type="date" value={dates.to} min={dates.from || undefined} max={ymd(new Date())} onChange={(e) => setDates((d) => ({ ...d, to: e.target.value }))} />
              </label>
              <span className="mute small">Up to {MAX_RANGE_DAYS} days.</span>
            </div>
          )}
          <p className="mute small">
            {custom?.error ? <span className="warntext">{custom.error}</span>
              : loading ? "Loading readings…"
              : loadError ? `Could not load readings: ${loadError}`
              : `${data.length} reading${data.length === 1 ? "" : "s"} from ${rangeLabel}`}
            {" · "}<svg width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" className="spark-limit" /></svg> alert limit
          </p>

          {!custom?.error && !loading && (
            <div className="charts">
              <TimeChart title="Temperature" unit="°C" rows={data} field="temperature" limit={node.thresholds?.temp_max} start={span.start} end={span.end} />
              <TimeChart title="Air humidity" unit="%" rows={data} field="humidity" digits={0} start={span.start} end={span.end} />
              <TimeChart title="Soil moisture" unit="%" rows={data} field="soil_moisture" digits={0} limit={node.thresholds?.moisture_min} start={span.start} end={span.end} />
              <TimeChart title="Distance to nearest object" unit=" cm" rows={data} field="distance_cm" start={span.start} end={span.end} />
            </div>
          )}

          {data.length > 0 && (
            <div className="tiles gap-top-s">
              <div className="glass tile"><span className="mute">Temperature min · avg · max</span><span><Mono>{temp ? `${num(temp.min)} · ${num(temp.avg)} · ${num(temp.max)} °C` : "-"}</Mono></span></div>
              <div className="glass tile"><span className="mute">Soil moisture min · avg · max</span><span><Mono>{soil ? `${num(soil.min, 0)} · ${num(soil.avg, 0)} · ${num(soil.max, 0)} %` : "-"}</Mono></span></div>
              <div className="glass tile"><span className="mute">Humidity min · avg · max</span><span><Mono>{humid ? `${num(humid.min, 0)} · ${num(humid.avg, 0)} · ${num(humid.max, 0)} %` : "-"}</Mono></span></div>
              <div className={"glass tile" + (breaches ? " tile-warn" : "")}><span className="mute">Outside limits · movement</span><span><Mono>{breaches} · {motionCount}</Mono> readings</span></div>
            </div>
          )}

          {data.length > 0 && (
            <details className="limits">
              <summary>Latest {Math.min(data.length, 20)} readings in this range</summary>
              <div className="tablewrap">
                <table>
                  <thead><tr><th>Time</th><th>Temp (°C)</th><th>Soil (%)</th><th>Humidity (%)</th><th>Distance (cm)</th><th>Movement</th></tr></thead>
                  <tbody>
                    {data.slice(-20).reverse().map((r) => (
                      <tr key={r.id || r.ts}>
                        <td>{fmtDateTime(r.ts)}</td>
                        <td className={tooHot(r, node.thresholds) ? "warntext" : ""}><Mono>{num(r.temperature)}</Mono></td>
                        <td className={tooDry(r, node.thresholds) ? "warntext" : ""}><Mono>{num(r.soil_moisture, 0)}</Mono></td>
                        <td><Mono>{num(r.humidity, 0)}</Mono></td>
                        <td><Mono>{num(r.distance_cm)}</Mono></td>
                        <td>{r.motion_detected == null ? "-" : r.motion_detected ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          {node.thresholds && (
            <details className="limits">
              <summary>Alert limits for {node.name} · {node.thresholds.temp_max}°C max, {node.thresholds.moisture_min}% soil min</summary>
              {role === "admin" ? (<form key={node.id} className="row wrap" onSubmit={saveLimits}>
                <label>Temperature max (°C)<input name="temp_max" type="number" step="0.5" defaultValue={node.thresholds.temp_max} /></label>
                <label>Soil moisture min (%)<input name="moisture_min" type="number" step="1" defaultValue={node.thresholds.moisture_min} /></label>
                <button className="btn ghost" type="submit"><Icon name="check" size={18} /> Save limits</button>
              </form>) : <p className="mute small">Only an admin can change these limits.</p>}
            </details>
          )}

          <div className="gap-top">
            <NodeImages node={node} alerts={db.alerts} />
          </div>
        </section>
      )}

      <section className="gap-section-s" aria-labelledby="history">
        <h2 id="history">Alert history</h2>
        <div className="row wrap gap-bottom">
          <Pills label="Alert history" value={tab} onChange={setTab} items={["acknowledged", "resolved", "all"].map((t) => ({ key: t, label: label(t) }))} />
        </div>
        {history.length === 0 && <div className="glass pad"><Empty icon="shield">No {tab === "all" ? "" : tab} alerts.</Empty></div>}
        {history.map((a) => <AlertCard key={a.id} alert={a} />)}
      </section>
    </Shell>
  );
}

// Assign -> Acknowledge -> Resolve, so officers can see where an alert is.
const STEPS = ["Assign", "Acknowledge", "Resolve"];
function stepOf(alert) {
  if (alert.status === "resolved") return 3;
  if (alert.status === "acknowledged") return 2;
  return alert.assigned_to ? 1 : 0;
}

function AlertCard({ alert }) {
  const { db, ackAlert, resolveAlert, assignAlert, addAlertNote, notify } = useStore();
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [ask, confirmDialog] = useConfirm();
  const node = db.nodes.find((n) => n.id === alert.node_id);

  const resolve = async () => {
    if (!outcome.trim()) return notify("Write what was found first");
    if (!(await ask({ title: "Resolve alert", body: `Mark this ${alert.type} alert as resolved? It will leave the open list and its outcome (“${outcome.trim()}”) is recorded.`, confirmLabel: "Resolve alert" }))) return;
    resolveAlert(alert.id, outcome.trim());
    notify("Alert resolved");
  };
  const notes = db.alertNotes.filter((n) => n.alert_id === alert.id);
  const officers = db.profiles.filter((p) => p.role === "officer" && p.is_active);

  return (
    <article id={`alert-${alert.id}`} className={"glass record sev-" + alert.severity}>
      {confirmDialog}
      <header>
        <div>
          <b>{alert.type}</b>
          <small className="mute block">{node?.name || "Unknown node"} · {fmtDateTime(alert.created_at)}</small>
        </div>
        <span className="row"><Chip value={alert.severity} /><Chip value={alert.status} /></span>
      </header>

      <p className="mute small">
        {node?.name || "Unknown node"}'s reading: {Object.entries(alert.reading || {}).map(([k, v], i) => <span key={k}>{i > 0 && " · "}{label(k)} <Mono>{v}</Mono></span>)}
      </p>

      <ol className="progress" aria-label="Alert progress">
        {STEPS.map((s, i) => (
          <li key={s} className={i < stepOf(alert) ? "done" : i === stepOf(alert) ? "now" : ""}>{i + 1} · {s}</li>
        ))}
      </ol>

      <div className="row wrap">
        <label className="inline">Assigned to
          <select value={alert.assigned_to || ""} onChange={(e) => { assignAlert(alert.id, e.target.value); notify("Alert assigned"); }}>
            {officers.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
          </select>
        </label>
        {alert.status === "open" && <button className="btn" onClick={() => { ackAlert(alert.id); notify("Alert acknowledged"); }}><Icon name="check" size={18} /> Acknowledge</button>}
      </div>
      {alert.acknowledged_by && <p className="mute small">Acknowledged by {nameOf(db, alert.acknowledged_by)} · {fmtDateTime(alert.acknowledged_at)}</p>}

      <ul className="plain thread">
        {notes.map((n) => <li key={n.id}><b>{nameOf(db, n.author_id)}</b>{n.note}<small className="mute block">{fmtDateTime(n.created_at)}</small></li>)}
      </ul>

      {alert.status === "resolved" ? (
        <p className="mute">Outcome: {alert.outcome}</p>
      ) : (
        <>
          <div className="row">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an investigation note" aria-label="Investigation note" />
            <button className="btn ghost" onClick={() => { if (note.trim()) { addAlertNote(alert.id, note.trim()); setNote(""); } }}><Icon name="plus" size={18} /> Add note</button>
          </div>
          <div className="row gap-top-s">
            <input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="What was found? (needed to resolve)" aria-label="Outcome" />
            <button className="btn" onClick={resolve}><Icon name="shield" size={18} /> Resolve</button>
          </div>
        </>
      )}
    </article>
  );
}
