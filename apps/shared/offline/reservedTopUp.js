// apps/shared/offline/reservedTopUp.js
// One run at a time for the top-up of kept tags (CTIP-116). A workspace load, a
// reconnect and a tap on "Release" can all ask for a top-up within a moment of
// each other; two runs would each count the same missing tags and make twice as
// many. While a run is going, asking again just waits for that run.
//
// No React import, so node can load it in the tests.

/** createTopUp(run) -> () => Promise: calls `run` unless it is already going. */
export function createTopUp(run) {
  let going = null;
  return () => {
    if (!going) {
      // A run that throws (not just one that rejects) must not leave the guard stuck.
      let started;
      try {
        started = Promise.resolve(run());
      } catch (err) {
        return Promise.reject(err);
      }
      going = started.finally(() => {
        going = null;
      });
    }
    return going;
  };
}

/**
 * May the phone make kept tags now? Only for a botanist who has the "Keep tags for
 * offline use" switch on, is online, and whose workspace has loaded. Kept in one
 * place so the rule can be tested: with the switch off nothing is ever made.
 */
export function shouldTopUp({ keepOffline, role, online, loaded }) {
  return !!keepOffline && role === "botanist" && !!online && !!loaded;
}
