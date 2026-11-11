import { useEffect, useRef } from "react";
import Icon from "../components/Icon.jsx";
import PlantCard from "../components/PlantCard.jsx";
import ForestScene from "../components/ForestScene.jsx";
import { Chip, Empty, Pills } from "../components/Bits.jsx";
import { useStore } from "../../../shared/store.js";
import { can } from "../../../shared/permissions.js";
import { familyColors, speciesCatalogue } from "../../../shared/selectors.js";
import { fuzzyMatch } from "../../../shared/fuzzy.js";
import { CONSERVATION, isThreatened, statusKey } from "../../../shared/data.js";
import { label } from "../../../shared/utils.js";
import { setQuery, useRoute } from "../useRoute.js";

const PAGE = 12;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const SORTS = [
  ["name", "Common name A–Z"],
  ["scientific", "Scientific name A–Z"],
  ["family", "Family A–Z"],
  ["endangered", "Endangered first"],
  ["tagged", "Most tagged"],
];

// Species catalogue (Daun v2): one card per species (not one per tagged plant).
// Read top to bottom it answers one question at a time:
//   1. the search bar, the first and biggest thing on the page,
//   2. a rail of plant families to browse by (swipe, or the arrow buttons),
//   3. a slim bar with what is shown, the filters in use (each removable), sort and view,
//   4. the cards.
// Everyone can open it. Visitors only get published species; only staff get the conservation filter.
// Every filter, the sort, the page and the view are kept in the URL
// (#/plants?q=…&family=…&genus=…&status=…&sort=…&page=…&view=…), so a search can be shared.
export default function Catalogue() {
  const { db, role, apiStatus, isSyncing, refreshFromBackend, backendSpeciesCount } = useStore();
  const staff = can(role, "pending");
  const { query } = useRoute();
  const q = query.q || "";
  const family = query.family || "all";
  const genus = query.genus || "all";
  const status = staff && query.status ? query.status : "all"; // visitors never filter by status
  const sort = SORTS.some(([k]) => k === query.sort) ? query.sort : "name";
  const view = query.view === "list" ? "list" : "grid";
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  // A new filter starts again at page 1. "all" is the default, so it is left out of the URL.
  const filter = (key) => (v) => setQuery({ [key]: v === "all" ? null : v, page: null });
  const setPage = (n) => {
    setQuery({ page: n > 1 ? n : null });
    resultsRef.current?.scrollIntoView({ block: "start" });
  };
  const searchRef = useRef(null);
  const railRef = useRef(null);
  const resultsRef = useRef(null);

  // "/" jumps to the search box from anywhere on the page, as on most big catalogues.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "/" || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const all = speciesCatalogue(db, role);
  const tagged = all.reduce((n, s) => n + s.plants.length, 0);
  const threatened = all.filter((s) => isThreatened(s.conservation_status)).length;
  const text = (s) => `${s.name} ${s.scientific_name} ${s.family} ${s.genus}`.toLowerCase();
  const searched = all.filter((s) => fuzzyMatch(text(s), q));
  const shown = searched
    .filter((s) => family === "all" || s.family === family)
    .filter((s) => genus === "all" || s.genus === genus)
    .filter((s) => status === "all" || statusKey(s.conservation_status) === status)
    .sort((a, b) => {
      if (sort === "scientific") return (a.scientific_name || "").localeCompare(b.scientific_name || "");
      if (sort === "family") return (a.family || "").localeCompare(b.family || "") || a.name.localeCompare(b.name);
      if (sort === "endangered") {
        const ea = isThreatened(a.conservation_status) ? 1 : 0;
        const eb = isThreatened(b.conservation_status) ? 1 : 0;
        return eb - ea || a.name.localeCompare(b.name);
      }
      if (sort === "tagged") return b.plants.length - a.plants.length || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });

  // Counts next to each family come from the searched list, so they match what you'd get.
  const familyCounts = Object.entries(
    searched.reduce((m, s) => ({ ...m, [s.family]: (m[s.family] || 0) + 1 }), {}),
  ).sort(([a], [b]) => a.localeCompare(b));
  // The same colour per family as on the map.
  const colors = familyColors(db.species, all.map((s) => ({ species: { family: s.family } })));
  // Genera of the chosen family (or of every family), from the searched list.
  const genera = [...new Set(searched.filter((s) => family === "all" || s.family === family).map((s) => s.genus).filter(Boolean))].sort();
  const statusCounts = CONSERVATION.map((c) => [c, searched.filter((s) => statusKey(s.conservation_status) === c).length]).filter(([, n]) => n);

  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const cur = Math.min(page, pages); // filters can shrink the page count
  const slice = shown.slice((cur - 1) * PAGE, cur * PAGE);

  // The filters in use, each with a way to remove just that one.
  const active = [
    q && { key: "q", text: `“${q}”`, clear: { q: null } },
    family !== "all" && { key: "family", text: family, clear: { family: null, genus: null } },
    genus !== "all" && { key: "genus", text: `Genus ${genus}`, clear: { genus: null } },
    status !== "all" && { key: "status", text: label(status), clear: { status: null } },
  ].filter(Boolean);

  const scrollRail = (dir) => railRef.current?.scrollBy({ left: dir * railRef.current.clientWidth * 0.8, behavior: "smooth" });
  const pickFamily = (f) => setQuery({ family: f === "all" || f === family ? null : f, genus: null, page: null });

  return (
    <div className="catpage">
      <section className="cathero">
        <ForestScene className="cathero-art" />
        <div className="cathero-text">
          <p className="overline">Plant library · Niah National Park</p>
          <h1>Plants of <span className="hl">Niah</span></h1>
          <form className="bigsearch" role="search" onSubmit={(e) => { e.preventDefault(); resultsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }}>
            <label className="search">
              <Icon name="search" size={20} />
              <input ref={searchRef} type="search" value={q} onChange={(e) => setQuery({ q: e.target.value, page: null })}
                placeholder="Name, scientific name, family or genus" aria-label="Search species" />
              <kbd className="slashkey" aria-hidden="true">/</kbd>
            </label>
          </form>
          <p className="catstats">
            <span><b>{all.length}</b> species</span>
            <span><b>{tagged}</b> tagged {tagged === 1 ? "plant" : "plants"}</span>
            {threatened > 0 && <span><b>{threatened}</b> threatened</span>}
            {apiStatus === "connected" && (
              <span className="api-badge on" title="Synchronized with GET /v1/public/species">
                <Icon name="cloud" size={12} /> {backendSpeciesCount > 0 ? `${backendSpeciesCount} from API` : "Live API"}
              </span>
            )}
          </p>
        </div>
      </section>

      {/* Browse by family: one swipeable row, coloured like the map. */}
      <section className="famrail-wrap" aria-label="Browse by family">
        <div className="row between">
          <p className="overline">Browse by family</p>
          <span className="famrail-arrows">
            <button type="button" className="ic" onClick={() => scrollRail(-1)} aria-label="Scroll families left"><Icon name="chevL" size={18} /></button>
            <button type="button" className="ic" onClick={() => scrollRail(1)} aria-label="Scroll families right"><Icon name="chevR" size={18} /></button>
          </span>
        </div>
        <div className="famrail" ref={railRef} role="group" aria-label="Family">
          <button type="button" className={"famcard" + (family === "all" ? " on" : "")} aria-pressed={family === "all"} onClick={() => pickFamily("all")}>
            <span className="famcard-leaf all"><Icon name="leaf" size={20} /></span>
            <b>All families</b>
            <span>{plural(searched.length, "species", "species")}</span>
          </button>
          {familyCounts.map(([f, n]) => (
            <button key={f} type="button" className={"famcard" + (family === f ? " on" : "")} aria-pressed={family === f} onClick={() => pickFamily(f)} style={{ "--fc": colors[f] || "var(--acc)" }}>
              <span className="famcard-leaf"><Icon name="leaf" size={20} /></span>
              <b>{f}</b>
              <span>{plural(n, "species", "species")}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="catbar" ref={resultsRef}>
        <p className="catcount" aria-live="polite">
          {shown.length ? <><b>{shown.length}</b> {shown.length === 1 ? "species" : "species"}</> : "No species match"}
        </p>
        {active.map((a) => (
          <button key={a.key} type="button" className="activechip" onClick={() => setQuery({ ...a.clear, page: null })} aria-label={`Remove filter ${a.text}`}>
            {a.text} <Icon name="x" size={14} />
          </button>
        ))}
        {active.length > 1 && (
          <button type="button" className="textlink" onClick={() => setQuery({ q: null, family: null, genus: null, status: null, page: null })}>Clear filters</button>
        )}
        <span className="grow" />
        {genera.length > 1 && (
          <label className="inline catgenus">Genus
            <select value={genus} onChange={(e) => filter("genus")(e.target.value)}>
              <option value="all">All genera</option>
              {genera.map((g) => <option key={g} value={g}>{g}</option>)}
              {genus !== "all" && !genera.includes(genus) && <option value={genus}>{genus}</option>}
            </select>
          </label>
        )}
        <label className="inline">Sort
          <select value={sort} onChange={(e) => setQuery({ sort: e.target.value === "name" ? null : e.target.value })}>
            {SORTS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </label>
        <div className="seg" role="group" aria-label="View">
          <button className={view === "grid" ? "on" : ""} aria-pressed={view === "grid"} onClick={() => setQuery({ view: null })} aria-label="Grid view"><Icon name="dashboard" size={18} /></button>
          <button className={view === "list" ? "on" : ""} aria-pressed={view === "list"} onClick={() => setQuery({ view: "list" })} aria-label="List view"><Icon name="file" size={18} /></button>
        </div>
      </div>

      {staff && (
        <div className="catstaff">
          <Pills label="Conservation status" value={status} onChange={filter("status")}
            items={[{ key: "all", label: "Any status" }, ...statusCounts.map(([c, n]) => ({ key: c, label: label(c), count: n }))]} />
          <span className="grow" />
          <button className="btn ghost small-btn" onClick={refreshFromBackend} disabled={isSyncing} title="Sync species catalogue with API">
            <Icon name="refresh" size={16} /> {isSyncing ? "Syncing..." : "Sync API"}
          </button>
        </div>
      )}

      <section className="results">
        {!shown.length && <Empty icon="search">Try a different name, or pick another family.</Empty>}
        <ul className={"plain " + (view === "grid" ? "speciesgrid" : "specieslist")} key={`${family}|${genus}|${status}|${cur}|${view}`}>
          {slice.map((s) => (
            <li key={s.id}>
              <PlantCard href={"#/plants/" + s.id} photo={s.photo} family={s.family} name={s.name} scientific={s.scientific_name}
                conservation={s.conservation_status}
                foot={plural(s.plants.length, "tagged plant", "tagged plants") + (!staff && s.endangered ? " · locations hidden" : "")}>
                {staff && !s.is_published && <Chip value="draft">Not published</Chip>}
              </PlantCard>
            </li>
          ))}
        </ul>

        {pages > 1 && (
          <nav className="pager" aria-label="Pages">
            <button className="btn ghost" disabled={cur === 1} onClick={() => setPage(cur - 1)} aria-label="Previous page"><Icon name="chevL" size={18} /></button>
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <button key={n} className={"btn " + (n === cur ? "" : "ghost")} aria-current={n === cur ? "page" : undefined} onClick={() => setPage(n)}>{n}</button>
            ))}
            <button className="btn ghost" disabled={cur === pages} onClick={() => setPage(cur + 1)} aria-label="Next page"><Icon name="chevR" size={18} /></button>
          </nav>
        )}
      </section>

      {/* Two more ways in, kept quiet at the end. */}
      <nav className="catmore" aria-label="More ways to explore">
        <a className="door" href="#/map">
          <span className="door-ic"><Icon name="map" size={20} /></span>
          <span className="door-text"><b>Show plants on the map</b><span>See where each plant grows</span></span>
          <Icon name="arrowR" size={18} />
        </a>
        <a className="door" href="#/book">
          <span className="door-ic"><Icon name="book" size={20} /></span>
          <span className="door-text"><b>Plant book</b><span>Every species, ready to print</span></span>
          <Icon name="arrowR" size={18} />
        </a>
      </nav>
    </div>
  );
}
