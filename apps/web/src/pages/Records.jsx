// apps/web/src/pages/Records.jsx
import { useState } from "react";
import Shell from "../components/Shell.jsx";
import Icon from "../components/Icon.jsx";
import { Chip, Empty, Mono } from "../components/Bits.jsx";
import PageHead from "../components/PageHead.jsx";
import { useStore } from "../../../shared/store.js";
import { nameOf, plantView, unfinishedPlants, recordMatches, draftMatches } from "../../../shared/selectors.js";
import { fmtDateTime } from "../../../shared/utils.js";

// A botanist's own submission history, with the status of each record.
export default function Records() {
  const { db, me } = useStore();
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const [q, setQ] = useState("");

  const unfinished = unfinishedPlants(db, me?.id);
  const all = db.observations.filter((o) => o.recorded_by === me?.id);
  const countOf = (st) => all.filter((o) => o.status === st).length;
  const mine = all
    .filter((o) => filter === "all" || o.status === filter || (filter === "draft" && o.status === "queued"))
    .map((o) => ({ ...o, plant: plantView(db, db.plants.find((p) => p.id === o.specimen_id)) }))
    .sort((a, b) => {
      // Records returned for a fix always come first: they are the ones waiting on you.
      const ra = a.status === "returned" ? 0 : 1;
      const rb = b.status === "returned" ? 0 : 1;
      if (ra !== rb) return ra - rb;
      if (sort === "oldest") return (a.observed_at || "").localeCompare(b.observed_at || "");
      if (sort === "name") {
        return (a.plant?.name || "").localeCompare(b.plant?.name || "");
      }
      if (sort === "tag") {
        return (a.plant?.qr_id || "").localeCompare(b.plant?.qr_id || "");
      }
      return (b.observed_at || "").localeCompare(a.observed_at || "");
    });

  const filteredMine = mine.filter((o) => recordMatches(o, o.plant, q));
  const filteredUnfinished = unfinished.filter((p) => draftMatches(p, q));

  // One sentence: the most urgent thing first.
  const returned = countOf("returned");
  const notSent = unfinished.length + countOf("draft") + countOf("queued");
  const lead = returned
    ? { tone: "warn", text: `${returned} ${returned === 1 ? "record was" : "records were"} returned to you. Fix ${returned === 1 ? "it" : "them"} first.` }
    : notSent
      ? { tone: "warn", text: `${notSent} ${notSent === 1 ? "record has" : "records have"} not been sent yet.` }
      : countOf("synced")
        ? { tone: "info", text: `${countOf("synced")} ${countOf("synced") === 1 ? "record is" : "records are"} with an officer. Nothing needs you right now.` }
        : { tone: "ok", text: all.length ? "All your records are done. Nothing needs you right now." : "You have not recorded a plant yet." };
  const tile = (key, label, value, tone) => ({ label, value, tone, on: filter === key, onClick: () => setFilter(filter === key && key !== "all" ? "all" : key) });

  return (
    <Shell seg="records">
      <PageHead
        overline="Botanist dashboard"
        title="My records"
        lead={lead.text}
        tone={lead.tone}
        actions={<a className="btn" href="#/add"><Icon name="plus" size={18} /> Add plant</a>}
        stats={[
          tile("returned", "Returned to you", returned, "warn"),
          tile("draft", "Not sent yet", notSent, "warn"),
          tile("synced", "With an officer", countOf("synced")),
          tile("approved", "Published", countOf("approved")),
          tile("all", "All records", all.length),
        ]}
      />
      <div className="toolbar">
        <label className="search grow">
          <Icon name="search" size={18} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by plant, species or tag" aria-label="Search my records" />
        </label>
        <label className="inline">Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort my records">
            <option value="recent">Recent first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Plant name A–Z</option>
            <option value="tag">Tag ID</option>
          </select>
        </label>
      </div>

      {filteredUnfinished.length > 0 && (filter === "all" || filter === "draft" || filter === "queued") && (
        <div className="callout gap-bottom">
          <p><b>Not sent yet.</b> {filteredUnfinished.length === 1 ? "This plant was" : "These plants were"} saved, but the record did not reach the server. Finish and send to put it in the review queue.</p>
          <ul className="drafts-list">
            {filteredUnfinished.map((p) => (
              <li key={p.id} className="draft-card">
                <div className="row wrap" style={{ alignItems: "center", gap: 10 }}>
                  <Mono className="tagpill">{p.qr_id}</Mono>
                  <span style={{ fontWeight: 600, fontSize: "15px" }}>{p.proposed_species || "Unnamed plant"}</span>
                  <span className="mute small">· Draft saved</span>
                </div>
                <a className="btn small-btn" href={`#/add/${encodeURIComponent(p.qr_id)}`} style={{ whiteSpace: "nowrap" }}>
                  <Icon name="send" size={16} /> Finish and send
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {filteredMine.length === 0 && filteredUnfinished.length === 0 && (
        <Empty icon="file">{q.trim() ? `No records match "${q}".` : "No records with this status."}</Empty>
      )}
      {filteredMine.map((o) => <RecordRow key={o.id} obs={o} />)}
    </Shell>
  );
}

function RecordRow({ obs }) {
  const { db, syncObservation, resubmit } = useStore();
  const [reply, setReply] = useState("");
  // Editable copy of the record while it is returned. Saved only by "Send again".
  const [fix, setFix] = useState({ morphology: obs.morphology || "", height_cm: obs.height_cm ?? "", notes: obs.notes || "" });
  const [busy, setBusy] = useState(false);
  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    await fn(); // the store shows success or the reason it failed
    setBusy(false);
  };
  const sendAgain = () => run(async () => {
    const r = await resubmit(obs.id, reply, fix);
    if (r.ok) setReply("");
  });
  const set = (k) => (e) => setFix({ ...fix, [k]: e.target.value });
  // The plant can be missing for a moment while data loads, or if it was deleted.
  const plant = obs.plant || plantView(db, db.plants.find((p) => p.id === obs.specimen_id)) || { name: "Plant not loaded", qr_id: "-" };
  const lastReturn = [...db.reviews].reverse().find((r) => r.observation_id === obs.id && r.decision !== "approve");

  return (
    <article className="record">
      <header>
        <div>
          <b>{plant.name}</b>
          <small className="mute block"><Mono>{plant.qr_id}</Mono> · seen {fmtDateTime(obs.observed_at)} · version {obs.version}</small>
        </div>
        <Chip value={obs.status} />
      </header>

      {(obs.status === "draft" || obs.status === "queued") && (
        <div className="row">
          <p className="mute grow">{obs.status === "draft" ? "Not sent yet." : "Saved on this phone. Waiting for a signal."}</p>
          <button className="btn" disabled={busy} onClick={() => run(() => syncObservation(obs.id))}><Icon name="upload" size={18} /> {busy ? "Sending…" : "Send for review"}</button>
        </div>
      )}

      {obs.status === "returned" && (
        <div className="callout">
          <p><b>Returned by {nameOf(db, lastReturn?.reviewer_id)}:</b> {lastReturn?.comment || "Please check this record."}</p>
          <label>Appearance<textarea rows="3" value={fix.morphology} onChange={set("morphology")} /></label>
          <div className="two">
            <label>Height (cm)<input type="number" min="0" value={fix.height_cm} onChange={set("height_cm")} /></label>
            <label>Notes<input value={fix.notes} onChange={set("notes")} /></label>
          </div>
          <label>Your reply<input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="What did you fix?" /></label>
          <p><button className="btn" disabled={busy} onClick={sendAgain}><Icon name="send" size={18} /> {busy ? "Sending…" : "Send again"}</button></p>
        </div>
      )}

      {obs.status === "rejected" && lastReturn?.comment && <p className="mute">Reason: {lastReturn.comment}</p>}
      {obs.status === "synced" && <p className="mute"><Icon name="lock" size={14} /> Waiting for an officer to review it. Record edits are locked until a decision is returned.</p>}
      {obs.status === "approved" && <p className="mute">Published to the plant library.</p>}
    </article>
  );
}
