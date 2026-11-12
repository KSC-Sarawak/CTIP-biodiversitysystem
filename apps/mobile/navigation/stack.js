// apps/mobile/navigation/stack.js
// The screen stack as plain data (zero JSX, no React Native): a list of
// { key, name, params }, the last one being the screen on show. The navigator
// keeps the newest few mounted, so going back finds a screen as it was left.
// `key` names one visit to a screen: it decides which screens React keeps.

// How many screens stay mounted, counting the one on show. Older ones are built
// again when the user gets back to them.
export const KEEP_MOUNTED = 5;

let made = 0;

export function entry(name, params = {}) {
  made += 1;
  return { key: `s${made}`, name, params };
}

// A fresh stack: signing in or out, a role change, a tab.
export const resetTo = (name) => [entry(name)];

export const push = (stack, name, params = {}) => [...stack, entry(name, params)];

// Swap the screen on show. The same screen with new params keeps its key (the
// Plants tab switches its list this way and must stay as it is); another screen
// gets a new one.
export function replaceTop(stack, name, params = {}) {
  const top = stack[stack.length - 1];
  const next = top.name === name ? { ...top, params } : entry(name, params);
  return [...stack.slice(0, -1), next];
}

export const pop = (stack) => (stack.length > 1 ? stack.slice(0, -1) : stack);

// The entries the navigator renders.
export const mountedEntries = (stack, keep = KEEP_MOUNTED) => stack.slice(-keep);
