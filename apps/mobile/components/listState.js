// apps/mobile/components/listState.js
// What a list with no rows should show (zero JSX, so the node tests can check it).
// "Nothing yet" is only true once the API has answered: before that the list is
// still loading, and with no connection it may simply not have been fetched.

export const OFFLINE_EMPTY = 'No connection, and nothing is saved on this phone to show here yet.';

// count:     rows the list has to show
// apiStatus: 'checking' (no answer yet) | 'connected' | 'offline', from the store
// filtered:  a search or filter is on, so no rows means "no match"
// Answers 'none' (the list has rows) | 'loading' | 'offline' | 'empty'.
export function emptyKind(count, apiStatus, filtered = false) {
  if (count > 0) return 'none';
  if (filtered) return 'empty';
  if (apiStatus === 'checking') return 'loading';
  if (apiStatus === 'offline') return 'offline';
  return 'empty';
}
