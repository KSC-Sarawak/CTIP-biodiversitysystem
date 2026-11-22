import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Icon from "../components/Icon.jsx";
import BackButton from "../components/BackButton.jsx";
import Img from "../components/Img.jsx";
import MiniMap from "../components/MiniMap.jsx";
import NewSpeciesButton from "../components/NewSpeciesButton.jsx";
import PhotoGallery from "../components/PhotoGallery.jsx";
import PhotoEditor from "../components/PhotoEditor.jsx";
import PublicPlant from "./PublicPlant.jsx";
import { Chip, Empty, Modal, Mono, Sci } from "../components/Bits.jsx";
import { useConfirm } from "../useConfirm.jsx";
import { go } from "../useRoute.js";
import { decisionPrompt } from "../decisionPrompt.jsx";
import { useStore } from "../../../shared/store.js";
import { can } from "../../../shared/permissions.js";
import { lastUpdated, nameOf, plantVisits, shownCoords, tagUrl, visiblePlants } from "../../../shared/selectors.js";
import { HIDDEN_LOCATION_NOTE, HIDE_LOCATION_LABEL, REDUCED_LOCATION_NOTE, hideLocationRule } from "../../../shared/data.js";
import { fmtDate, fmtDateTime, label } from "../../../shared/utils.js";
import { SENSOR_FIELDS, fixedRanges, rangeState, rangeText } from "../../../shared/sensorLimits.js";

const height = (cm) => (cm == null ? "-" : cm >= 100 ? `${(cm / 100).toFixed(cm % 10 ? 2 : 1)} m` : `${cm} cm`);

// The newest "return" decision on an observation: why it was sent back.
const lastReturn = (db, obsId) =>
  db.reviews.filter((r) => r.observation_id === obsId && r.decision === "return").sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;

const scrollToReview = () => document.getElementById("review-card")?.scrollIntoView({ behavior: "smooth", block: "start" });

// One tagged plant (a specimen): the page a QR tag opens (#/tag/<qr>, and #/dashboard/<qr>).
// Tabs: Overview and Photos for everyone; Visits, Sensor and Discussion for staff.
//
// Publishing (RBAC D17, D18), officers only:
//   waiting for review  -> the review card: approve, return or reject.
//   published           -> "Unpublish plant" (reason required). No review option.
//   unpublished         -> "Review tag" opens review mode: species, photos and the
//                          hide-location switch are a draft, saved together, or sent back
//                          to the botanist with a reason. "Publish again" is a separate,
//                          deliberate step; nothing publishes the plant by itself.
export default function Specimen({ qr }) {
  const { db, me, role, setPlantPhotos, setPlantSpecies, setPlantLocationHidden, setPlantDeleted, setPlantPublished, retagPlant, reviewObservation, notify } = useStore();
  const staff = can(role, "pending");
  const canReview = can(role, "review");
  const canPublish = can(role, "publishPlants");
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState(false); // review mode on an unpublished plant
  const [unpublishing, setUnpublishing] = useState(false); // reason box open
  const [qrBig, setQrBig] = useState(false); // QR code enlarged for scanning
  const [retagging, setRetagging] = useState(false); // RBAC D13: "Move to a new tag" popup
  const [decided, setDecided] = useState(null); // the decision just made here, for the "done" panel
  const [ask, confirmDialog] = useConfirm();

  const plant = visiblePlants(db, role).find((p) => p.qr_id === qr);
  // Visitors are sent no plants at start-up: ask the API for this one (CTIP-33).
  if (!plant && !staff) return <PublicPlant qr={qr} />;
  if (!plant) {
    const exists = db.plants.some((p) => p.qr_id === qr && !p.is_deleted);
    return (
      <section className="glass pad prose narrow">
        <h1>{exists ? "This plant is not published yet" : "Tag not found"}</h1>
        <p>{exists ? <>Tag <Mono>{qr}</Mono> is still being checked by park officers. Its page will open here once it is approved.</> : <>There is no plant with tag <Mono>{qr}</Mono>. Check the code on the tag.</>}</p>
        <a className="btn" href="#/plants"><Icon name="leaf" size={18} /> Browse all plants</a>
      </section>
    );
  }

  const rawPlant = db.plants.find((p) => p.id === plant.id);
  const visits = plantVisits(db, plant.id, role);
  const plantObs = db.observations.filter((o) => o.specimen_id === plant.id).sort((a, b) => (b.observed_at || "").localeCompare(a.observed_at || ""));
  // Several can wait at once (a revisit may join the queue, RBAC D19): officers decide the oldest first.
  const waiting = plantObs.filter((o) => o.status === "synced");
  const pendingObs = waiting[waiting.length - 1];
  // Botanists only get their own unfinished observations (RBAC D16), so another
  // botanist never sees that a plant was sent back.
  const returnedObs = plantObs.find((o) => o.status === "returned");
  const approvedObs = plantObs.find((o) => o.status === "approved"); // the newest approved one
  const withdrawn = plant.withdrawn;
  const published = plant.status === "approved" && !withdrawn;
  const sentBack = withdrawn && returnedObs ? lastReturn(db, returnedObs.id) : null;
  const reviewOpen = reviewing && withdrawn && canReview && !pendingObs;
  // Botanists fix photos on their own records; officers change them only while reviewing.
  const canEditPhotos = role === "botanist" ? can(role, "editPhotos") && !pendingObs : canReview && !!pendingObs;
  const speciesList = db.species.filter((s) => !s.is_deleted);

  // The one status shown in the header. Once unpublished, "Published" is never shown.
  const stage = pendingObs ? "synced" : withdrawn ? (returnedObs ? "returned" : "unpublished") : plant.status;
  const stageText = stage === "returned" && withdrawn ? (role === "botanist" ? "Sent back for review" : "Sent back to botanist") : undefined;

  const first = visits[visits.length - 1];
  const updated = lastUpdated(db, plant, role);
  const coords = shownCoords(plant, role);
  const node = db.nodes.find((n) => n.specimen_id === plant.id);
  const obsIds = new Set(db.observations.filter((o) => o.specimen_id === plant.id).map((o) => o.id));
  const comments = db.comments.filter((c) => obsIds.has(c.observation_id)).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const siblings = plant.species ? visiblePlants(db, role).filter((p) => p.species_id === plant.species_id && p.id !== plant.id) : [];

  const tabs = [
    ["overview", "Overview"],
    staff && ["visits", `Visits`, visits.length],
    ["photos", "Photos", plant.photos.length],
    staff && node && ["sensor", "Sensor"],
    staff && ["discussion", "Discussion", comments.length],
  ].filter(Boolean);
  const active = tabs.some(([k]) => k === tab) ? tab : "overview";

  // Hiding a location is safe and saves at once; showing it to the public needs a typed word.
  const changeHidden = async (hide) => {
    if (!hide && !(await ask({ title: "Show exact location", confirmLabel: "Show location", word: "REVEAL", body: <p>Show the exact location of <b>{plant.qr_id}</b> to the public? Anyone will be able to find this plant on the map.</p> }))) return;
    setPlantLocationHidden(plant.id, hide);
  };

  // RBAC D4: officers delete a plant (soft delete, restorable from Tagged plants > Deleted plants).
  const deletePlant = async () => {
    const ok = await ask({
      title: "Delete tagged plant",
      confirmLabel: "Delete plant",
      word: "DELETE",
      body: <p>Delete <b>{plant.qr_id}</b>? It leaves every list, the map and the public pages. Its tag stays taken and its records are kept, so an officer can restore it later.</p>,
    });
    if (ok && (await setPlantDeleted(plant.id, true))) go("/dashboard/all");
  };

  // RBAC D17: publishing again is its own step, with a typed word, so the officer
  // knows the plant goes back in front of visitors.
  const blockedPublish = pendingObs
    ? "An observation is waiting for review. Decide it first."
    : returnedObs
    ? "The plant is with the botanist. Wait for them to resend it, then review it."
    : !approvedObs
    ? "No observation is approved yet."
    : "";
  const publishAgain = async () => {
    if (blockedPublish) return notify(blockedPublish);
    const ok = await ask({
      title: "Publish again",
      confirmLabel: "Publish again",
      word: "PUBLISH",
      body: (
        <>
          <p>Put <b>{plant.qr_id}</b> back in the plant library, on the public map and on its QR page? Visitors will be able to see it.</p>
          {plant.lat != null && <p className="mute small">{plant.endangered ? "Its exact location stays hidden from the public." : "Its exact location will be shown on the public map."}</p>}
          {plant.species && !plant.species.is_published && <p className="mute small">Its species is not published yet, so visitors will not see it until the species is.</p>}
        </>
      ),
    });
    if (ok) await setPlantPublished(plant.id, true);
  };

  return (
    <>
      {confirmDialog}
      {staff && <BackButton fallback="/dashboard/all" />}
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href={staff ? "#/dashboard/all" : "#/plants"}>{staff ? "Tagged plants" : "Plants"}</a> <span aria-hidden="true">›</span>{" "}
        {plant.species ? <a href={"#/plants/" + plant.species.id}>{plant.name}</a> : <span>{plant.name}</span>} <span aria-hidden="true">›</span>{" "}
        <Mono><span aria-current="page">{plant.qr_id}</span></Mono>
      </nav>

      <section className="glass pad tagheader">
        <Img className="tagthumb" src={plant.photos[0]?.url} alt="" />
        <div className="grow">
          {staff && (
            <p className="row wrap">
              <Chip value={stage}>{stageText}</Chip>
              {plant.species && <Chip value={plant.conservation} />}
            </p>
          )}
          <h1 className="tagid">{plant.qr_id}</h1>
          <p className="lede-s">
            {plant.species ? <a className="textlink" href={"#/plants/" + plant.species.id}>{plant.name}</a> : <b>{plant.name}</b>}
            {plant.scientific && <> · <Sci>{plant.scientific}</Sci></>}
          </p>
          <p className="mute small">
            {first ? `First recorded ${fmtDate(first.observed_at)} by ${nameOf(db, plant.registered_by)}` : `Tagged by ${nameOf(db, plant.registered_by)}`}
            {visits.length > 0 && ` · ${visits.length} ${visits.length === 1 ? "visit" : "visits"} · last visited ${fmtDate(visits[0].observed_at)}`}
            {updated && ` · last updated ${fmtDate(updated)}`}
          </p>
        </div>
        <div className="row wrap">
          {canReview && pendingObs && (
            <button type="button" className="btn" onClick={scrollToReview}>
              <Icon name="clipboard" size={16} /> Review record (Action needed)
            </button>
          )}
          {canReview && withdrawn && !pendingObs && !reviewOpen && (
            <button type="button" className="btn" onClick={() => { setDecided(null); setReviewing(true); }}>
              <Icon name="clipboard" size={16} /> Review tag
            </button>
          )}
          {canPublish && withdrawn && (
            <button type="button" className="btn ghost" onClick={publishAgain} aria-disabled={!!blockedPublish} title={blockedPublish || undefined}>
              <Icon name="eye" size={16} /> Publish again
            </button>
          )}
          {canPublish && published && !unpublishing && (
            <button type="button" className="btn ghost" onClick={() => setUnpublishing(true)}>
              <Icon name="eyeOff" size={16} /> Unpublish plant
            </button>
          )}
          {coords && <a className="btn ghost" href={"#/map/" + plant.qr_id}><Icon name="pin" size={16} /> Show on map</a>}
          {can(role, "tags") && <a className="btn ghost" href="#/tags"><Icon name="printer" size={16} /> Print tags</a>}
          {can(role, "retag") && <button type="button" className="btn ghost" onClick={() => setRetagging(true)}><Icon name="qr" size={16} /> Move to a new tag</button>}
          {can(role, "deletePlants") && <button type="button" className="btn ghost" onClick={deletePlant}><Icon name="trash" size={16} /> Delete plant</button>}
        </div>
      </section>

      {retagging && (
        <RetagDialog
          plant={plant}
          tags={db.tags}
          onClose={() => setRetagging(false)}
          onMove={async (qrId, oldTag) => {
            const moved = await retagPlant(plant.id, qrId, oldTag);
            if (moved) { setRetagging(false); go("/tag/" + moved); }
          }}
        />
      )}

      {/* RBAC D17: why the plant is off public view. Staff only; visitors just get "not published". */}
      {staff && withdrawn && (
        <div className="callout" role="status">
          <p><Icon name="eyeOff" size={16} /> <b>Unpublished.</b> {plant.withdrawn_reason || "No reason was given."}</p>
          <p className="mute small">
            By {nameOf(db, plant.withdrawn_by)} on {fmtDateTime(plant.withdrawn_at)}. Visitors cannot see this plant.
            {canPublish && " Use Review tag to change it or send it back to the botanist. It stays unpublished until you press Publish again."}
          </p>
        </div>
      )}

      {/* RBAC D18: sent back to the botanist while unpublished. */}
      {sentBack && returnedObs.recorded_by === me?.id && role === "botanist" && (
        <div className="callout" role="status">
          <p><Icon name="undo" size={16} /> <b>Sent back for review.</b> {sentBack.comment || "Please check this record."}</p>
          <p className="mute small">From {nameOf(db, sentBack.reviewer_id)} on {fmtDateTime(sentBack.created_at)}. Fix your observation of {fmtDate(returnedObs.observed_at)} and send it again. An officer reviews it before the plant can be published again.</p>
          <p><a className="btn" href="#/records"><Icon name="send" size={18} /> Fix and resend</a></p>
        </div>
      )}
      {sentBack && role !== "botanist" && (
        <div className="callout" role="status">
          <p><Icon name="undo" size={16} /> <b>Sent back to {nameOf(db, returnedObs.recorded_by)}.</b> {sentBack.comment}</p>
          <p className="mute small">By {nameOf(db, sentBack.reviewer_id)} on {fmtDateTime(sentBack.created_at)}. Waiting for the botanist to fix and resend it; it then comes back to the review queue.</p>
        </div>
      )}

      {canPublish && unpublishing && published && (
        <UnpublishPanel plant={plant} ask={ask} notify={notify} setPlantPublished={setPlantPublished} onClose={() => setUnpublishing(false)} />
      )}

      {/* Saved without its record (an earlier send failed half-way): only the botanist who tagged it can finish it. */}
      {visits.length === 0 && me?.id === plant.registered_by && can(role, "add") && (
        <div className="callout">
          <p><b>Not sent yet.</b> This plant was saved, but its record did not reach the server, so no officer can see it. Add the details and photos, then send it for review.</p>
          <p><a className="btn" href={`#/add/${encodeURIComponent(plant.qr_id)}`}><Icon name="send" size={18} /> Finish and send</a></p>
        </div>
      )}

      {/* After a decision: say what happened and offer the way back. */}
      {decided && (
        <section className="reviewdone" role="status">
          <span className="reviewdone-ic"><Icon name={decided === "approve" ? "check" : decided === "reject" ? "x" : "undo"} size={22} /></span>
          <div className="grow">
            <b>
              {decided === "approve" ? (withdrawn ? "Approved. The plant stays unpublished." : "Approved and published")
                : decided === "return" ? "Returned to the botanist"
                : decided === "sentBack" ? "Sent back to the botanist"
                : "Record rejected"}
            </b>
            <p className="mute small">
              {decided === "approve" && withdrawn ? "Press Publish again when it is ready for visitors."
                : pendingObs ? `Another observation of ${plant.qr_id} is waiting. It is below.`
                : `${plant.qr_id} is done. Go back to where you were, or open the next record.`}
            </p>
          </div>
          <div className="row wrap">
            <BackButton fallback="/review" label="Back to previous page" className="btn" />
            <a className="btn ghost" href="#/review">Next in the queue</a>
          </div>
        </section>
      )}

      {/* An observation waiting for review: approve, return or reject it here. */}
      {canReview && pendingObs && (
        <OfficerReviewCard
          key={pendingObs.id}
          obs={pendingObs}
          waitingCount={waiting.length}
          rawPlant={rawPlant}
          plant={plant}
          speciesList={speciesList}
          reviewObservation={reviewObservation}
          setPlantSpecies={setPlantSpecies}
          setPlantLocationHidden={setPlantLocationHidden}
          notify={notify}
          onDecided={setDecided}
        />
      )}

      {/* RBAC D18: review mode on an unpublished plant. */}
      {reviewOpen && (
        <ReviewModePanel
          key={plant.id}
          plant={plant}
          rawPlant={rawPlant}
          approvedObs={approvedObs}
          returnedObs={returnedObs}
          botanist={approvedObs ? nameOf(db, approvedObs.recorded_by) : ""}
          speciesList={speciesList}
          notify={notify}
          setPlantSpecies={setPlantSpecies}
          setPlantLocationHidden={setPlantLocationHidden}
          setPlantPhotos={setPlantPhotos}
          reviewObservation={reviewObservation}
          onClose={() => setReviewing(false)}
          onSentBack={() => { setReviewing(false); setDecided("sentBack"); }}
        />
      )}

      <div className="tabs" role="tablist" aria-label="Plant sections">
        {tabs.map(([k, text, n]) => (
          <button key={k} role="tab" id={"tab-" + k} aria-selected={active === k} aria-controls="tabpanel" className={active === k ? "on" : ""} onClick={() => setTab(k)}>
            {text}{n != null && <span className="mute"> {n}</span>}
          </button>
        ))}
      </div>

      <div className="tagbody">
        <section id="tabpanel" role="tabpanel" aria-labelledby={"tab-" + active} className="tabpanel">
          {active === "overview" && (
            <div className="glass pad">
              <PhotoGallery key={plant.id} photos={plant.photos} canEdit={canEditPhotos} onEdit={() => setEditing(true)} />
              {role === "botanist" && pendingObs && (
                <p className="mute small" style={{ marginTop: 8 }}>
                  <Icon name="lock" size={14} /> {waiting.length > 1 ? `${waiting.length} of your observations are` : "Your observation is"} waiting for an officer's review. Photo editing is locked until a decision is returned; you can still record a revisit on the phone.
                </p>
              )}
              {plant.species?.description && <p className="gap-top-s">{plant.species.description}</p>}
              <dl className="gap-top-s">
                <dt>Family</dt><dd>{plant.species ? `${plant.species.family} · ${plant.species.genus}` : "Not confirmed yet"}</dd>
                <dt>Height</dt><dd>{height(plant.height_cm)}</dd>
                {plant.morphology && <><dt>Appearance</dt><dd>{plant.morphology}</dd></>}
                {plant.species?.ecology && <><dt>Habitat and ecology</dt><dd>{plant.species.ecology}</dd></>}
                {plant.species?.cultural_significance && <><dt>Cultural note</dt><dd>{plant.species.cultural_significance}</dd></>}
              </dl>
            </div>
          )}

          {active === "visits" && <Visits db={db} visits={visits} photos={plant.photos} canReview={canReview} />}

          {active === "photos" && (
            plant.photos.length ? (
              <ul className="plain photogrid">
                {plant.photos.map((ph, i) => (
                  <li key={ph.id}>
                    <Img src={ph.url} alt={`Photo ${i + 1} of ${plant.qr_id}`} />
                    <small className="mute">{i === 0 ? "Primary · " : ""}{fmtDate(ph.created_at)}</small>
                  </li>
                ))}
              </ul>
            ) : <div className="glass pad"><Empty icon="camera">No photos yet.</Empty></div>
          )}

          {active === "sensor" && node && <Sensor db={db} node={node} />}

          {active === "discussion" && (
            <div className="glass pad">
              {!comments.length && <Empty icon="chat">No messages about this plant yet.</Empty>}
              <ul className="posts">
                {comments.map((c) => (
                  <li key={c.id} className="post">
                    <header><b>{nameOf(db, c.author_id)}</b><small className="mute">{fmtDateTime(c.created_at)}</small></header>
                    <p>{c.body}</p>
                  </li>
                ))}
              </ul>
              {can(role, "discuss") && visits[0] && (
                <p className="row wrap">
                  <a className="btn ghost" href={"#/discussion/" + (comments.at(-1)?.observation_id || visits[0].id)}><Icon name="chat" size={16} /> Open in Discussion</a>
                  <a className="btn ghost" href={"#/discussion?obs=" + visits[0].id}><Icon name="send" size={16} /> Start a discussion</a>
                </p>
              )}
            </div>
          )}
        </section>

        <aside className="tagside">
          <section className="glass pad">
            <h2>Location</h2>
            {coords ? (
              <>
                <MiniMap points={[{ p: plant, c: coords }]} height={150} highlight={plant.qr_id} label={`Location of ${plant.qr_id}`} expandable mapHref={"#/map/" + plant.qr_id} />
                <p className="gap-top-s"><Mono>{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</Mono></p>
                {plant.location_reduced
                  ? <p className="mute small">{REDUCED_LOCATION_NOTE}</p>
                  : plant.gps_accuracy_m != null && <p className="mute small">GPS accuracy ±{plant.gps_accuracy_m} m</p>}
                {/* RBAC D15: officers and admins. While an officer has a review open (the review card
                    for a waiting observation, or review mode), the switch is part of that review instead. */}
                {can(role, "hideLocation") && !(canReview && (pendingObs || reviewOpen)) && (
                  <label className="check hidespot gap-top-s">
                    <input
                      type="checkbox"
                      checked={plant.endangered}
                      disabled={hideLocationRule(plant.species?.conservation_status).locked}
                      onChange={(e) => changeHidden(e.target.checked)}
                      aria-label="Hide the exact location from the public"
                    />
                    <span>
                      {HIDE_LOCATION_LABEL}
                      <small className="mute block">{hideLocationRule(plant.species?.conservation_status).hint}</small>
                    </span>
                  </label>
                )}
              </>
            ) : (
              <p className="mute">{plant.lat == null ? "Location not captured when this plant was recorded." : HIDDEN_LOCATION_NOTE}</p>
            )}
          </section>
          {staff && (
            <section className="glass pad">
              <h2>QR tag</h2>
              <div className="qrbox">
                <button type="button" className="qrwhite qrbtn" onClick={() => setQrBig(true)} aria-label={`Enlarge QR code for ${plant.qr_id}`} title="Enlarge to scan">
                  <QRCodeSVG value={tagUrl(plant.qr_id)} size={76} />
                </button>
                <p className="mute small">Scanning this tag opens this page. Select the code to enlarge it.</p>
              </div>
              {qrBig && (
                <Modal title={`QR tag ${plant.qr_id}`} onClose={() => setQrBig(false)}>
                  <div className="qrwhite qrlarge"><QRCodeSVG value={tagUrl(plant.qr_id)} size={512} /></div>
                  <p className="mute small gap-top-s" style={{ textAlign: "center" }}>Point a phone camera at the code to open this page.</p>
                </Modal>
              )}
            </section>
          )}
          {plant.species && (
            <section className="glass pad">
              <h2>Same species</h2>
              <p className="mute">{siblings.length ? `${siblings.length} other tagged ${plant.name} ${siblings.length === 1 ? "plant" : "plants"} in the park.` : `This is the only tagged ${plant.name} so far.`}</p>
              <a className="textlink" href={"#/plants/" + plant.species.id}>About this species <Icon name="arrowR" size={16} /></a>
            </section>
          )}
          {staff && node && (
            <section className={"glass pad" + (node.status === "active" ? "" : " dashedcard")}>
              <h2>Sensor node</h2>
              <p className="mute">{node.name} is attached to this plant. {node.status === "active" ? `Last reading ${fmtDateTime(node.last_seen)}.` : `It has been ${node.status} since ${fmtDate(node.last_seen)}.`}</p>
            </section>
          )}
        </aside>
      </div>

      {editing && (
        <PhotoEditor
          photos={plant.photos}
          captions
          requireCaptions={false}
          min={0}
          allowUpload={false}
          arrange={false}
          onClose={() => setEditing(false)}
          onSave={async (list) => {
            setEditing(false);
            const res = await setPlantPhotos(plant.id, list);
            notify(res.ok ? "Photos saved" : res.message);
          }}
        />
      )}
    </>
  );
}

// The botanist's guess, and a one-click "use it" when it matches a species in the catalogue.
function SpeciesGuess({ proposed, speciesId, speciesList, onPick }) {
  if (!proposed) return null;
  const needle = proposed.trim().toLowerCase();
  const match = !speciesId && speciesList.find(
    (s) => s.scientific_name.toLowerCase() === needle ||
           (s.common_name && s.common_name.toLowerCase() === needle) ||
           needle.includes(s.scientific_name.toLowerCase()) ||
           s.scientific_name.toLowerCase().includes(needle)
  );
  return (
    <div className="row wrap gap-top-xs" style={{ alignItems: "center" }}>
      <p className="mute small" style={{ margin: 0 }}>Botanist's guess: <Sci>{proposed}</Sci></p>
      {match && (
        <button type="button" className="btn ghost small-btn" onClick={() => onPick(match.id)}>
          Use guess: {match.scientific_name}
        </button>
      )}
    </div>
  );
}

function SpeciesSelect({ value, speciesList, onChange, hint }) {
  return (
    <label>
      Confirm species {hint && <span className="hint">{hint}</span>}
      <select value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Not confirmed</option>
        {speciesList.map((s) => (
          <option key={s.id} value={s.id}>
            {s.scientific_name}{s.common_name ? ` (${s.common_name})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

// RBAC D17: take a published plant off public view. Reason first, then a typed word,
// like approving (both change what the public sees).
function UnpublishPanel({ plant, ask, notify, setPlantPublished, onClose }) {
  const [reason, setReason] = useState("");
  const submit = async () => {
    if (!reason.trim()) return notify("Add a reason so the botanist knows why");
    const ok = await ask({
      title: "Unpublish plant",
      confirmLabel: "Unpublish",
      danger: true,
      word: "UNPUBLISH",
      body: <p>Take <b>{plant.qr_id}</b> off public view? Visitors will no longer find it in the plant library, on the map or by scanning its tag. The botanist is told why.</p>,
    });
    if (ok && (await setPlantPublished(plant.id, false, reason))) onClose();
  };
  return (
    <section className="glass pad gap-bottom-s">
      <h2 style={{ marginTop: 0, fontSize: 18 }}><Icon name="eyeOff" size={18} /> Unpublish {plant.qr_id}</h2>
      <p className="mute small">Hides the whole plant from visitors. Its observations keep their decisions. Once it is unpublished you can review it (change the species, photos or location setting, or send it back to the botanist), then publish it again.</p>
      <div className="field gap-bottom-s">
        <label>
          Reason <span className="hint">(sent to the botanist)</span>
          <textarea rows="2" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: wrong species on the tag" />
        </label>
      </div>
      <div className="row wrap">
        <button className="btn danger" type="button" onClick={submit}><Icon name="eyeOff" size={18} /> Unpublish</button>
        <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
      </div>
    </section>
  );
}

const PHOTO_CAPTION_MAX = 200; // the API's limit (PhotoCaption in services/api/src/field.js)

// RBAC D18: review mode on an unpublished plant. The officer changes a draft
// (species, photos, hide-location switch); nothing is saved until "Save changes"
// or "Send back to botanist". The plant stays unpublished either way.
function ReviewModePanel({ plant, rawPlant, approvedObs, returnedObs, botanist, speciesList, notify, setPlantSpecies, setPlantLocationHidden, setPlantPhotos, reviewObservation, onClose, onSentBack }) {
  const [speciesId, setSpeciesId] = useState(rawPlant?.species_id || null);
  const [hideChoice, setHideChoice] = useState(null); // null until the officer changes it
  const [captions, setCaptions] = useState({}); // photo id -> edited caption
  const [removed, setRemoved] = useState(() => new Set()); // photo ids marked for removal
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [ask, confirmDialog] = useConfirm();

  const species = speciesList.find((s) => s.id === speciesId) || null;
  const hideRule = hideLocationRule(species?.conservation_status, rawPlant?.endangered_override, hideChoice);
  const speciesChanged = (speciesId || null) !== (rawPlant?.species_id || null);
  const hideChanged = plant.lat != null && !hideRule.locked && hideRule.on !== !!rawPlant?.endangered_override;
  const captionOf = (ph) => (ph.id in captions ? captions[ph.id] : ph.caption || "");
  const captionsChanged = plant.photos.some((ph) => !removed.has(ph.id) && captionOf(ph).trim() !== (ph.caption || "").trim());
  const photosChanged = removed.size > 0 || captionsChanged;
  const kept = plant.photos.filter((ph) => !removed.has(ph.id));
  const changes = [
    speciesChanged && "the species",
    removed.size > 0 && `remove ${removed.size} ${removed.size === 1 ? "photo" : "photos"}`,
    captionsChanged && "photo captions",
    hideChanged && (hideRule.on ? "hide the exact location" : "show the exact location"),
  ].filter(Boolean);
  const dirty = changes.length > 0;
  // Only an approved observation can be sent back, and only one at a time.
  const canSendBack = !!approvedObs && !returnedObs;

  const toggleRemoved = (id) => {
    const next = new Set(removed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setRemoved(next);
  };

  // Save the draft, species first (it decides whether the location is always hidden).
  const applyDraft = async () => {
    if (speciesChanged && !(await setPlantSpecies(rawPlant.id, speciesId))) return false;
    if (hideChanged && !(await setPlantLocationHidden(rawPlant.id, hideRule.on))) return false;
    if (photosChanged) {
      const res = await setPlantPhotos(plant.id, kept.map((ph) => ({ ...ph, caption: captionOf(ph) })));
      if (!res.ok) {
        notify(res.message);
        return false;
      }
    }
    return true;
  };

  const changeList = dirty && <p>Changes: {changes.join(", ")}.</p>;

  const save = async () => {
    if (!dirty) return notify("Nothing to save yet");
    const ok = await ask({
      title: "Save changes",
      confirmLabel: "Save changes",
      danger: removed.size > 0,
      body: <>{changeList}{removed.size > 0 && <p className="mute small">Removed photos are deleted for good.</p>}<p className="mute small">{plant.qr_id} stays unpublished until you press Publish again.</p></>,
    });
    if (!ok) return;
    setBusy(true);
    const saved = await applyDraft();
    setBusy(false);
    if (saved) {
      notify("Changes saved. The plant is still unpublished.");
      onClose();
    }
  };

  const sendBack = async () => {
    if (!canSendBack) return;
    if (!reason.trim()) return notify("Add a reason so the botanist knows what to fix");
    const ok = await ask({
      title: "Send back to botanist",
      confirmLabel: "Send back",
      body: (
        <>
          <p>Send <b>{plant.qr_id}</b> back to {botanist || "the botanist"}? Their observation of {fmtDate(approvedObs.observed_at)} goes back to them with your reason, and they see it as <b>sent back for review</b>.</p>
          {changeList}
          <p className="mute small">When they resend it, it comes back to the review queue. The plant stays unpublished until you press Publish again.</p>
        </>
      ),
    });
    if (!ok) return;
    setBusy(true);
    const saved = await applyDraft();
    const res = saved ? await reviewObservation(approvedObs.id, "return", reason.trim()) : { ok: false };
    setBusy(false);
    if (res.ok) onSentBack();
  };

  const discard = async () => {
    if (dirty && !(await ask({ title: "Discard changes", confirmLabel: "Discard", danger: true, body: "Throw away the changes you made in review mode? Nothing has been saved." }))) return;
    onClose();
  };

  return (
    <section id="review-card" className="glass pad gap-bottom-s reviewmode">
      {confirmDialog}
      <header className="rv-head">
        <div className="row wrap" style={{ alignItems: "center", gap: 10 }}>
          <Icon name="clipboard" size={20} />
          <h2>Review mode · {plant.qr_id}</h2>
          <Chip value="unpublished" />
          <span className={"rv-state" + (dirty ? " on" : "")}>{dirty ? `Unsaved: ${changes.join(", ")}` : "No changes yet"}</span>
        </div>
        <p className="mute small">Changes here are a draft. They are saved only when you press Save changes or Send back to botanist. The plant stays unpublished either way.</p>
      </header>

      <section className="rv-sec" aria-labelledby="rv-species">
        <h3 id="rv-species"><span className="rv-num">1</span> Species</h3>
        <div className="rv-species">
          <SpeciesSelect value={speciesId} speciesList={speciesList} onChange={setSpeciesId} />
          <div className="row wrap" style={{ alignItems: "center", gap: 12 }}>
            <NewSpeciesButton guess={rawPlant?.proposed_species} onCreated={(s) => setSpeciesId(s.id)} />
          </div>
          <SpeciesGuess proposed={rawPlant?.proposed_species} speciesId={speciesId} speciesList={speciesList} onPick={setSpeciesId} />
        </div>
      </section>

      <section className="rv-sec" aria-labelledby="rv-photos">
        <h3 id="rv-photos">
          <span className="rv-num">2</span> Photos
          <span className="mute small">{kept.length} of {plant.photos.length} kept</span>
        </h3>
        {/* RBAC D1: only botanists add observation photos. */}
        <p className="mute small" style={{ margin: 0 }}>Edit a caption or remove a photo. To add a new photo, send the plant back and ask the botanist for it.</p>
        {plant.photos.length ? (
          <ul className="plain rv-photos">
            {plant.photos.map((ph, i) => {
              const gone = removed.has(ph.id);
              return (
                <li key={ph.id} className={"rv-photo" + (gone ? " removed" : "")}>
                  <Img src={ph.url} alt={`Photo ${i + 1} of ${plant.qr_id}`} />
                  {gone ? (
                    <p className="mute small">Will be removed when you save.</p>
                  ) : (
                    <label className="rv-cap">
                      <span className="sr">Caption for photo {i + 1}</span>
                      <textarea rows="2" maxLength={PHOTO_CAPTION_MAX} value={captionOf(ph)} placeholder="Caption (optional)" onChange={(e) => setCaptions({ ...captions, [ph.id]: e.target.value })} />
                    </label>
                  )}
                  <button type="button" className={"btn small-btn " + (gone ? "" : "ghost")} onClick={() => toggleRemoved(ph.id)}>
                    <Icon name={gone ? "undo" : "trash"} size={14} /> {gone ? "Undo" : "Remove"}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mute">No photos on this plant.</p>
        )}
      </section>

      {plant.lat != null && (
        <section className="rv-sec" aria-labelledby="rv-location">
          <h3 id="rv-location"><span className="rv-num">3</span> Location</h3>
          <label className="check hidespot">
            <input type="checkbox" checked={hideRule.on} disabled={hideRule.locked} onChange={(e) => setHideChoice(e.target.checked)} />
            <span>
              <b>{HIDE_LOCATION_LABEL}</b>
              <small className="mute block">{hideRule.hint}</small>
            </span>
          </label>
        </section>
      )}

      <section className="rv-sec" aria-labelledby="rv-back">
        <h3 id="rv-back"><span className="rv-num">{plant.lat != null ? 4 : 3}</span> Send back to the botanist <span className="mute small">(optional)</span></h3>
        {canSendBack ? (
          <label className="rv-reason">
            <span className="mute small">Only needed to send it back. {botanist || "The botanist"} sees this reason.</span>
            <textarea rows="3" maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What should the botanist fix?" />
          </label>
        ) : (
          <p className="mute">{returnedObs ? "Already sent back. Waiting for the botanist to resend it." : "No approved observation to send back."}</p>
        )}
      </section>

      <div className="decide row wrap">
        <button className="btn" type="button" onClick={save} disabled={busy || !dirty}>
          <Icon name="check" size={18} /> Save changes
        </button>
        {canSendBack && (
          <button className="btn ghost" type="button" onClick={sendBack} disabled={busy}>
            <Icon name="undo" size={18} /> Send back to botanist
          </button>
        )}
        <button className="btn ghost" type="button" onClick={discard} disabled={busy}>
          <Icon name="x" size={18} /> {dirty ? "Discard changes" : "Close"}
        </button>
      </div>
    </section>
  );
}

// The review card for an observation waiting for review (status synced).
function OfficerReviewCard({ obs, waitingCount = 1, rawPlant, plant, speciesList, reviewObservation, setPlantSpecies, setPlantLocationHidden, notify, onDecided }) {
  const [comment, setComment] = useState("");
  const [hideChoice, setHideChoice] = useState(null); // null until the officer changes it
  const [busy, setBusy] = useState(false);
  const [ask, confirmDialog] = useConfirm();
  const hideRule = hideLocationRule(plant.species?.conservation_status, rawPlant?.endangered_override, hideChoice);
  // RBAC D17: approving an unpublished plant's observation does not publish it.
  const staysUnpublished = plant.withdrawn;

  const handleDecide = async (decision) => {
    if (decision !== "approve" && !comment.trim()) {
      return notify("Add a note so the botanist knows why");
    }
    if (decision === "approve" && !rawPlant?.species_id) {
      return notify("Confirm the species before approving");
    }
    if (!(await ask(decisionPrompt(decision, plant.qr_id, { hidden: hideRule.on, hasCoords: rawPlant?.lat != null, speciesPublished: plant.species?.is_published, unpublished: staysUnpublished })))) return;
    setBusy(true);
    if (decision === "approve" && !hideRule.locked && hideRule.on !== !!rawPlant.endangered_override) {
      if (!(await setPlantLocationHidden(rawPlant.id, hideRule.on))) return setBusy(false);
    }
    const res = await reviewObservation(obs.id, decision, comment.trim());
    setBusy(false);
    if (!res?.ok) return;
    setComment("");
    onDecided?.(decision);
  };

  return (
    <section id="review-card" className="glass pad gap-bottom-s" style={{ border: "2px solid var(--acc)", borderRadius: "var(--r-card, 16px)", background: "var(--sunken)" }}>
      {confirmDialog}
      <div className="row between wrap gap-bottom-s" style={{ alignItems: "center" }}>
        <div className="row wrap" style={{ alignItems: "center", gap: 8 }}>
          <Icon name="clipboard" size={20} />
          <h2 style={{ margin: 0, fontSize: 18 }}>Officer Review · {plant.qr_id}</h2>
          <span className="mute small">(Observation v{obs.version || 1})</span>
        </div>
        <Chip value={obs.status} />
      </div>
      {waitingCount > 1 && (
        <p className="mute small gap-bottom-s">
          {waitingCount} observations of this plant are waiting. This is the oldest, recorded {fmtDate(obs.observed_at)}; the next one shows here once you decide it.
        </p>
      )}

      <div className="field gap-bottom-s">
        <SpeciesSelect value={rawPlant?.species_id} speciesList={speciesList} onChange={(id) => setPlantSpecies(rawPlant.id, id)} hint="(confirm before approving)" />
        <NewSpeciesButton guess={rawPlant?.proposed_species} onCreated={(s) => setPlantSpecies(rawPlant.id, s.id)} />
        <SpeciesGuess proposed={rawPlant?.proposed_species} speciesId={rawPlant?.species_id} speciesList={speciesList} onPick={(id) => setPlantSpecies(rawPlant.id, id)} />
      </div>

      {plant.lat != null && (
        <label className="check hidespot gap-bottom-s">
          <input type="checkbox" checked={hideRule.on} disabled={hideRule.locked} onChange={(e) => setHideChoice(e.target.checked)} />
          <span>
            <b>{HIDE_LOCATION_LABEL}</b>
            <small className="mute block">{hideRule.locked ? "" : "Saved when you approve. "}{hideRule.hint}</small>
          </span>
        </label>
      )}

      <div className="field gap-bottom-s">
        <label>
          Note to the botanist <span className="hint">(needed to return or reject)</span>
          <textarea
            rows="2"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What needs to change or reason for decision..."
          />
        </label>
      </div>

      {staysUnpublished && <p className="mute small gap-bottom-s">This plant is unpublished. Approving does not publish it; press Publish again afterwards when it is ready.</p>}
      <div className="decide row wrap">
        <button className="btn" type="button" onClick={() => handleDecide("approve")} disabled={busy}>
          <Icon name="check" size={18} /> {staysUnpublished ? "Approve" : <>Approve &amp; publish</>}
        </button>
        <button className="btn ghost" type="button" onClick={() => handleDecide("return")} disabled={busy}>
          <Icon name="undo" size={18} /> Return for changes
        </button>
        <button className="btn danger" type="button" onClick={() => handleDecide("reject")} disabled={busy}>
          <Icon name="x" size={18} /> Reject
        </button>
      </div>
    </section>
  );
}

// Height chart plus one card per visit (observation), newest first. Read-only:
// decisions are made in the review card at the top of the page.
function Visits({ db, visits, photos, canReview }) {
  if (!visits.length) return <div className="glass pad"><Empty>No visits recorded yet.</Empty></div>;
  const withHeight = [...visits].reverse().filter((v) => v.height_cm != null);

  return (
    <>
      {withHeight.length > 1 && <HeightChart visits={withHeight} />}
      <ol className="timeline">
        {visits.map((v) => {
          const review = db.reviews.filter((r) => r.observation_id === v.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
          const pics = photos.filter((p) => p.observation_id === v.id);

          return (
            <li key={v.id} className={"tl-" + v.status}>
              <article className="glass pad">
                <header className="row between wrap">
                  <div>
                    <b className="block">{fmtDate(v.observed_at)}</b>
                    <small className="mute">{nameOf(db, v.recorded_by)} · height {height(v.height_cm)}</small>
                  </div>
                  <div className="row wrap" style={{ alignItems: "center", gap: 8 }}>
                    <Chip value={v.status} />
                    {canReview && v.status === "synced" && (
                      <button type="button" className="btn ghost small-btn" onClick={scrollToReview}>
                        <Icon name="clipboard" size={14} /> Review
                      </button>
                    )}
                  </div>
                </header>
                {v.morphology && <p>{v.morphology}</p>}
                {v.notes && <p className="mute small">{v.notes}</p>}
                {pics.length > 0 && <div className="row wrap">{pics.map((p) => <Img key={p.id} className="mini" src={p.url} alt="" />)}</div>}

                <p className="mute small">
                  {v.status === "synced"
                    ? "Waiting for an officer to review."
                    : review
                      ? `${label(review.decision === "approve" ? "approved" : review.decision === "return" ? "returned" : "rejected")} by ${nameOf(db, review.reviewer_id)} on ${fmtDate(review.created_at)}${review.comment ? ` · “${review.comment}”` : ""}`
                      : v.status === "queued" || v.status === "draft"
                        ? "Saved on the phone. It goes to review once it syncs."
                        : "Waiting for an officer to review."}
                </p>
              </article>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function HeightChart({ visits }) {
  const w = 600, h = 110, pad = 24;
  const vals = visits.map((v) => v.height_cm);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const x = (i) => pad + (i / (visits.length - 1)) * (w - pad * 2);
  const y = (v) => (hi === lo ? h / 2 : h - pad - ((v - lo) / (hi - lo)) * (h - pad * 2));
  return (
    <figure className="glass pad heightchart">
      <figcaption className="row between wrap"><b>Height over time</b><span className="mute small">{height(vals[0])} → {height(vals.at(-1))}</span></figcaption>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Height went from ${height(vals[0])} to ${height(vals.at(-1))} over ${visits.length} visits`}>
        <polyline points={visits.map((v, i) => `${x(i)},${y(v.height_cm)}`).join(" ")} className="spark-line" />
        {visits.map((v, i) => (
          <g key={v.id}>
            <circle cx={x(i)} cy={y(v.height_cm)} r="5" className="hc-dot" />
            <text x={x(i)} y={y(v.height_cm) - 10} textAnchor="middle" className="hc-label">{height(v.height_cm)}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

// The node guarding this plant: its latest reading against the fixed stable range,
// the same range the database alert rule and the Monitoring page use.
// Per-node limits (node.thresholds) are not used, and are null on most nodes.
function Sensor({ db, node }) {
  const rows = db.telemetry?.[node.id] || [];
  const last = rows.at(-1);
  const ranges = fixedRanges(db);
  const fields = Object.entries(SENSOR_FIELDS);
  return (
    <div className="glass pad">
      <p className="row between wrap"><b>{node.name}</b><Chip value={node.status} /></p>
      {last ? (
        <p>
          Latest reading <span className="mute small">({fmtDateTime(last.ts)})</span>:{" "}
          {fields.map(([f, { label: name, unit }], i) => {
            const state = rangeState(last, f, ranges);
            return (
              <span key={f}>
                {i > 0 && " · "}{name.toLowerCase()} <Mono>{last[f] == null ? "-" : `${last[f]}${unit === "%" ? "%" : ` ${unit}`}`}</Mono>
                {state && <b className="warntext"> {state === "high" ? "above" : "below"} range</b>}
              </span>
            );
          })}
        </p>
      ) : <p className="mute">No readings yet.</p>}
      <p className="mute small">
        Alert range: {fields.map(([f, { label: name, unit }]) => `${name.toLowerCase()} ${rangeText(ranges[f], unit)}`).join(" · ")}.
      </p>
      <a className="btn ghost" href="#/monitoring"><Icon name="activity" size={16} /> Open Monitoring</a>
    </div>
  );
}

// RBAC D13: an officer moves a plant to a new tag when its tag is lost, damaged or
// unreadable. The old tag is marked first (retired or damaged) and never reused;
// the plant and its records stay the same.
function RetagDialog({ plant, tags, onClose, onMove }) {
  const [oldTag, setOldTag] = useState("");
  const [qrId, setQrId] = useState("");
  const [busy, setBusy] = useState(false);
  const unused = (tags || []).filter((t) => t.status === "unused" && t.batch_label !== "reserved").map((t) => t.qr_id);
  const ready = oldTag && qrId.trim() && qrId.trim().toUpperCase() !== plant.qr_id;
  const submit = async (e) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    await onMove(qrId.trim().toUpperCase(), oldTag);
    setBusy(false);
  };
  return (
    <Modal title="Move to a new tag" onClose={onClose}>
      <form className="retagform" onSubmit={submit}>
        <p>Use this when tag <Mono>{plant.qr_id}</Mono> is lost, damaged or cannot be scanned. The plant and its records stay the same; only the tag changes.</p>
        <fieldset>
          <legend><b>1. First, mark the old tag {plant.qr_id}</b></legend>
          <label className="inline"><input type="radio" name="old-tag" value="retired" checked={oldTag === "retired"} onChange={() => setOldTag("retired")} /> Retired (lost or removed)</label>
          <label className="inline"><input type="radio" name="old-tag" value="damaged" checked={oldTag === "damaged"} onChange={() => setOldTag("damaged")} /> Damaged (still there but unreadable)</label>
          <span className="mute small">The old tag can never be used again.</span>
        </fieldset>
        <label><b>2. New tag</b>
          <input value={qrId} onChange={(e) => setQrId(e.target.value)} list="retag-unused" placeholder="An unused tag, e.g. NIAH-0100" autoComplete="off" />
        </label>
        <datalist id="retag-unused">{unused.map((q) => <option key={q} value={q} />)}</datalist>
        <div className="row">
          <button className="btn" type="submit" disabled={!ready || busy}><Icon name="qr" size={16} /> Mark old tag and move</button>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
