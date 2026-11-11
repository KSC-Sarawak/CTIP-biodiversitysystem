// apps/web/src/components/MiniMap.jsx
import { useState } from "react";
import LeafletMap from "./LeafletMap.jsx";
import Icon from "./Icon.jsx";
import { Modal } from "./Bits.jsx";
import { MAP_BOUNDS } from "../../../shared/site.js";
import { isExactProtected } from "../../../shared/mapConfig.js";

// Miniature plant map powered by Leaflet & OpenStreetMap.
// `points` is a list of { p, c } where c = { lat, lng }.
// With `expandable`, the small map is a preview: clicking it opens a large map in a popup
// (with a link to `mapHref`, the full map page, when given).
export default function MiniMap({ points = [], label, height = 240, highlight, expandable = false, mapHref }) {
  const [big, setBig] = useState(false);
  const mapPoints = points
    .filter(({ c }) => c && c.lat != null && c.lng != null)
    .map(({ p, c }) => ({
      id: p.id,
      qr_id: p.qr_id,
      name: p.name,
      scientific: p.scientific || "",
      family: p.species?.family || "",
      color: "var(--acc, #10b981)",
      lat: c.lat,
      lng: c.lng,
      protect: isExactProtected(p),
    }));
  const goTo = (id, qr_id) => {
    if (qr_id) window.location.hash = "#/tag/" + qr_id;
  };

  return (
    <>
      <div className="minimap" role="group" aria-label={label} style={{ borderRadius: "var(--r-card, 16px)", overflow: "hidden" }}>
        <LeafletMap
          points={mapPoints}
          selectedId={highlight}
          bounds={MAP_BOUNDS}
          height={height}
          showControls={false}
          interactive={!expandable}
          onSelect={goTo}
        />
        {expandable && (
          <button type="button" className="enlarge" onClick={() => setBig(true)} aria-label={`Enlarge map${label ? ": " + label : ""}`}>
            <span className="enlarge-hint"><Icon name="expand" size={16} /> Enlarge</span>
          </button>
        )}
      </div>
      {big && (
        <Modal title={label || "Map"} wide="xl" onClose={() => setBig(false)}>
          <div className="minimap" style={{ borderRadius: "var(--r-card, 16px)", overflow: "hidden" }}>
            <LeafletMap points={mapPoints} selectedId={highlight} bounds={MAP_BOUNDS} height="min(70vh, 640px)" onSelect={goTo} />
          </div>
          {mapHref && (
            <p className="gap-top-s"><a className="btn ghost" href={mapHref} onClick={() => setBig(false)}><Icon name="map" size={16} /> Open in the full map</a></p>
          )}
        </Modal>
      )}
    </>
  );
}
