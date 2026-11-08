// apps/mobile/offline/useSyncTriggers.js
// When the phone tries to send the records saved on it (CTIP-68). Design:
// docs/architecture/offline-sync.md, section 11. The store says how to send
// (syncNow, apps/shared/offline/useOutboxSync.js); this hook says when:
//
//   1. the connection comes back (expo-network says the internet is reachable)
//   2. the app comes back to the front (AppState becomes "active")
//   3. a timer while records wait: 30 s, 1 min, 2 min, then every 5 min,
//      back to 30 s after any run that sent something (backoffDelay, isProgress)
//
// A save also sends straight away (saveFirst), and "Sync now" sends on a tap.
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { backoffDelay, isProgress } from '../../shared/offline/syncStatus.js';

// A run started here: its answer shows in the store's syncState, so only a
// failure is worth a log line. syncNow itself never rejects.
function runQuietly(syncNow) {
  return Promise.resolve()
    .then(() => syncNow())
    .catch((err) => console.warn('[SyncTriggers] sync failed:', err?.message || err));
}

/**
 * useSyncTriggers(syncNow, { pending, lastSummary, onReconnect })
 *   pending      how many records wait to be sent (pending or sending); the
 *                timer runs only while this is above 0
 *   lastSummary  syncState.lastSummary: a new one that sent something resets
 *                the timer to 30 s, whoever started the run
 *   onReconnect  also called when the connection comes back (the species list)
 */
export function useSyncTriggers(syncNow, { pending = 0, lastSummary = null, onReconnect } = {}) {
  // Refs, so the listeners below are added once and still call the latest functions.
  const syncRef = useRef(syncNow);
  syncRef.current = syncNow;
  const reconnectRef = useRef(onReconnect);
  reconnectRef.current = onReconnect;
  const attempt = useRef(0); // timer runs since the last reset
  const [timerRuns, setTimerRuns] = useState(0); // bumped after each timer run, to set the next one

  // 1. The connection comes back. `reachable` starts unknown (null), so the
  //    first "reachable" answer after opening the app sends too: records left
  //    from last time go straight away. onReconnect runs only on a real change
  //    from no internet to internet (opening the app already refreshes the
  //    species once). Android can answer "unknown" (undefined) while it
  //    checks; that changes nothing.
  useEffect(() => {
    let reachable = null;
    let stopped = false;
    const onState = ({ isInternetReachable }) => {
      if (stopped || isInternetReachable === undefined || isInternetReachable === null) return;
      const wasOff = reachable === false;
      const back = isInternetReachable === true && reachable !== true;
      reachable = isInternetReachable === true;
      if (!back) return;
      attempt.current = 0;
      runQuietly(syncRef.current);
      if (!wasOff) return;
      try {
        reconnectRef.current?.();
      } catch (err) {
        console.warn('[SyncTriggers] onReconnect failed:', err?.message || err);
      }
    };
    const subscription = Network.addNetworkStateListener(onState);
    Network.getNetworkStateAsync().then(onState, (err) => {
      console.warn('[SyncTriggers] could not read the network state:', err?.message || err);
    });
    return () => {
      stopped = true;
      subscription.remove();
    };
  }, []);

  // 2. The app comes back to the front (the botanist switched back to it).
  useEffect(() => {
    let last = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && last !== 'active') runQuietly(syncRef.current);
      last = next;
    });
    return () => subscription.remove();
  }, []);

  // 3a. Any run that sent something starts the timer over at 30 s. Declared
  //     before 3b so it runs first when both see the same new summary.
  useEffect(() => {
    if (isProgress(lastSummary)) attempt.current = 0;
  }, [lastSummary]);

  // 3b. The timer, while records wait. One timer at a time: it is set again
  //     after every run (ours or another), with the next delay in the sequence.
  const waiting = pending > 0;
  useEffect(() => {
    if (!waiting) {
      attempt.current = 0;
      return undefined;
    }
    const timer = setTimeout(() => {
      attempt.current += 1;
      runQuietly(syncRef.current).finally(() => setTimerRuns((n) => n + 1));
    }, backoffDelay(attempt.current));
    return () => clearTimeout(timer);
  }, [waiting, lastSummary, timerRuns]);
}
