// apps/mobile/hooks/usePullRefresh.js
// Pull down on a list to refresh it. One pull sends any records still waiting
// on the phone and fetches the latest data from the API, both at once. The
// spinner stays until both have answered. If the fetch fails (no signal, API
// down), the toast says why and the screen keeps what it already had.
//
// `extra` is an optional function a screen adds to the pull, such as a species
// search fetching its results again.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl } from 'react-native';
import { useStore } from '../../shared/store.js';
import { useTheme } from '../components/Theme.js';

export function usePullRefresh(extra) {
  const { loadFromApi, syncNow, notify } = useStore();
  const { c } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // The store hands out new functions on every update; a ref keeps onRefresh steady.
  const fns = useRef({});
  fns.current = { loadFromApi, syncNow, notify, extra };

  const onRefresh = useCallback(async () => {
    const { loadFromApi: load, syncNow: send, notify: say, extra: more } = fns.current;
    setRefreshing(true);
    try {
      const [loaded] = await Promise.all([
        load ? load(true) : null,
        send ? send() : null, // never rejects; unsent records stay on the phone
        more ? Promise.resolve(more()).catch(() => null) : null,
      ]);
      if (loaded && loaded.ok === false && loaded.message) say?.(loaded.message);
    } catch (err) {
      say?.('Could not refresh. Try again in a moment.');
      console.warn('[PullRefresh] refresh failed:', err?.message || err);
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, []);

  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={c.accent}
      colors={[c.accent]}
      progressBackgroundColor={c.surface}
    />
  );
}
