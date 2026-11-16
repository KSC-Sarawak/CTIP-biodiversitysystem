// apps/web/src/useViewMore.jsx
import { useState } from "react";
import Icon from "./components/Icon.jsx";

// A long list that opens a few rows at a time, for readability: `step` rows first, then
// "View more" adds `step` more. `reset` (any value) starts over at `step`, e.g. a new search.
// Returns [rowsToShow, footer].
export function useViewMore(rows, { step = 10, noun = "items", reset } = {}) {
  const [state, setState] = useState({ reset, limit: step });
  const limit = state.reset === reset ? state.limit : step;
  if (state.reset !== reset) setState({ reset, limit: step }); // new search or sort: back to the first rows
  const shown = rows.slice(0, limit);
  const left = rows.length - shown.length;
  const footer = rows.length > step && (
    <div className="viewmore">
      <span className="mute small">Showing {shown.length} of {rows.length} {noun}</span>
      <span className="row">
        {left > 0 && (
          <button type="button" className="btn ghost" onClick={() => setState({ reset, limit: limit + step })}>
            <Icon name="chevD" size={18} /> View {Math.min(step, left)} more
          </button>
        )}
        {left > step && <button type="button" className="btn ghost" onClick={() => setState({ reset, limit: rows.length })}>Show all</button>}
        {limit > step && <button type="button" className="textlink" onClick={() => setState({ reset, limit: step })}>Show less</button>}
      </span>
    </div>
  );
  return [shown, footer];
}
