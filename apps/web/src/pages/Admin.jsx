// apps/web/src/pages/Admin.jsx
import { useState } from "react";
import Shell from "../components/Shell.jsx";
import Icon from "../components/Icon.jsx";
import PageHead from "../components/PageHead.jsx";
import { Chip, PasswordInput } from "../components/Bits.jsx";
import { useConfirm } from "../useConfirm.jsx";
import { useStore } from "../../../shared/store.js";
import { fuzzyMatch } from "../../../shared/fuzzy.js";
import { ROLE_LABEL } from "../../../shared/permissions.js";
import { fmtDate, fmtDateTime, label } from "../../../shared/utils.js";
import { emailProblem, passwordProblem, nameProblem } from "../../../shared/accountRules.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_DAYS = 30; // DELETE_GRACE_DAYS in services/api/src/staff.js
const removeDate = (u) => new Date(new Date(u.deleted_at).getTime() + GRACE_DAYS * DAY_MS);
const daysLeft = (u) => Math.max(0, Math.ceil((removeDate(u) - Date.now()) / DAY_MS));

// Admin page for accounts. Botanists and officers are registered here, not by themselves.
// Two tables: accounts that can sign in, and ones that cannot (turned off, or
// deleted and waiting out the 30 days in which they can still be restored).
export function Users() {
  const { db, me, addUser, updateUser, deleteUser, restoreUser, correctEmail, notify } = useStore();
  // RBAC D14: { id, value } while an admin types a corrected email for one user.
  const [fixing, setFixing] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState("botanist");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("name");
  const [ask, confirmDialog] = useConfirm();
  // Why each field cannot be used, shown under it: { name, email, password }.
  const [errors, setErrors] = useState({});
  const checks = {
    name: () => nameProblem(name),
    email: () => emailProblem(email),
    password: () => (password ? passwordProblem(password) : null), // blank: send an invitation
  };
  const setError = (field, message) => setErrors((prev) => ({ ...prev, [field]: message || undefined }));
  const checkField = (field) => setError(field, checks[field]());
  // While a field shows a reason, re-check it as it is fixed.
  const edit = (field, setter) => (e) => {
    setter(e.target.value);
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };
  const fieldProps = (field) => ({
    "aria-invalid": errors[field] ? "true" : undefined,
    "aria-describedby": errors[field] ? `invite-${field}-error` : undefined,
    onBlur: () => { if ((field === "password" ? password : field === "name" ? name : email)) checkField(field); },
  });
  const fieldError = (field) => (errors[field] ? <small id={`invite-${field}-error`} className="fielderr" role="alert">{errors[field]}</small> : null);

  const filtered = (db.profiles || []).filter((u) => {
    return fuzzyMatch(`${u.full_name || ""} ${u.email || ""} ${u.role || ""}`, q);
  });

  const sortedUsers = [...filtered].sort((a, b) => {
    if (sort === "name") return (a.full_name || "").localeCompare(b.full_name || "");
    if (sort === "role") return (a.role || "").localeCompare(b.role || "");
    if (sort === "email") return (a.email || "").localeCompare(b.email || "");
    if (sort === "added") return (b.created_at || "").localeCompare(a.created_at || "");
    return (a.full_name || "").localeCompare(b.full_name || "");
  });
  const activeUsers = sortedUsers.filter((u) => u.is_active && !u.deleted_at);
  // Deleted ones first, soonest to be removed at the top.
  const inactiveUsers = sortedUsers.filter((u) => !u.is_active || u.deleted_at)
    .sort((a, b) => (!!b.deleted_at - !!a.deleted_at) || (a.deleted_at && b.deleted_at ? a.deleted_at.localeCompare(b.deleted_at) : 0));

  const waitingUsers = inactiveUsers.filter((u) => !u.deleted_at);

  const add = async (e) => {
    e.preventDefault();
    // Say what is wrong before anything is sent (no email is used on a bad address).
    const found = Object.fromEntries(Object.keys(checks).map((f) => [f, checks[f]()]).filter(([, m]) => m));
    setErrors(found);
    const first = Object.keys(checks).find((f) => found[f]);
    if (first) {
      document.getElementById(`invite-${first}`)?.focus();
      return notify(found[first]);
    }
    const ok = password
      ? await ask({ title: "Create account with a password", body: `This creates an account for ${email} as ${ROLE_LABEL[newRole]} with the temporary password you typed, so they can sign in straight away.`, confirmLabel: "Create account", word: "CREATE" })
      : await ask({ title: "Invite member", body: `Send an email invitation to ${email} as ${ROLE_LABEL[newRole]}?`, confirmLabel: "Send invitation" });
    if (!ok) return;
    const res = await addUser({ full_name: name.trim(), email, role: newRole, password: password || undefined });
    if (res === false || res?.ok === false) {
      // The API's reasons go under their fields; EMAIL_RATE_LIMIT's message says how long to wait.
      const byField = {};
      for (const f of res?.fields || []) {
        const field = f.path === "full_name" ? "name" : f.path;
        if (checks[field] && !byField[field]) byField[field] = f.message;
      }
      if (["EMAIL_TAKEN", "INVALID_EMAIL"].includes(res?.code)) byField.email = res.message;
      if (res?.code === "WEAK_PASSWORD") byField.password = res.message;
      setErrors(byField);
      return notify(res?.message || "This email already has an account");
    }
    setErrors({});
    setName("");
    setEmail("");
    setPassword("");
  };

  const changeRole = async (u, role) => {
    if (!(await ask({ title: "Change role", body: `Change ${u.full_name} from ${ROLE_LABEL[u.role]} to ${ROLE_LABEL[role]}? Their access changes straight away.`, confirmLabel: "Change role", word: "CHANGE" }))) return;
    updateUser(u.id, { role });
  };
  const toggleActive = async (u) => {
    const turnOff = u.is_active;
    const ok = await ask(turnOff
      ? { title: "Turn off account", body: `Turn off ${u.full_name}'s account? They will no longer be able to sign in.`, confirmLabel: "Turn off account", danger: true, word: "DEACTIVATE" }
      : { title: "Turn on account", body: `Turn ${u.full_name}'s account back on? They will be able to sign in again.`, confirmLabel: "Turn on account" });
    if (ok) updateUser(u.id, { is_active: !u.is_active });
  };
  const sendCorrection = async (e, u) => {
    e.preventDefault();
    const problem = emailProblem(fixing.value);
    if (problem) return notify(problem);
    const ok = await ask({
      title: "Correct email",
      body: <p>Send a confirmation link to <b>{fixing.value.trim().toLowerCase()}</b>? {u.full_name || u.email}'s email changes only when they click it. Until then they keep signing in with <b>{u.email}</b>.</p>,
      confirmLabel: "Send link",
    });
    if (ok && (await correctEmail(u.id, fixing.value))) setFixing(null);
  };
  const remove = async (u) => {
    const until = new Date(Date.now() + GRACE_DAYS * DAY_MS).toLocaleDateString();
    const ok = await ask({
      title: "Delete user",
      body: (
        <>
          <p><b>{u.full_name || u.email}</b> is turned off straight away and can no longer sign in.</p>
          <p>You can restore the account from <b>Not active</b> until <b>{until}</b>. After that it is removed for good:
            their plants, visits, photos and reviews stay, shown as by a former member, and discussion threads they started are removed.</p>
        </>
      ),
      confirmLabel: "Delete user",
      danger: true,
      word: "DELETE",
    });
    if (ok) deleteUser(u.id);
  };
  const restore = async (u) => {
    const ok = await ask({
      title: "Restore user",
      body: `Restore ${u.full_name || u.email}? The account comes back turned off; switch it on when they should sign in again.`,
      confirmLabel: "Restore",
    });
    if (ok) restoreUser(u.id);
  };

  return (
    <Shell seg="users">
      <PageHead
        overline="Admin dashboard"
        title="Users"
        lead={waitingUsers.length ? `${waitingUsers.length} ${waitingUsers.length === 1 ? "account is" : "accounts are"} turned off and may be waiting for access.` : `All ${activeUsers.length} accounts are active.`}
        tone={waitingUsers.length ? "warn" : "ok"}
        stats={[
          { label: "Active", value: activeUsers.length },
          ...Object.entries(ROLE_LABEL).map(([r, text]) => ({ label: text, value: activeUsers.filter((u) => u.role === r).length })),
          { label: "Not active", value: inactiveUsers.length, tone: "warn" },
        ]}
      />
      {confirmDialog}

      {/* noValidate: our own checks say why a value is wrong, instead of the browser's bubble */}
      <form className="addform" onSubmit={add} noValidate>
        <h3><Icon name="users" size={18} /> Invite member</h3>
        <div className="row wrap invite">
          <label>Name<input id="invite-name" value={name} onChange={edit("name", setName)} autoComplete="off" {...fieldProps("name")} />{fieldError("name")}</label>
          <label>Email<input id="invite-email" type="email" value={email} onChange={edit("email", setEmail)} autoComplete="off" {...fieldProps("email")} />{fieldError("email")}</label>
          <label>Temporary Password<PasswordInput id="invite-password" value={password} onChange={edit("password", setPassword)} placeholder="At least 8 characters" autoComplete="new-password" {...fieldProps("password")} />{fieldError("password")}</label>
          <label>Role
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              {Object.entries(ROLE_LABEL).map(([r, text]) => <option key={r} value={r}>{text}</option>)}
            </select>
          </label>
          <button className="btn" type="submit"><Icon name="plus" size={18} /> Invite member</button>
        </div>
        <p className="mute small">Leave temporary password blank to send an email invitation, or specify one for immediate first-time sign in.</p>
      </form>

      <div className="toolbar" style={{ display: "flex", gap: 12, alignItems: "center", margin: "20px 0 14px", flexWrap: "wrap" }}>
        <label className="search grow" style={{ flex: 1, minWidth: 220 }}>
          <Icon name="search" size={18} />
          <input placeholder="Search users by name, email or role" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
        </label>
        <label className="inline" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort users">
            <option value="name">Name A–Z</option>
            <option value="added">Newest first</option>
            <option value="role">Role</option>
            <option value="email">Email A–Z</option>
          </select>
        </label>
      </div>

      <h3 className="sub"><Icon name="users" size={18} /> Active <span className="mute">({activeUsers.length})</span></h3>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th>Added</th><th><span className="sr">Delete</span></th></tr></thead>
          <tbody>
            {activeUsers.map((u) => (
              <tr key={u.id}>
                <td><b>{u.full_name}</b>{u.id === me.id && <small className="mute"> (you)</small>}</td>
                <td>
                  {fixing?.id === u.id ? (
                    <form className="row wrap" onSubmit={(e) => sendCorrection(e, u)} noValidate>
                      <input type="email" value={fixing.value} onChange={(e) => setFixing({ id: u.id, value: e.target.value })} aria-label={`Correct email for ${u.full_name || u.email}`} autoFocus />
                      <button className="btn small-btn" type="submit">Send link</button>
                      <button className="btn ghost small-btn" type="button" onClick={() => setFixing(null)}>Cancel</button>
                    </form>
                  ) : (
                    <>
                      {u.email}{" "}
                      {u.id !== me.id && <button className="btn ghost small-btn" type="button" onClick={() => setFixing({ id: u.id, value: u.email || "" })}>Correct email</button>}
                    </>
                  )}
                </td>
                <td>
                  <select value={u.role} disabled={u.id === me.id} onChange={(e) => changeRole(u, e.target.value)} aria-label={`Role for ${u.full_name}`}>
                    {Object.entries(ROLE_LABEL).map(([r, text]) => <option key={r} value={r}>{text}</option>)}
                  </select>
                </td>
                <td>
                  <button className="switch on" role="switch" aria-checked="true" disabled={u.id === me.id}
                    onClick={() => toggleActive(u)} aria-label={`Account active for ${u.full_name}`}><i /></button>
                </td>
                <td>{fmtDate(u.created_at)}</td>
                <td>
                  {u.id !== me.id && <button className="ic" onClick={() => remove(u)} aria-label={`Delete ${u.full_name || u.email}`} title="Delete user"><Icon name="trash" size={18} /></button>}
                </td>
              </tr>
            ))}
            {!activeUsers.length && <tr><td colSpan="6" className="mute">{q ? "No active users match your search." : "No active users."}</td></tr>}
          </tbody>
        </table>
      </div>

      <h3 className="sub gap-top"><Icon name="lock" size={18} /> Not active <span className="mute">({inactiveUsers.length})</span></h3>
      <p className="mute small">Turned-off accounts cannot sign in. Deleted accounts can be restored until the date shown, then they are removed for good.</p>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Added</th><th><span className="sr">Actions</span></th></tr></thead>
          <tbody>
            {inactiveUsers.map((u) => (
              <tr key={u.id}>
                <td><b>{u.full_name || "No name"}</b></td>
                <td>{u.email}</td>
                <td>{ROLE_LABEL[u.role] || u.role}</td>
                <td>
                  {u.deleted_at
                    ? <><Chip value="delete">Deleted</Chip> <small className="mute block">Removed for good on {fmtDate(removeDate(u).toISOString())} · {daysLeft(u)} {daysLeft(u) === 1 ? "day" : "days"} left</small></>
                    : <Chip value="retired">Turned off</Chip>}
                </td>
                <td>{fmtDate(u.created_at)}</td>
                <td>
                  {u.deleted_at ? (
                    <button className="btn ghost small-btn" onClick={() => restore(u)}><Icon name="undo" size={16} /> Restore</button>
                  ) : (
                    <span className="row">
                      <button className="switch" role="switch" aria-checked="false" onClick={() => toggleActive(u)} aria-label={`Account active for ${u.full_name}`}><i /></button>
                      <button className="ic" onClick={() => remove(u)} aria-label={`Delete ${u.full_name || u.email}`} title="Delete user"><Icon name="trash" size={18} /></button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!inactiveUsers.length && <tr><td colSpan="6" className="mute">{q ? "No inactive users match your search." : "Every account is active."}</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

// Every change recorded by the actions (audit_logs table), newest first.
// Sign-in events (VA-71) have table "auth" and keep the email in new_value.
const AUDIT_ACTIONS = ["INSERT", "UPDATE", "DELETE", "SIGN_IN", "SIGN_IN_FAILED", "MFA_FAILED", "SIGN_OUT"];
// Rows per page (lecturer, 13 Nov: 10, 25 or 50).
const AUDIT_PAGE_SIZES = [10, 25, 50];
// Each kind of entry gets its own word, icon and colour, so the log scans by shape and colour.
const AUDIT_KIND = {
  INSERT: { text: "Created", icon: "plus", tone: "ok" },
  UPDATE: { text: "Edited", icon: "pencil", tone: "info" },
  DELETE: { text: "Deleted", icon: "trash", tone: "bad" },
  SIGN_IN: { text: "Signed in", icon: "key", tone: "acc" },
  SIGN_IN_FAILED: { text: "Sign-in failed", icon: "lock", tone: "warn" },
  MFA_FAILED: { text: "2-step check failed", icon: "shield", tone: "warn" },
  SIGN_OUT: { text: "Signed out", icon: "logout", tone: "neutral" },
};
const kindOf = (action) => AUDIT_KIND[String(action).toUpperCase()] || { text: String(action), icon: "info", tone: "neutral" };
// What each table holds, in plain words.
const AUDIT_TABLE = {
  auth: "Account", profiles: "User", species: "Species", species_media: "Species photo", specimens: "Plant",
  observations: "Plant record", observation_photos: "Record photo", observation_reviews: "Review", observation_comments: "Comment",
  qr_tags: "QR tag", alerts: "Alert", alert_notes: "Alert note", sensor_nodes: "Sensor node", zones: "Zone",
  discussions: "Discussion", discussion_posts: "Discussion post",
};
// Fields that change on every save; listed in the full view, left out of the one-line summary.
const NOISY = new Set(["updated_at", "version", "last_synced_at"]);
const shortText = (v, max = 48) => {
  const t = v == null ? "empty" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
};
const fullText = (v) => (v == null ? "empty" : typeof v === "object" ? JSON.stringify(v, null, 2) : String(v));

// One entry as fields: [{ key, before, after, changed }]. Edits list the changed fields first.
function auditFields(a) {
  const oldV = a.old_value && typeof a.old_value === "object" ? a.old_value : {};
  const newV = a.new_value && typeof a.new_value === "object" ? a.new_value : {};
  const keys = [...new Set([...Object.keys(oldV), ...Object.keys(newV)])];
  const rows = keys.map((key) => ({ key, before: oldV[key], after: newV[key], changed: JSON.stringify(oldV[key]) !== JSON.stringify(newV[key]) }));
  return rows.sort((x, y) => Number(y.changed) - Number(x.changed));
}

// The one-line summary of an entry.
function auditSummary(a, fields) {
  const kind = String(a.action).toUpperCase();
  if (a.table_name === "auth") return a.new_value?.email || a.old_value?.email || "";
  if (kind === "UPDATE") {
    const changed = fields.filter((f) => f.changed && !NOISY.has(f.key));
    if (!changed.length) return "No visible change";
    const first = changed.slice(0, 2).map((f) => `${f.key}: ${shortText(f.before, 24)} → ${shortText(f.after, 24)}`).join(" · ");
    return changed.length > 2 ? `${first} · +${changed.length - 2} more` : first;
  }
  const v = kind === "DELETE" ? a.old_value : a.new_value;
  const name = v && (v.qr_id || v.scientific_name || v.full_name || v.name || v.title || v.type || v.email);
  const count = fields.length;
  return `${name ? `${shortText(name, 40)} · ` : ""}${count} field${count === 1 ? "" : "s"}`;
}

export function Audit() {
  const { db } = useStore();
  const [action, setAction] = useState("");
  const [size, setSize] = useState(AUDIT_PAGE_SIZES[0]);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(() => new Set()); // entries shown in full
  const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const rows = action ? db.audit.filter((a) => String(a.action).toUpperCase() === action) : db.audit;
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const at = Math.min(page, pages - 1);
  const shown = rows.slice(at * size, at * size + size);
  return (
    <Shell seg="audit">
      <PageHead
        overline="Admin dashboard"
        title="Audit log"
        lead={`Who changed what, newest first. ${db.audit.length} ${db.audit.length === 1 ? "entry" : "entries"}; entries cannot be edited or deleted. Sign-ins are logged too.`}
        tone="info"
      />

      <div className="row wrap auditbar">
        <select value={action} onChange={(e) => { setAction(e.target.value); setPage(0); }} aria-label="Filter by action">
          <option value="">All actions</option>
          {AUDIT_ACTIONS.map((x) => <option key={x} value={x}>{kindOf(x).text}</option>)}
        </select>
        <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }} aria-label="Rows per page">
          {AUDIT_PAGE_SIZES.map((n) => <option key={n} value={n}>{n} per page</option>)}
        </select>
        <ul className="plain auditkey" aria-label="What the labels mean">
          {AUDIT_ACTIONS.map((x) => <li key={x}><AuditBadge action={x} /></li>)}
        </ul>
      </div>

      <div className="tablewrap roomy">
        <table className="audittable">
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>Change</th></tr></thead>
          <tbody>
            {shown.map((a) => {
              const fields = auditFields(a);
              const isOpen = open.has(a.id);
              const canOpen = a.table_name !== "auth" && fields.length > 0;
              return (
                <AuditRow key={a.id} a={a} fields={fields} isOpen={isOpen} canOpen={canOpen} onToggle={() => toggle(a.id)}
                  who={db.profiles.find((p) => p.id === a.changed_by)?.full_name || a.new_value?.email || "System"} />
              );
            })}
            {!shown.length && <tr><td colSpan="4" className="mute">No entries{action ? " of this kind" : ""} yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mute small">
        Showing {rows.length ? at * size + 1 : 0} to {at * size + shown.length} of {rows.length} entries{action ? ` (${db.audit.length} in total)` : ""}. Page {at + 1} of {pages}.
      </p>
      <p>
        <button type="button" className="btn ghost" onClick={() => setPage(at - 1)} disabled={at === 0}>Previous</button>{" "}
        <button type="button" className="btn ghost" onClick={() => setPage(at + 1)} disabled={at >= pages - 1}>Next</button>
      </p>
    </Shell>
  );
}

function AuditBadge({ action }) {
  const k = kindOf(action);
  return <span className={"auditbadge tone-" + k.tone}><Icon name={k.icon} size={14} /> {k.text}</span>;
}

// One entry: a short summary line, and on request every field with its value before and after.
function AuditRow({ a, fields, isOpen, canOpen, onToggle, who }) {
  const kind = String(a.action).toUpperCase();
  const tableName = AUDIT_TABLE[a.table_name] || label(a.table_name || "");
  const panelId = `audit-${a.id}`;
  return (
    <>
      <tr className={"auditrow tone-" + kindOf(a.action).tone + (isOpen ? " open" : "")}>
        <td className="nowrap">{fmtDateTime(a.changed_at)}</td>
        <td>{who}</td>
        <td><AuditBadge action={a.action} /><small className="mute block">{tableName}</small></td>
        <td>
          <div className="auditchange">
            <span className="auditsummary">{auditSummary(a, fields)}</span>
            {canOpen && (
              <button type="button" className="btn ghost small-btn" aria-expanded={isOpen} aria-controls={panelId} onClick={onToggle}>
                <Icon name={isOpen ? "chevD" : "chevR"} size={16} /> {isOpen ? "Hide" : "Expand"}
              </button>
            )}
          </div>
        </td>
      </tr>
      {isOpen && (
        <tr className="auditdetail">
          <td colSpan="4" id={panelId}>
            <table className="auditfields">
              <thead>
                <tr><th>Field</th>{kind !== "INSERT" && <th>Before</th>}{kind !== "DELETE" && <th>After</th>}</tr>
              </thead>
              <tbody>
                {fields.map((f) => (
                  <tr key={f.key} className={kind === "UPDATE" && f.changed ? "changed" : ""}>
                    <th scope="row">{f.key}</th>
                    {kind !== "INSERT" && <td><pre>{fullText(f.before)}</pre></td>}
                    {kind !== "DELETE" && <td><pre>{fullText(f.after)}</pre></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}
