// apps/mobile/hooks/useSpeciesSearch.js
// Searches published species through GET /v1/public/species (CTIP-26), a page at
// a time. The rules (what to send, which answers to keep) live in
// apps/shared/speciesSearch.js, where they are tested; this hook only adds the
// typing delay, the requests and React state.
// With no connection it answers from the species saved on the phone instead
// (CTIP-84, offlineSearch.js) and reports `offline`, so the picker can say so.
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch, userMessage } from '../../shared/api.js';
import {
  buildSpeciesQuery, initialSearchState, nextSearchState, failSearchState, hasMore as more,
} from '../../shared/speciesSearch.js';
import { searchSpeciesOffline, shouldUseCache } from '../../shared/offline/offlineSearch.js';
import { speciesCache } from '../offline/speciesCache.js';

const IDLE = { key: null, items: [], page: 0, total: null, loading: false, error: null };

// One page of GET /public/species. Sent without a token: it is a public route.
// A failure rejects with { code, userMessage }, which searchErrorMessage() in
// speciesSearch.js turns into what the botanist sees; no connection, a timeout
// and an unreachable API all count as NETWORK_ERROR.
async function fetchSpeciesPage(query) {
  const params = Object.entries(query).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const res = await apiFetch(`/public/species?${params}`, { token: null });
  if (!res.ok) {
    const code = res.offline ? 'NETWORK_ERROR' : res.code;
    throw Object.assign(new Error(res.message), { code, userMessage: userMessage({ ...res, code }) });
  }
  return { data: res.data ?? [], meta: res.raw?.meta };
}

export function useSpeciesSearch({ q, family, debounceMs = 300 }) {
  const first = buildSpeciesQuery({ q, family });
  const key = first ? JSON.stringify({ q: first.q, family: first.family }) : null;
  const [state, setState] = useState(IDLE);
  const latest = useRef(state);
  latest.current = state;

  // One page for the search named `forKey`. Late answers to an older search are
  // dropped by nextSearchState/failSearchState, because their key no longer matches.
  // With no connection the same page comes from the saved species. `offline` rides
  // along in the state, so a late answer to an older search cannot set it either.
  // Returns a promise that settles once the answer is in the state (never rejects).
  const fetchPage = useCallback((forKey, query) => {
    return fetchSpeciesPage(query)
      .then(({ data, meta }) => setState((s) => ({ ...nextSearchState(s, { key: forKey, data, meta }), offline: false })))
      .catch(async (error) => {
        // Only a new search, or one already answered from the phone, falls back to the
        // saved species. A later page that fails while online keeps what is shown and
        // reports the error (with retry), so pages from two sources are never mixed.
        const cur = latest.current;
        const alreadyOffline = cur.key === forKey && cur.offline === true;
        if (error?.code !== 'NETWORK_ERROR' || !shouldUseCache({ page: query.page, offline: alreadyOffline })) {
          setState((s) => failSearchState(s, { key: forKey, error }));
          return;
        }
        const { list, cachedAt } = await speciesCache.all();
        const { data, meta } = searchSpeciesOffline(list, query);
        setState((s) => ({ ...nextSearchState(s, { key: forKey, data, meta }), offline: true, cachedAt, cachedCount: list.length }));
      })
      .catch((err) => console.warn('[SpeciesSearch] answer not shown:', err?.message || err));
  }, []);

  // A new search waits until typing pauses, then asks for page 1.
  useEffect(() => {
    if (!key) {
      setState(IDLE);
      return undefined;
    }
    // Keep what is known about being offline, so the caption does not blink while typing.
    setState((prev) => ({ ...initialSearchState(key), offline: prev.offline, cachedAt: prev.cachedAt, cachedCount: prev.cachedCount }));
    const { q: term, family: fam } = JSON.parse(key);
    const timer = setTimeout(() => fetchPage(key, buildSpeciesQuery({ q: term, family: fam, page: 1 })), debounceMs);
    return () => clearTimeout(timer);
  }, [key, debounceMs, fetchPage]);

  const loadMore = useCallback(() => {
    const s = latest.current;
    if (!s.key || s.loading || s.error || !more(s)) return;
    const { q: term, family: fam } = JSON.parse(s.key);
    setState((prev) => ({ ...prev, loading: true }));
    fetchPage(s.key, buildSpeciesQuery({ q: term, family: fam, page: s.page + 1 }));
  }, [fetchPage]);

  // Asks again for the page that failed (page 1 if nothing was shown yet).
  const retry = useCallback(() => {
    const s = latest.current;
    if (!s.key || s.loading) return;
    const { q: term, family: fam } = JSON.parse(s.key);
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetchPage(s.key, buildSpeciesQuery({ q: term, family: fam, page: s.page + 1 }));
  }, [fetchPage]);

  // Pull to refresh: asks for page 1 of the current search again. What is shown
  // stays until the answer replaces it (a page-1 answer replaces the list), and a
  // failure keeps it with the error, as any failed page does.
  const refresh = useCallback(() => {
    const s = latest.current;
    if (!s.key) return Promise.resolve();
    const { q: term, family: fam } = JSON.parse(s.key);
    setState((prev) => ({ ...prev, loading: true, error: null }));
    return fetchPage(s.key, buildSpeciesQuery({ q: term, family: fam, page: 1 }));
  }, [fetchPage]);

  return {
    active: Boolean(key),
    items: state.items,
    loading: state.loading,
    error: state.error,
    total: state.total,
    hasMore: more(state),
    offline: state.offline === true,
    cachedAt: state.cachedAt ?? null,
    cachedCount: state.cachedCount ?? 0, // species saved on the phone (the "n" in the picker's caption)
    loadMore,
    retry,
    refresh,
  };
}
