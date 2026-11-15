// apps/web/src/pages/SensorOverview.jsx
// IoT dashboard for officers and admins (the API refuses everyone else). Laid out so the
// most urgent thing is read first, then the detail:
//   1. the header: one sentence on what needs doing, and four numbers;
//   2. Sensor nodes: the map (CTIP-39), then every node's latest readings in one row each (CTIP-79);
//   3. the chosen node: charts over a chosen time range with out-of-range parts in red
//      (CTIP-81), then its webcam photos (CTIP-82), then the time range controls;
//   4. Alerts (CTIP-78): open ones first, then acknowledged and resolved, with the alert
//      rules underneath as a reference.
// Readings stay current through the workspace poll, with no page refresh.
import { useEffect, useMemo, useState } from "react";
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
import { SENSOR_FIELDS, fixedRanges, outOfRange, rangeState, rangeText } from "../../../shared/sensorLimits.js";
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
// The slider's stops, in hours: 1 hour up to the API's 30 days.
const SLIDER_HOURS = [1, 2, 3, 6, 12, 24, 48, 72, 120, 168, 336, 504, 720];
const hoursLabel = (h) => (h <= 24 ? `${h} hour${h === 1 ? "" : "s"}` : `${h / 24} days`);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// "just now", "12 min ago", "3 h ago", else the date.
function ago(iso, now = Date.now()) {
  const m = Math.round((now - Date.parse(iso)) / 60e3);
  if (!Number.isFinite(m)) return "";
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 24 * 60) return `${Math.round(m / 60)} h ago`;
  return fmtDateTime(iso);
}

// The custom dates as a time range (whole local days), or { error }.
function customRange({ from, to }) {
  if (!from || !to) return { error: "Pick both dates." };
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T23:59:59.999`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { error: "Pick both dates." };
  if (start > end) return { error: "The first date must be on or before the second." };
  if (end - start > MAX_RANGE_DAYS * DAY) return { error: `Pick at most ${MAX_RANGE_DAYS} days.` };
  return { start: start.getTime(), end: end.getTime() };
}

export default function SensorOverview() {
  const { db, role, loadNodeTelemetry } = useStore();
  const [renaming, setRenaming] = useState(null); // id of the node whose name is being edited
  const [nodeId, setNodeId] = useState(db.nodes?.[0]?.id || null);
  const [tab, setTab] = useState("open"); // which alerts the Alerts section lists
  const [range, setRange] = useState(24);
  const [dates, setDates] = useState(() => ({ from: ymd(new Date(Date.now() - 6 * DAY)), to: ymd(new Date()) }));
  const [longRange, setLongRange] = useState({ key: null, rows: [], error: null });
  // "Now" for the rolling ranges, moved on every minute so the charts keep sliding.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Each person can give a node their own name; the technical name stays as IoT management set it.
  const nicknames = db.nodeNicknames;
  const stableRanges = db.stableRanges;
  // The preset stable range, the same for every node (apps/shared/config/sensorStableRanges.json).
  const preset = useMemo(() => fixedRanges({ stableRanges }), [stableRanges]);
  const off = (r, field) => !!rangeState(r, field, preset);
  const nodes = useMemo(() => (db.nodes || []).map((n) => ({ ...n, techName: n.name, name: nicknames?.[n.id] || n.name })), [db.nodes, nicknames]);
  const telemetry = db.telemetry || {};
  const node = nodes.find((n) => n.id === nodeId) || nodes[0] || null;

  // Which time span the charts cover. Up to the last 24 hours comes live with the workspace
  // load; longer or chosen ranges are asked for per node.
  const custom = range === "custom" ? customRange(dates) : null;
  const span = custom && !custom.error ? custom : { start: now - (custom ? 24 : range) * HOUR, end: now };
  const liveWindow = !custom && range <= 24;
  const rangeKey = !node || liveWindow || custom?.error ? null : `${node.id}:${range}:${custom ? `${custom.start}-${custom.end}` : ""}`;
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

  const data = !node || custom?.error ? []
    : liveWindow ? (telemetry[node.id] || []).filter((r) => Date.parse(r.ts) >= span.start)
      : longRange.key === rangeKey ? longRange.rows : [];
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
  const listed = db.alerts.filter((a) => tab === "all" || a.status === tab).sort(byNewest);
  const countOf = (status) => db.alerts.filter((a) => status === "all" || a.status === status).length;
  const online = nodes.filter((n) => n.status === "active").length;
  const down = nodes.length - online;
  const readings24h = Object.values(telemetry).reduce((sum, rows) => sum + rows.length, 0);
  const newestTs = Object.values(telemetry).map((rows) => latest(rows)?.ts).filter(Boolean).sort().at(-1) || null;
  const outOfLimits = nodes.filter((n) => outOfRange(latest(telemetry[n.id]), preset)).length;
  // Nodes with something wrong first, then by name, so the eye lands on them.
  const rank = (n) => ({ alert: 0, offline: 1, online: 2 })[nodeState(n, openByNode[n.id] || 0)];
  const sortedNodes = [...nodes].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  const goTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  // Open the node and bring its first open alert into view.
  // Show the open alerts, and bring this node's first one into view (after the tab has drawn).
  const showAlerts = (n) => {
    const first = n && open.find((a) => a.node_id === n.id);
    setTab("open");
    setTimeout(() => goTo(first ? `alert-${first.id}` : "alerts"), 50);
  };
  const pickNode = (id) => { setNodeId(id); if (renaming && renaming !== id) setRenaming(null); };

  const live = node ? latest(telemetry[node.id]) : null; // newest reading, always from the live load
  const motionCount = data.filter((r) => r.motion_detected === true).length;
  const breaches = data.filter((r) => outOfRange(r, preset)).length;
  const rangeLabel = custom && !custom.error ? `${fmtDateTime(new Date(span.start).toISOString())} to ${fmtDateTime(new Date(span.end).toISOString())}` : `the last ${hoursLabel(range)}`;
  const nodeStateOf = (n) => nodeState(n, openByNode[n.id] || 0);

  return (
    <Shell seg="monitoring" plain>
      <PageHead
        overline="Sensor network"
        title="Monitoring"
        lead={
          open.length ? `${open.length} open ${open.length === 1 ? "alert needs" : "alerts need"} your attention.`
            : down ? `No open alerts, but ${down} ${down === 1 ? "node is" : "nodes are"} offline or faulty.`
              : nodes.length ? "All quiet. Every node is online and no alerts are open."
                : "No sensor nodes are set up yet."
        }
        tone={open.length ? "bad" : down ? "warn" : nodes.length ? "ok" : "info"}
        stats={[
          { label: "Open alerts", value: open.length, tone: "bad", onClick: () => showAlerts(null) },
          { label: `Nodes online of ${nodes.length}`, value: online },
          { label: "Offline or faulty", value: down, tone: "warn" },
          { label: "Outside stable range", value: outOfLimits, tone: "warn" },
        ]}
      >
        <p className="mute small">
          <span className="livedot" aria-hidden="true" /> Live: updates every few seconds
          {newestTs ? ` · newest reading ${ago(newestTs, now)}` : ""} · {readings24h} readings in the last 24 h
        </p>
      </PageHead>

      {/* 1. Every node at a glance */}
      <section className="gap-section-s" aria-labelledby="nodes">
        <h2 id="nodes">Sensor nodes</h2>
        {nodes.length === 0 ? (
          <div className="glass pad"><Empty icon="shield">No sensor nodes have been registered yet.</Empty></div>
        ) : (
          <>
          <div className="glass pad nodemap-card">
            <NodeMap nodes={nodes} whereOf={whereOf} plantOf={plantOf} openByNode={openByNode} selectedId={node?.id} onSelect={pickNode} />
          </div>
          <p className="mute small">Select a pin or a row to see that node's readings and photos.</p>
          <div className="nodelist">
            {sortedNodes.map((n) => {
              const last = latest(telemetry[n.id]);
              const state = nodeStateOf(n);
              const seen = last?.ts || n.last_seen;
              return (
                // The whole row picks the node; its button keeps it reachable by keyboard.
                <article key={n.id} className={"glass nodecard" + (n.id === node?.id ? " on" : "") + (state === "offline" ? " down" : "") + (state === "alert" ? " alerting" : "")}
                  onClick={() => pickNode(n.id)}>
                  <button type="button" className="nodepick" aria-pressed={n.id === node?.id}>
                    <b className="nodecard-name">{n.name}</b>
                    {n.name !== n.techName && <small className="mute">Technical name: <Mono>{n.techName}</Mono></small>}
                    <small className="mute">{plantOf(n).name} · <Mono>{plantOf(n).qr_id}</Mono></small>
                  </button>
                  {last ? (
                    <dl className="readings">
                      <div className={off(last, "temperature") ? "warntext" : ""}><dt>Temp</dt><dd><Mono>{num(last.temperature)}°C</Mono></dd></div>
                      <div className={off(last, "humidity") ? "warntext" : ""}><dt>Humidity</dt><dd><Mono>{num(last.humidity, 0)}%</Mono></dd></div>
                      <div className={off(last, "soil_moisture") ? "warntext" : ""}><dt>Soil</dt><dd><Mono>{num(last.soil_moisture, 0)}%</Mono></dd></div>
                      <div><dt>Distance</dt><dd><Mono>{num(last.distance_cm)} cm</Mono></dd></div>
                      <div className={last.motion_detected ? "warntext" : ""}><dt>Motion</dt><dd>{motionText(last.motion_detected)}</dd></div>
                    </dl>
                  ) : (
                    <p className="nodecard-none warntext"><b>{n.last_seen ? `No readings since ${fmtDateTime(n.last_seen)}` : "No readings yet"}</b></p>
                  )}
                  <div className="nodecard-status">
                    <span className={"dotstatus " + state}>{state === "offline" ? label(n.status) : NODE_STATE[state].text}</span>
                    <small className="mute">{n.status !== "active" ? "Check battery or Wi-Fi" : seen ? `Updated ${ago(seen, now)}` : "Waiting for the first reading"}</small>
                    {openByNode[n.id] > 0 && (
                      <button type="button" className="textlink warntext" onClick={(e) => { e.stopPropagation(); pickNode(n.id); showAlerts(n); }}>
                        {openByNode[n.id]} open alert{openByNode[n.id] === 1 ? "" : "s"} <Icon name="arrowR" size={14} />
                      </button>
                    )}
                  </div>
                  <button type="button" className="iconbtn" aria-label={`Rename ${n.name}`} title="Rename (only you see this name)"
                    onClick={(e) => { e.stopPropagation(); setNodeId(n.id); setRenaming(n.id); goTo("readings"); }}>
                    <Icon name="pencil" size={16} />
                  </button>
                </article>
              );
            })}
          </div>
          </>
        )}
      </section>

      {/* 2. The chosen node in detail */}
      {node && (
        <section className="glass pad gap-section-s nodedetail" aria-labelledby="readings">
          <header className="nodedetail-head">
            <div>
              <p className="overline">Selected node</p>
              <div className="row wrap nodename">
                <h2 id="readings">{node.name}</h2>
                <span className={"dotstatus " + nodeStateOf(node)}>{nodeStateOf(node) === "offline" ? label(node.status) : NODE_STATE[nodeStateOf(node)].text}</span>
                {renaming !== node.id && (
                  <button type="button" className="btn ghost small-btn" onClick={() => setRenaming(node.id)}>
                    <Icon name="pencil" size={16} /> Rename
                  </button>
                )}
              </div>
              <p className="mute small">
                {node.name !== node.techName && <>Technical name <Mono>{node.techName}</Mono> · </>}
                {plantOf(node).name} · <Mono>{plantOf(node).qr_id}</Mono>
              </p>
            </div>
          </header>
          {renaming === node.id && <RenameNode key={node.id} node={node} onDone={() => setRenaming(null)} />}

          {/* The latest reading, kept small: the node rows above show it too. */}
          {live ? (
            <div className="nowstrip" aria-live="polite">
              <span className="nowstrip-when mute small">Latest reading · {ago(live.ts, now)}</span>
              <dl>
                {[
                  ["temperature", `${num(live.temperature)}°C`],
                  ["humidity", `${num(live.humidity, 0)}%`],
                  ["soil_moisture", `${num(live.soil_moisture, 0)}%`],
                ].map(([f, text]) => {
                  const state = rangeState(live, f, preset);
                  return (
                    <div key={f} className={"nowitem" + (state ? " is-off" : "")}>
                      <dt>{SENSOR_FIELDS[f].label}</dt>
                      <dd><b>{text}</b> <small>{state ? `${state === "high" ? "Above" : "Below"} range · ` : "Range "}{rangeText(preset[f], SENSOR_FIELDS[f].unit)}</small></dd>
                    </div>
                  );
                })}
                <div className="nowitem"><dt>Distance</dt><dd><b>{num(live.distance_cm)} cm</b></dd></div>
                <div className={"nowitem" + (live.motion_detected ? " is-off" : "")}><dt>Motion</dt><dd><b>{motionText(live.motion_detected)}</b></dd></div>
              </dl>
            </div>
          ) : (
            <p className="mute">No readings from {node.name} in the last 24 hours.</p>
          )}

          <div className="nodedetail-body">
            {/* 1. Graphs: the main thing to read */}
            <div className="nodedetail-main">
              <h3 className="sub" id="overtime">Readings over time</h3>
              <p className="mute small rangesummary">
                {custom?.error ? <span className="warntext">{custom.error}</span>
                  : loading ? "Loading readings…"
                  : loadError ? `Could not load readings: ${loadError}`
                  : <>
                      {data.length} reading{data.length === 1 ? "" : "s"} from {rangeLabel}
                      {data.length > 0 && <> · <span className={breaches ? "badtext" : ""}>{breaches} outside the stable range</span> · {motionCount} with movement</>}
                    </>}
              </p>
              <p className="chartkey mute small" aria-hidden="true">
                <span><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" className="spark-limit" /></svg> stable range</span>
                <span><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" className="spark-line" /></svg> in range</span>
                <span><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" className="spark-line spark-bad" /></svg> outside the range</span>
              </p>

              {!custom?.error && !loading && (
                <div className="charts">
                  <TimeChart title="Temperature" unit="°C" rows={data} field="temperature" limit={[preset.temperature.min, preset.temperature.max]} start={span.start} end={span.end} />
                  <TimeChart title="Air humidity" unit="%" rows={data} field="humidity" digits={0} limit={[preset.humidity.min, preset.humidity.max]} start={span.start} end={span.end} />
                  <TimeChart title="Soil moisture" unit="%" rows={data} field="soil_moisture" digits={0} limit={[preset.soil_moisture.min, preset.soil_moisture.max]} start={span.start} end={span.end} />
                  <TimeChart title="Distance to nearest object" unit=" cm" rows={data} field="distance_cm" start={span.start} end={span.end} />
                </div>
              )}

              {/* 3. The time range, under the graphs it changes */}
              <div className="rangebar">
                <span className="rangebar-title">Time range</span>
                <Pills label="Time range" value={range} onChange={setRange} items={RANGES} />
                {range === "custom" ? (
                  <div className="row wrap rangebar-dates">
                    <label className="inline">From
                      <input type="date" value={dates.from} max={dates.to || ymd(new Date())} onChange={(e) => setDates((d) => ({ ...d, from: e.target.value }))} />
                    </label>
                    <label className="inline">to
                      <input type="date" value={dates.to} min={dates.from || undefined} max={ymd(new Date())} onChange={(e) => setDates((d) => ({ ...d, to: e.target.value }))} />
                    </label>
                    <span className="mute small">Up to {MAX_RANGE_DAYS} days.</span>
                  </div>
                ) : (
                  <RangeSlider hours={range} onChange={setRange} />
                )}
              </div>

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
                            <td className={off(r, "temperature") ? "badtext" : ""}><Mono>{num(r.temperature)}</Mono></td>
                            <td className={off(r, "soil_moisture") ? "badtext" : ""}><Mono>{num(r.soil_moisture, 0)}</Mono></td>
                            <td className={off(r, "humidity") ? "badtext" : ""}><Mono>{num(r.humidity, 0)}</Mono></td>
                            <td><Mono>{num(r.distance_cm)}</Mono></td>
                            <td>{r.motion_detected == null ? "-" : r.motion_detected ? "Yes" : "No"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>

            {/* 2. The webcam photos */}
            <aside className="nodedetail-side" aria-label="Webcam photos">
              <NodeImages node={node} alerts={db.alerts} />
            </aside>
          </div>
        </section>
      )}

      {/* 3. Alerts: open ones by default, then what happened before */}
      <section className="gap-section-s" aria-labelledby="alerts-h" id="alerts">
        <div className="row between wrap sectionhead">
          <h2 id="alerts-h">Alerts</h2>
          <Pills label="Show alerts" value={tab} onChange={setTab}
            items={["open", "acknowledged", "resolved", "all"].map((t) => ({ key: t, label: label(t), count: countOf(t) }))} />
        </div>
        {listed.length === 0 ? (
          tab === "open"
            ? <p className="allquiet"><Icon name="check" size={18} /> No open alerts. All quiet.</p>
            : <p className="allquiet neutral">No {tab === "all" ? "" : tab} alerts.</p>
        ) : (
          <div className="alertgrid">{listed.map((a) => <AlertCard key={a.id} alert={a} nodes={nodes} />)}</div>
        )}

        {/* Reference only: what opens an alert */}
        <div className="alertrules" aria-label="Alert rules">
          <span className="alertrules-lead">Alert rules</span>
          <ul className="plain">
            {Object.entries(SENSOR_FIELDS).map(([f, r]) => (
              <li key={f}><span>{r.label}</span> <Mono>{rangeText(preset[f], r.unit)}</Mono></li>
            ))}
          </ul>
          <span className="mute small">A reading outside its range opens one alert per node and problem (repeats are not counted while it is open), and every officer and admin is notified. Same range for every node.</span>
        </div>
      </section>
    </Shell>
  );
}

// The time range as a slider, from 1 hour to 30 days. Dragging only moves the label;
// the range is applied once the slider rests, so a drag does not ask the API for every stop.
function RangeSlider({ hours, onChange }) {
  const stopOf = (h) => SLIDER_HOURS.reduce((best, v, i) => (Math.abs(v - h) < Math.abs(SLIDER_HOURS[best] - h) ? i : best), 0);
  const [draft, setDraft] = useState(null); // the stop being dragged to, until it is applied
  const stop = draft ?? stopOf(hours);
  useEffect(() => {
    if (draft == null) return;
    const timer = setTimeout(() => { setDraft(null); onChange(SLIDER_HOURS[draft]); }, 300);
    return () => clearTimeout(timer);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps
  const text = hoursLabel(SLIDER_HOURS[stop]);
  return (
    <div className="rangeslider">
      <label htmlFor="range-slider">Show the last <b>{text}</b></label>
      <span className="mute small" aria-hidden="true">1 h</span>
      <input id="range-slider" type="range" min={0} max={SLIDER_HOURS.length - 1} step={1} value={stop}
        aria-valuetext={text} onChange={(e) => setDraft(Number(e.target.value))} />
      <span className="mute small" aria-hidden="true">30 d</span>
    </div>
  );
}

// Your own name for a node. Only you see it; empty goes back to the technical name.
function RenameNode({ node, onDone }) {
  const { setNodeNickname, notify } = useStore();
  const nicknamed = node.name !== node.techName;
  const [text, setText] = useState(nicknamed ? node.name : "");
  const [busy, setBusy] = useState(false);
  const save = async (value) => {
    setBusy(true);
    const ok = await setNodeNickname(node.id, value);
    setBusy(false);
    if (!ok) return;
    notify(value.trim() ? "Node renamed. Only you see this name." : "Back to the technical name");
    onDone();
  };
  return (
    <form className="row wrap renameform" onSubmit={(e) => { e.preventDefault(); save(text); }}
      onKeyDown={(e) => { if (e.key === "Escape") onDone(); }}>
      <label className="inline">Your name for this node
        <input value={text} maxLength={60} autoFocus placeholder={node.techName} onChange={(e) => setText(e.target.value)} />
      </label>
      <button className="btn" type="submit" disabled={busy}><Icon name="check" size={18} /> Save</button>
      {nicknamed && <button className="btn ghost" type="button" disabled={busy} onClick={() => save("")}>Use technical name</button>}
      <button className="btn ghost" type="button" disabled={busy} onClick={onDone}>Cancel</button>
      <span className="mute small">Only you see this name. Technical name: <Mono>{node.techName}</Mono></span>
    </form>
  );
}

// Assign -> Acknowledge -> Resolve, so officers can see where an alert is.
const STEPS = ["Assign", "Acknowledge", "Resolve"];
function stepOf(alert) {
  if (alert.status === "resolved") return 3;
  if (alert.status === "acknowledged") return 2;
  return alert.assigned_to ? 1 : 0;
}

// One alert: what, where and how bad on top, the next step as one button, and the
// investigation (notes, outcome) folded away until it is needed.
function AlertCard({ alert, nodes }) {
  const { db, ackAlert, resolveAlert, assignAlert, addAlertNote, notify } = useStore();
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [ask, confirmDialog] = useConfirm();
  const node = (nodes || db.nodes).find((n) => n.id === alert.node_id);
  const nodeName = node?.name || alert.reading?.node || "Unknown node";

  const resolve = async () => {
    if (!outcome.trim()) return notify("Write what was found first");
    if (!(await ask({ title: "Resolve alert", body: `Mark this ${alert.type} alert as resolved? It will leave the open list and its outcome (“${outcome.trim()}”) is recorded.`, confirmLabel: "Resolve alert" }))) return;
    resolveAlert(alert.id, outcome.trim());
    notify("Alert resolved");
  };
  const notes = db.alertNotes.filter((n) => n.alert_id === alert.id);
  const officers = db.profiles.filter((p) => p.role === "officer" && p.is_active);
  const values = Object.entries(alert.reading || {}).filter(([k]) => k !== "node" && k !== "stable_range");
  const range = alert.reading?.stable_range;

  return (
    <article id={`alert-${alert.id}`} className={"glass record alertcard sev-" + alert.severity}>
      {confirmDialog}
      <header>
        <div>
          <b className="alertcard-title">{alert.type}</b>
          <small className="mute block">{node ? nodeName : "Unknown node"} · {fmtDateTime(alert.created_at)}</small>
        </div>
        <span className="row"><Chip value={alert.severity} /><Chip value={alert.status} /></span>
      </header>

      {(values.length > 0 || range) && (
        <p className="alertcard-reading">
          {values.map(([k, v], i) => <span key={k}>{i > 0 && " · "}{label(k)} <Mono><b>{v}</b></Mono></span>)}
          {range && <span className="mute"> · stable range <Mono>{range}</Mono></span>}
        </p>
      )}

      <ol className="progress" aria-label="Alert progress">
        {STEPS.map((s, i) => (
          <li key={s} className={i < stepOf(alert) ? "done" : i === stepOf(alert) ? "now" : ""}>{i + 1} · {s}</li>
        ))}
      </ol>

      {alert.status === "resolved" ? (
        <p className="mute">Outcome: {alert.outcome}</p>
      ) : (
        <>
          <div className="row wrap alertcard-acts">
            <label className="inline">Assigned to
              <select value={alert.assigned_to || ""} onChange={(e) => { assignAlert(alert.id, e.target.value); notify("Alert assigned"); }}>
                {!alert.assigned_to && <option value="">Nobody yet</option>}
                {officers.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
              </select>
            </label>
            {alert.status === "open" && <button className="btn" onClick={() => { ackAlert(alert.id); notify("Alert acknowledged"); }}><Icon name="check" size={18} /> Acknowledge</button>}
          </div>
          {alert.acknowledged_by && <p className="mute small">Acknowledged by {nameOf(db, alert.acknowledged_by)} · {fmtDateTime(alert.acknowledged_at)}</p>}
          <details className="alertcard-more">
            <summary>Notes and resolve{notes.length ? ` (${notes.length} note${notes.length === 1 ? "" : "s"})` : ""}</summary>
            <ul className="plain thread">
              {notes.map((n) => <li key={n.id}><b>{nameOf(db, n.author_id)}</b>{n.note}<small className="mute block">{fmtDateTime(n.created_at)}</small></li>)}
            </ul>
            <div className="row">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an investigation note" aria-label="Investigation note" />
              <button className="btn ghost" onClick={() => { if (note.trim()) { addAlertNote(alert.id, note.trim()); setNote(""); } }}><Icon name="plus" size={18} /> Add note</button>
            </div>
            <div className="row gap-top-s">
              <input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="What was found? (needed to resolve)" aria-label="Outcome" />
              <button className="btn" onClick={resolve}><Icon name="shield" size={18} /> Resolve</button>
            </div>
          </details>
        </>
      )}
      {alert.status === "resolved" && notes.length > 0 && (
        <ul className="plain thread">
          {notes.map((n) => <li key={n.id}><b>{nameOf(db, n.author_id)}</b>{n.note}<small className="mute block">{fmtDateTime(n.created_at)}</small></li>)}
        </ul>
      )}
    </article>
  );
}
