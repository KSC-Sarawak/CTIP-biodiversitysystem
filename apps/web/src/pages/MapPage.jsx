// apps/web/src/pages/MapPage.jsx
// Plant map: every plant this role may see as a pin on OpenStreetMap / Leaflet.
// Endangered plants have no pin for visitors (their location is protected, CTIP-71).
// Aligned to the Daun design language with Lucide line icons, search, and live user tracking.
import { useState, useMemo, useEffect } from "react";
import Icon from "../components/Icon.jsx";
import LeafletMap from "../components/LeafletMap.jsx";
import PlantWindow from "../components/PlantWindow.jsx";
import { useStore } from "../../../shared/store.js";
import { fuzzyMatch } from '../../../shared/fuzzy.js';
import { can } from "../../../shared/permissions.js";
import { familyColors, familyOf, shownCoords, visiblePlants } from "../../../shared/selectors.js";
import { isThreatened } from "../../../shared/data.js";
import { isExactProtected } from "../../../shared/mapConfig.js";
import { MAP_BOUNDS } from "../../../shared/mapConfig.js";

export default function MapPage({ arg }) {
  const { db, role, getDistributionPoints } = useStore();
  const [apiDistribution, setApiDistribution] = useState(null);
  const [picked, setPicked] = useState(null);
  const [spotIds, setSpotIds] = useState(null); // the plants open in the details window
  const [only, setOnly] = useState(null); // family picked in the legend, or null for all
  const [q, setQ] = useState("");
  const staff = can(role, "pending");

  // Fetch API-sanitized distribution coordinates (CTIP-88: snaps endangered coordinates to ~1.1km grid for non-officers)
  useEffect(() => {
    let active = true;
    if (getDistributionPoints) {
      getDistributionPoints().then((res) => {
        if (active && res?.ok && res.source === "api" && Array.isArray(res.points)) {
          setApiDistribution(res.points);
        }
      }).catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [getDistributionPoints, role]);

  const plants = useMemo(() => {
    if (apiDistribution) {
      return apiDistribution.map((pt) => {
        const local = db.plants.find((p) => p.id === pt.specimen_id || p.qr_id === pt.qr_id);
        return {
          id: pt.specimen_id,
          qr_id: pt.qr_id,
          name: pt.common_name || local?.name || pt.scientific_name || "Unknown plant",
          scientific: pt.scientific_name || local?.scientific || "",
          species: {
            id: pt.species_id,
            scientific_name: pt.scientific_name,
            common_name: pt.common_name,
            family: pt.family,
            conservation_status: pt.conservation_status,
          },
          photos: local?.photos || [],
          endangered: pt.endangered,
          location_reduced: pt.location_reduced,
          lat: pt.lat,
          lng: pt.lng,
        };
      });
    }
    return visiblePlants(db, role);
  }, [apiDistribution, db, role]);

  const colors = useMemo(() => familyColors(db.species, plants), [db.species, plants]);
  const families = useMemo(
    () => [...new Set(plants.map((p) => familyOf(p)).filter(Boolean))].sort(),
    [plants],
  );

  const needle = q.trim().toLowerCase();
  // `found` matches the search in every family (for the legend counts); `onMap` is also cut to the picked family.
  const { found, onMap, hidden } = useMemo(() => {
    const s = plants
      .filter((p) => !needle || fuzzyMatch([p.name, p.scientific, p.qr_id, familyOf(p)].join(' '), needle))
      .map((p) => {
        // Same rule for API points as for local ones: anyone who may not see exact
        // endangered locations gets no pin at all, as the page tells them. Before, the
        // API's reduced (about 1.1 km) point was still pinned for visitors.
        return { p, c: shownCoords({ ...p, endangered: p.endangered || isThreatened(p.species?.conservation_status) }, role) };
      });
    const m = s.filter((x) => x.c);
    const inFamily = (x) => !only || familyOf(x.p) === only;
    return { found: m, onMap: m.filter(inFamily), hidden: s.filter((x) => !x.c && x.p.endangered && inFamily(x)).length };
  }, [plants, only, needle, role]);

  const selId = picked || arg;
  const spotPlants = spotIds ? onMap.filter((x) => spotIds.includes(x.p.id)) : [];
  const count = (f) => found.filter((x) => familyOf(x.p) === f).length;

  const mapPoints = useMemo(() => {
    return onMap.map(({ p, c }) => ({
      id: p.id,
      qr_id: p.qr_id,
      name: p.name,
      scientific: p.scientific || p.species?.scientific || "",
      family: familyOf(p),
      color: colors[familyOf(p)] || "var(--acc)",
      lat: c.lat,
      lng: c.lng,
      protect: isExactProtected(p),
    }));
  }, [onMap, colors]);

  const total = onMap.length;

  return (
    <section className="mappage">
      <header className="mappage-head">
        <div>
          <h1>Plant map</h1>
          <p className="mute">Each pin is one plant, coloured by its family. Select a pin to see the plants at that spot.</p>
        </div>
        <details className="maphelp">
          <summary><Icon name="info" size={18} /> How to read the map</summary>
          <p>
            Zoom in and select a pin to see the plants at that spot, with their photos and details. A number is a
            group of plants: select it to zoom in.
            {staff && " Plants appear here once a record has been approved."}
            {!staff && " Locations of endangered plants are not shown, to protect them."}
          </p>
        </details>
      </header>

      <div className="maplayout">
        <aside className="glass mapside" aria-label="Find and filter plants">
          <label className="search">
            <Icon name="search" size={18} />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, tag or family"
              aria-label="Search the map"
            />
          </label>
          <p className="mapcount" aria-live="polite">
            <b>{total}</b> {total === 1 ? "plant" : "plants"} on the map
            {(q || only) && (
              <button type="button" className="textlink" onClick={() => { setQ(""); setOnly(null); }}>Show all</button>
            )}
          </p>

          <div className="maplegend" role="group" aria-labelledby="legend-title">
            <h2 id="legend-title" className="overline">Plant families</h2>
            <div className="legend">
              <button className={"fam" + (!only ? " on" : "")} onClick={() => setOnly(null)} aria-pressed={!only}>
                <i style={{ background: "var(--ink2)" }} /> <span className="grow">All families</span> <b>{found.length}</b>
              </button>
              {families.map((f) => (
                <button key={f} className={"fam" + (only === f ? " on" : "")} onClick={() => setOnly(only === f ? null : f)} aria-pressed={only === f}>
                  <i style={{ background: colors[f] }} /> <span className="grow">{f}</span> <b>{count(f)}</b>
                </button>
              ))}
            </div>
          </div>

          {hidden > 0 && (
            <p className="maphidden">
              <Icon name="lock" size={16} />
              <span>{hidden} endangered plant{hidden === 1 ? " is" : "s are"} not shown, to protect {hidden === 1 ? "it" : "them"}.</span>
            </p>
          )}
        </aside>

        <div className="mapstage">
          <LeafletMap
            points={mapPoints}
            selectedId={selId}
            onSelect={(id, qr_id, ids) => {
              setPicked(qr_id || id);
              setSpotIds(ids);
            }}
            fitKey={`${only || ""}|${needle}`}
            bounds={MAP_BOUNDS}
            height="100%"
          />
        </div>
      </div>

      {spotPlants.length > 0 && <PlantWindow entries={spotPlants} onClose={() => setSpotIds(null)} />}
    </section>
  );
}
