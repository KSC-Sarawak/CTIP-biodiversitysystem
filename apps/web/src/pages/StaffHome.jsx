// apps/web/src/pages/StaffHome.jsx
// The home screen of each staff role (#/dashboard), Daun v2: "one glance, one next step".
// It has three layers and nothing else:
//   1. a greeting and a sentence that says what is waiting,
//   2. ONE focus card with the next item and the one filled button. When several items wait,
//      the card pages through them (arrow buttons, the dots, or the Left and Right keys),
//   3. a quiet row of doors to the pages where everything else lives.
// The full table of tagged plants is on its own page, #/dashboard/all (Dashboard.jsx).
import { useEffect, useState } from "react";
import Icon from "../components/Icon.jsx";
import Img from "../components/Img.jsx";
import ForestScene from "../components/ForestScene.jsx";
import { Mono, Sci } from "../components/Bits.jsx";
import { useStore } from "../../../shared/store.js";
import { can, DASHBOARD_LABEL, ROLE_LABEL, staffLinks } from "../../../shared/permissions.js";
import { familyColors, familyOf, nameOf, plantView, staffCounts } from "../../../shared/selectors.js";
import { fmtDate, initials } from "../../../shared/utils.js";

const plural = (n, one, many) => (n === 1 ? one : many);

// "2 hours", "3 days": how long something has been waiting.
function waited(iso) {
  if (!iso) return "";
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso)) / 60000));
  if (mins < 60) return `${mins} ${plural(mins, "minute", "minutes")}`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} ${plural(hours, "hour", "hours")}`;
  return `${Math.round(hours / 24)} days`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

// One line under each door. A count that needs attention replaces the plain hint.
const HINTS = {
  "/add": "Start a new record",
  "/records": "Everything you recorded",
  "/review": "Records sent from the field",
  "/monitoring": "Sensors and alerts",
  "/species": "The species catalogue",
  "/tags": "Print and assign QR tags",
  "/discussion": "Questions and replies",
  "/reports": "Counts and exports",
  "/users": "Staff accounts",
  "/audit": "Who changed what",
};
const ATTENTION = {
  review: (n) => `${n} waiting for review`,
  alerts: (n) => `${n} open ${plural(n, "alert", "alerts")}`,
  returned: (n) => `${n} returned to you`,
  discussion: (n) => `${n} with new replies`,
};

// The observation's plant, ready to show (name, photo, tag).
const plantOf = (db, obs) => plantView(db, db.plants.find((p) => p.id === obs.specimen_id));

// What this role should look at first: { lead, hl, label, items }. `lead` + `hl` make the
// headline (`hl` is its one highlighted phrase); each item is one page of the focus card.
function nextStep(db, role, me, counts) {
  if (role === "botanist") {
    const returned = db.observations.filter((o) => o.recorded_by === me?.id && o.status === "returned");
    if (returned.length) {
      return {
        lead: `${returned.length} ${plural(returned.length, "record needs", "records need")} `, hl: "a small fix.",
        label: "Returned by an officer",
        items: returned.map((obs) => {
          const note = [...db.reviews].reverse().find((r) => r.observation_id === obs.id && r.decision !== "approve");
          return {
            key: obs.id, plant: plantOf(db, obs),
            note: note?.comment || "Please check this record.",
            noteBy: note ? nameOf(db, note.reviewer_id) : "",
            primary: { href: "#/records", label: "Fix and resend", icon: "send" },
          };
        }),
      };
    }
    return {
      lead: "Nothing to fix. Ready for ", hl: "your next plant.", label: "Next step",
      items: [{
        key: "add", art: true, title: "Add a plant",
        text: "Scan or type a QR tag, take photos and send the record for review.",
        primary: { href: "#/add", label: "Add plant", icon: "plus" },
      }],
    };
  }

  if (role === "officer") {
    // Oldest first, so nothing waits at the bottom forever (the same order as the review queue).
    const waiting = db.observations
      .filter((o) => o.status === "synced" && db.plants.some((p) => p.id === o.specimen_id))
      .sort((a, b) => (a.last_synced_at || a.observed_at || "").localeCompare(b.last_synced_at || b.observed_at || ""));
    if (waiting.length) {
      return {
        lead: `${waiting.length} ${plural(waiting.length, "record is", "records are")} `, hl: "waiting for you.",
        label: "Next to review",
        items: waiting.map((obs) => {
          const plant = plantOf(db, obs);
          return {
            key: obs.id, plant,
            meta: [
              `Recorded by ${nameOf(db, obs.recorded_by)}`,
              `${plant.photos.length} ${plural(plant.photos.length, "photo", "photos")}`,
              `Waiting ${waited(obs.last_synced_at || obs.observed_at)}`,
            ],
            primary: { href: `#/tag/${encodeURIComponent(plant.qr_id)}`, label: "Review this record", icon: "clipboard" },
            secondary: { href: "#/review", label: "Open the queue" },
          };
        }),
      };
    }
  }

  if (role === "admin") {
    const asking = db.profiles
      .filter((u) => !u.is_active && !u.deleted_at)
      .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
    if (asking.length) {
      return {
        lead: `${asking.length} ${plural(asking.length, "person is", "people are")} `, hl: "waiting for access.",
        label: "Account request",
        items: asking.map((u) => ({
          key: u.id, person: true,
          title: u.full_name || u.email || u.username || "New account",
          meta: [ROLE_LABEL[u.role] || u.role, u.email, u.created_at ? `Asked ${fmtDate(u.created_at)}` : ""].filter(Boolean),
          primary: { href: "#/users", label: "Review this request", icon: "users" },
        })),
      };
    }
  }

  // Officers and admins with nothing in their own queue: open alerts come next.
  if (can(role, "monitor") && counts.alerts > 0) {
    return {
      lead: `${counts.alerts} ${plural(counts.alerts, "alert needs", "alerts need")} `, hl: "your attention.",
      label: "Monitoring",
      items: [{
        key: "alerts", icon: "alert", title: `${counts.alerts} open ${plural(counts.alerts, "alert", "alerts")}`,
        text: "A sensor beside a protected plant reported something unusual.",
        primary: { href: "#/monitoring", label: "Open monitoring", icon: "activity" },
      }],
    };
  }
  return {
    lead: "You're ", hl: "all caught up.", label: "Nothing is waiting",
    items: [{ key: "done", art: true, title: "No records or requests need you right now", text: "New items appear here as soon as they arrive." }],
  };
}

// The picture side of the focus card: the plant's photo, or a leaf plate in its family colour.
function FocusPicture({ item, color }) {
  const [broken, setBroken] = useState(false);
  if (item.art) return <ForestScene />;
  if (item.person) return <span className="focus-avatar">{initials(item.title)}</span>;
  if (!item.plant) return <span className="focus-avatar"><Icon name={item.icon || "leaf"} size={36} /></span>;
  const url = item.plant.photos[0]?.url;
  return (
    <>
      <svg className="focus-plate" viewBox="0 0 100 100" style={{ "--t": color }} aria-hidden="true">
        <path className="lf" d="M50 6C80 30 84 68 50 96C16 68 20 30 50 6Z" />
        <path className="lv" d="M50 12V94M50 30L67 21M50 30L33 21M50 46L73 37M50 46L27 37M50 62L71 54M50 62L29 54M50 78L63 72M50 78L37 72" />
      </svg>
      {url && !broken && <Img src={url} alt="" onError={() => setBroken(true)} />}
    </>
  );
}

export default function StaffHome() {
  const { db, role, me, refreshFromBackend, isSyncing } = useStore();
  const counts = staffCounts(db, me);
  const { lead, hl, label, items } = nextStep(db, role, me, counts);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [checkedAt, setCheckedAt] = useState(() => new Date());
  const i = Math.min(index, items.length - 1);
  const item = items[i];
  const many = items.length > 1;
  const colors = familyColors(db.species, db.plants.map((p) => plantView(db, p)));

  const move = (step) => {
    if (!many) return;
    setDir(step);
    setIndex((i + step + items.length) % items.length);
  };
  // Left and Right page through the waiting items, unless the person is typing somewhere.
  useEffect(() => {
    if (!many) return undefined;
    const onKey = (e) => {
      if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight") { setDir(1); setIndex((n) => (Math.min(n, items.length - 1) + 1) % items.length); }
      if (e.key === "ArrowLeft") { setDir(-1); setIndex((n) => (Math.min(n, items.length - 1) - 1 + items.length) % items.length); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [many, items.length]);

  const refresh = async () => {
    await refreshFromBackend();
    setCheckedAt(new Date());
  };

  const all = can(role, "allPlants");
  const doors = [
    ...staffLinks(role),
    { to: "/dashboard/all", label: all ? "Tagged plants" : "My plants", hint: "Search and export the full list" },
  ].filter((l) => ![item.primary?.href, item.secondary?.href].includes("#" + l.to)); // already on the card
  const first = (me?.full_name || "").split(" ")[0];
  const plant = item.plant;

  return (
    <div className="staffhome">
      <header className="hello">
        <div className="hello-top">
          <p className="overline">{greeting()}{first ? `, ${first}` : ""} · {DASHBOARD_LABEL[role]}</p>
          <button type="button" className="refresh" onClick={refresh} disabled={isSyncing} aria-label="Check for new items">
            <Icon name="refresh" size={16} className={isSyncing ? "spin" : ""} />
            {isSyncing ? "Checking…" : `Checked ${checkedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
          </button>
        </div>
        <h1>{lead}<span className="hl">{hl}</span></h1>
      </header>

      <section className="glass focus" aria-label="Next step" aria-roledescription={many ? "carousel" : undefined}>
        <div key={item.key} className={"focus-inner " + (dir > 0 ? "from-right" : "from-left")}>
          <div className={"focus-pic" + (item.art ? " art" : "")}>
            <FocusPicture item={item} color={plant ? colors[familyOf(plant)] || "var(--acc)" : undefined} />
          </div>
          <div className="focus-body">
            <div className="row between wrap">
              <p className="overline">{label}{many ? ` · ${i + 1} of ${items.length}` : ""}</p>
              {plant && <Mono>{plant.qr_id}</Mono>}
            </div>
            <div>
              <h2>{plant ? plant.name : item.title}</h2>
              {plant?.scientific && <Sci block>{plant.scientific}</Sci>}
            </div>
            {item.note && <p className="focus-note"><b>{item.noteBy ? `Note from ${item.noteBy}` : "Officer's note"}</b>{item.note}</p>}
            {item.text && <p className="mute">{item.text}</p>}
            {item.meta && <p className="focus-meta">{item.meta.map((m) => <span key={m}>{m}</span>)}</p>}
            {item.primary && (
              <div className="focus-acts">
                <a className="btn" href={item.primary.href}><Icon name={item.primary.icon} size={18} /> {item.primary.label}</a>
                {item.secondary && <a className="btn ghost" href={item.secondary.href}>{item.secondary.label}</a>}
              </div>
            )}
          </div>
        </div>
        {many && (
          <div className="focus-pager">
            <button type="button" className="ic" onClick={() => move(-1)} aria-label="Previous item"><Icon name="chevL" size={18} /></button>
            <span className="focus-dots" role="group" aria-label="Waiting items">
              {items.slice(0, 8).map((it, n) => (
                <button key={it.key} type="button" className={n === i ? "on" : ""} aria-label={`Item ${n + 1} of ${items.length}`} aria-current={n === i ? "true" : undefined}
                  onClick={() => { setDir(n > i ? 1 : -1); setIndex(n); }} />
              ))}
            </span>
            <button type="button" className="ic" onClick={() => move(1)} aria-label="Next item"><Icon name="chevR" size={18} /></button>
            <span className="mute small focus-keys">or use <kbd>←</kbd> <kbd>→</kbd></span>
          </div>
        )}
      </section>

      <nav className="doors" aria-label="Other pages">
        {doors.map((l) => {
          const n = l.badge ? counts[l.badge] : 0;
          return (
            <a key={l.to} className="door" href={"#" + l.to}>
              <span className="door-ic"><Icon name={l.icon || "file"} size={20} /></span>
              <span className="door-text">
                <b>{l.label}</b>
                <span className={n > 0 ? "door-attn" : ""}>{n > 0 ? ATTENTION[l.badge](n) : l.hint || HINTS[l.to]}</span>
              </span>
              {n > 0 ? <span className="door-count">{n}</span> : <Icon name="arrowR" size={18} />}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
