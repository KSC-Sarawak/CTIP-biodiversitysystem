// apps/web/src/pages/SensorNodes.jsx
// Admin page for the sensor nodes (CTIP-48): register a node, change where it
// is or which plant it guards, turn it off, and choose which officers and
// admins hear about which nodes' alerts, from which severity up.
// The database does the alerting; see supabase/migrations/*silent_moved_alerts_and_routing.sql.
import { useEffect, useState } from "react";
import Shell from "../components/Shell.jsx";
import Icon from "../components/Icon.jsx";
import PageHead from "../components/PageHead.jsx";
import { Chip, Mono, Modal } from "../components/Bits.jsx";
import { useConfirm } from "../useConfirm.jsx";
import { useStore } from "../../../shared/store.js";
import { ROLE_LABEL } from "../../../shared/permissions.js";
import { fmtDateTime } from "../../../shared/utils.js";

const STATUS_TEXT = { active: "Online", offline: "Offline", maintenance: "Maintenance", retired: "Turned off" };
const SEVERITY_TEXT = { low: "Every alert", medium: "Medium and up", high: "High and up", critical: "Critical only" };

// "3.81234" -> 3.81234; blank or out of range -> null.
const coord = (text, max) => {
  const n = Number(String(text).trim());
  return String(text).trim() !== "" && Number.isFinite(n) && Math.abs(n) <= max ? n : null;
};

export default function SensorNodes() {
  const { db, createNode, updateNode, loadAlertRoutes, setAlertRoute } = useStore();
  const [ask, confirmDialog] = useConfirm();
  const [editing, setEditing] = useState(null); // a node, or "new"
  const [justMade, setJustMade] = useState(null);
  const [routes, setRoutes] = useState(null); // null while loading
  const [routeProblem, setRouteProblem] = useState("");
  const [routing, setRouting] = useState(null); // the person whose routing is open

  // Your own name for a node when you gave one, as on Monitoring.
  const nodes = (db.nodes || []).map((n) => ({ ...n, name: db.nodeNicknames?.[n.id] || n.name }));
  const plants = db.plants || [];
  const speciesName = (id) => (db.species || []).find((s) => s.id === id)?.scientific_name;
  const plantLabel = (p) => (p ? `${p.qr_id || "No tag"} · ${speciesName(p.species_id) || p.proposed_species || "Species not set"}` : "");
  const staff = (db.profiles || []).filter((p) => ["officer", "admin"].includes(p.role) && p.is_active !== false && !p.deleted_at)
    .sort((a, b) => (a.full_name || a.email || "").localeCompare(b.full_name || b.email || ""));
  const count = (s) => nodes.filter((n) => n.status === s).length;

  // Loaded when the page opens and after each save. Keyed on a counter, not on
  // loadAlertRoutes, which is a new function on every render.
  const [routesVersion, setRoutesVersion] = useState(0);
  const reloadRoutes = () => setRoutesVersion((v) => v + 1);
  useEffect(() => {
    let current = true;
    loadAlertRoutes().then((res) => {
      if (!current) return;
      if (res.ok) { setRoutes(res.rows); setRouteProblem(""); } else { setRoutes([]); setRouteProblem(res.message); }
    });
    return () => { current = false; };
  }, [routesVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const turnOff = async (n) => {
    const ok = await ask({
      title: "Turn off sensor node",
      body: <p>Turn off <b>{n.name}</b>? Its readings and photos will be refused and it will not raise a silent alert. You can turn it back on later.</p>,
      confirmLabel: "Turn off",
      danger: true,
    });
    if (ok) updateNode(n.id, { status: "retired" }, `${n.name} turned off`);
  };

  return (
    <Shell seg="nodes">
      {confirmDialog}
      <PageHead
        overline="Admin dashboard"
        title="Sensor nodes"
        lead={count("offline") ? `${count("offline")} ${count("offline") === 1 ? "node has" : "nodes have"} stopped sending readings.` : "Register nodes, say where they are and who hears about their alerts."}
        tone={count("offline") ? "warn" : "ok"}
        stats={[
          { label: "Online", value: count("active") },
          { label: "Offline", value: count("offline"), tone: count("offline") ? "warn" : undefined },
          { label: "Maintenance", value: count("maintenance") },
          { label: "Turned off", value: count("retired") },
        ]}
      />

      <div className="row wrap" style={{ margin: "8px 0 16px" }}>
        <button className="btn" type="button" onClick={() => setEditing("new")}><Icon name="plus" size={18} /> Register node</button>
      </div>

      {justMade && (
        <div className="glass pad" role="status" style={{ marginBottom: 16 }}>
          <p><b>Node registered.</b> Set this id as <Mono>node_id</Mono> on the gateway for the new node:</p>
          <p><Mono className="newnodeid">{justMade.id}</Mono></p>
          <button className="btn ghost small-btn" type="button" onClick={() => setJustMade(null)}>Done</button>
        </div>
      )}

      <div className="tablewrap roomy">
        <table className="nodestable">
          <thead><tr><th>Node</th><th>Status</th><th>Guards</th><th>Installed at</th><th>Last reading</th><th><span className="sr">Actions</span></th></tr></thead>
          <tbody>
            {nodes.length === 0 && <tr><td colSpan={6} className="mute">No sensor nodes yet. Register the first one.</td></tr>}
            {nodes.map((n) => (
              <tr key={n.id}>
                <td><b>{n.name}</b><Mono className="block small">{n.id}</Mono></td>
                <td><Chip value={n.status}>{STATUS_TEXT[n.status] || n.status}</Chip></td>
                <td>{plantLabel(plants.find((p) => p.id === n.specimen_id)) || <span className="mute">-</span>}</td>
                <td>{n.lat != null && n.lng != null ? <Mono>{n.lat.toFixed(5)}, {n.lng.toFixed(5)}</Mono> : <span className="mute">Not set</span>}</td>
                <td>{n.last_seen ? fmtDateTime(n.last_seen) : <span className="mute">Never</span>}</td>
                <td className="actions">
                  <button className="btn ghost small-btn" type="button" onClick={() => setEditing(n)} aria-label={`Edit ${n.name}`}><Icon name="pencil" size={16} /> Edit</button>
                  {n.status === "retired"
                    ? <button className="btn ghost small-btn" type="button" onClick={() => updateNode(n.id, { status: "active" }, `${n.name} turned back on`)}>Turn on</button>
                    : <button className="btn ghost small-btn" type="button" onClick={() => turnOff(n)}><Icon name="x" size={16} /> Turn off</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mute small">A node with no reading for 15 minutes is marked offline and raises a <b>Node silent</b> alert; its next reading puts it back online.
        A node that reports a position 50 m or more from where it was installed raises <b>Node moved</b>. Alerts never include coordinates.</p>

      <h3 className="sub" style={{ marginTop: 28 }}><Icon name="bell" size={18} /> Who hears about alerts</h3>
      <p className="mute">Each officer and admin hears about every alert unless you narrow it here. The choice applies to app notifications and phone pushes.</p>
      {routeProblem && <p className="fielderr" role="alert">Could not load the alert routing: {routeProblem}</p>}
      <div className="tablewrap roomy">
        <table className="routestable">
          <thead><tr><th>Person</th><th>Nodes</th><th>Severity</th><th><span className="sr">Actions</span></th></tr></thead>
          <tbody>
            {staff.map((p) => {
              const r = routes?.find((x) => x.user_id === p.id);
              const nodesText = !r || r.node_ids === null ? "Every node"
                : r.node_ids.length === 0 ? "None"
                  : r.node_ids.map((id) => nodes.find((n) => n.id === id)?.name || "Removed node").join(", ");
              return (
                <tr key={p.id} data-person={p.id}>
                  <td><b>{p.full_name || p.email}</b><small className="mute block">{ROLE_LABEL[p.role]}</small></td>
                  <td>{routes === null ? <span className="mute">Loading…</span> : nodesText}</td>
                  <td>{SEVERITY_TEXT[r?.min_severity || "low"]}</td>
                  <td className="actions">
                    <button className="btn ghost small-btn" type="button" disabled={routes === null} onClick={() => setRouting({ person: p, route: r })} aria-label={`Change alerts for ${p.full_name || p.email}`}>
                      <Icon name="settings" size={16} /> Change
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <NodeForm
          node={editing === "new" ? null : editing}
          plants={plants}
          plantLabel={plantLabel}
          onClose={() => setEditing(null)}
          onSave={async (fields) => {
            if (editing === "new") {
              const made = await createNode(fields);
              if (made) { setJustMade(made); setEditing(null); }
            } else if (await updateNode(editing.id, fields)) {
              setEditing(null);
            }
          }}
        />
      )}

      {routing && (
        <RouteForm
          person={routing.person}
          route={routing.route}
          nodes={nodes.filter((n) => n.status !== "retired" || routing.route?.node_ids?.includes(n.id))}
          onClose={() => setRouting(null)}
          onSave={async (route) => {
            if (await setAlertRoute(routing.person.id, route)) {
              setRouting(null);
              reloadRoutes();
            }
          }}
        />
      )}
    </Shell>
  );
}

// Register (node null) or edit a node.
function NodeForm({ node, plants, plantLabel, onClose, onSave }) {
  const [lat, setLat] = useState(node?.lat ?? "");
  const [lng, setLng] = useState(node?.lng ?? "");
  const [plant, setPlant] = useState(node?.specimen_id ?? "");
  const [status, setStatus] = useState(node?.status && node.status !== "offline" ? node.status : "active");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  const here = () => {
    if (!navigator.geolocation) return setProblem("This browser cannot read your location.");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude.toFixed(6)); setLng(pos.coords.longitude.toFixed(6)); setProblem(""); },
      () => setProblem("Could not read your location. Type it in instead."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const save = async (e) => {
    e.preventDefault();
    const la = coord(lat, 90);
    const ln = coord(lng, 180);
    if (la === null || ln === null) return setProblem("Enter where the node is installed: latitude -90 to 90 and longitude -180 to 180.");
    const fields = { lat: la, lng: ln, specimen_id: plant || null };
    // Registering: active or maintenance. Editing an offline node leaves its status to the readings.
    if (!node || status !== (node.status === "offline" ? "active" : node.status)) fields.status = status;
    setBusy(true);
    try { await onSave(fields); } finally { setBusy(false); }
  };

  return (
    <Modal title={node ? `Edit ${node.name}` : "Register sensor node"} onClose={onClose}>
      <form onSubmit={save} noValidate className="nodeform">
        <div className="row wrap">
          <label>Latitude<input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="3.81234" /></label>
          <label>Longitude<input inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="113.78123" /></label>
          <button className="btn ghost" type="button" onClick={here}><Icon name="locate" size={18} /> Use my location</button>
        </div>
        <label>Plant it guards
          <select value={plant} onChange={(e) => setPlant(e.target.value)}>
            <option value="">None</option>
            {plants.map((p) => <option key={p.id} value={p.id}>{plantLabel(p)}</option>)}
          </select>
        </label>
        <label>Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Online (sending readings)</option>
            <option value="maintenance">Maintenance (no silent alert)</option>
            {node && <option value="retired">Turned off</option>}
          </select>
        </label>
        {!node && <p className="mute small">The node's id is made when you register it. The gateway sends its readings with that id and the sensor key.</p>}
        {problem && <p className="fielderr" role="alert">{problem}</p>}
        <div className="row">
          <button className="btn" type="submit" disabled={busy}><Icon name="check" size={18} /> {node ? "Save" : "Register"}</button>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

// Which nodes and severities one person hears about.
function RouteForm({ person, route, nodes, onClose, onSave }) {
  const [all, setAll] = useState(!route || route.node_ids === null);
  const [picked, setPicked] = useState(new Set(route?.node_ids || []));
  const [severity, setSeverity] = useState(route?.min_severity || "low");
  const [busy, setBusy] = useState(false);
  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const run = async (value) => {
    setBusy(true);
    try { await onSave(value); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Alerts for ${person.full_name || person.email}`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); run({ node_ids: all ? null : [...picked], min_severity: severity }); }} className="routeform">
        <fieldset>
          <legend>Nodes</legend>
          <label className="inline"><input type="radio" name="route-nodes" checked={all} onChange={() => setAll(true)} /> Every node, including new ones</label>
          <label className="inline"><input type="radio" name="route-nodes" checked={!all} onChange={() => setAll(false)} /> Only these nodes</label>
          {!all && (
            <div className="routenodes">
              {nodes.length === 0 && <p className="mute">No nodes to pick.</p>}
              {nodes.map((n) => (
                <label key={n.id} className="inline"><input type="checkbox" checked={picked.has(n.id)} onChange={() => toggle(n.id)} /> {n.name} <Mono className="small mute">…{n.id.slice(-6)}</Mono></label>
              ))}
            </div>
          )}
        </fieldset>
        <label>Severity
          <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
            {Object.entries(SEVERITY_TEXT).map(([k, text]) => <option key={k} value={k}>{text}</option>)}
          </select>
        </label>
        {!all && picked.size === 0 && <p className="mute small">With no nodes picked, {person.full_name || "this person"} hears about no sensor alerts.</p>}
        <div className="row wrap">
          <button className="btn" type="submit" disabled={busy}><Icon name="check" size={18} /> Save</button>
          {route && <button className="btn ghost" type="button" disabled={busy} onClick={() => run(null)}>Back to every alert</button>}
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
