// apps/mobile/hooks/useShowMore.js
// A long list a screenful at a time. The screens that use it draw every row
// inside one scrolling page, so hundreds of rows at once would be slow to open.
// The list shows `step` rows and a "Show more" button adds the next `step`.
// A new `resetKey` (the search text, filter and sort) starts from the top again.
import { useState } from 'react';

export function useShowMore(items, resetKey = '', step = 30) {
  const [state, setState] = useState({ key: resetKey, count: step });
  // A new search or filter starts again from the first rows.
  const count = state.key === resetKey ? state.count : step;
  if (state.key !== resetKey) setState({ key: resetKey, count: step });

  return {
    shown: items.slice(0, count),
    left: Math.max(0, items.length - count),
    showMore: () => setState({ key: resetKey, count: count + step }),
  };
}
