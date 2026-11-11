// apps/mobile/navigation/useAppNavigation.js
// Stack navigation state machine and Android hardware back button handler.
// The stack itself is plain data (stack.js); this adds React state around it.
import { useState, useEffect, useRef } from 'react';
import { BackHandler, Keyboard } from 'react-native';
import { getRoleTabs, getRoleDefaultTab } from './tabs.js';
import { resetTo, push, replaceTop, pop } from './stack.js';

export function useAppNavigation(role) {
  const first = getRoleDefaultTab(role);
  const [stack, setStack] = useState(() => resetTo(first));
  const [stackRole, setStackRole] = useState(role);

  // Signing in or out (or switching the prototype role) starts again at that role's first tab.
  // Every screen kept from before is dropped with the old stack.
  if (stackRole !== role) {
    setStackRole(role);
    setStack(resetTo(first));
  }

  const route = stack[stack.length - 1];

  // The keyboard belongs to the screen being left: close it on every move, so
  // the next screen is not shown squeezed above a keyboard nobody is typing on.
  const move = (change) => {
    Keyboard.dismiss();
    setStack(change);
  };

  const nav = {
    go: (name, params = {}) => move((s) => push(s, name, params)),
    replace: (name, params = {}) => move((s) => replaceTop(s, name, params)),
    back: () => move(pop),
    tab: (name) => move(resetTo(name)),
    home: () => move(resetTo(first)),
    canGoBack: stack.length > 1,
  };

  // Android hardware back button walks back through the screen stack.
  // Registered once: React Native asks the newest listener first, so a screen
  // that needs the back button (useBackHandler in focus.js) is always asked
  // before this one. Registering again on every move would put this one first.
  const depth = useRef(stack.length);
  depth.current = stack.length;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (depth.current <= 1) return false; // the first screen: leave the app
      Keyboard.dismiss();
      setStack(pop);
      return true;
    });
    return () => sub.remove();
  }, []);

  const tabs = getRoleTabs(role);
  const tabKeys = tabs.map((t) => t.key);
  const currentTab = tabKeys.includes(route.name)
    ? route.name
    : tabKeys.includes(stack[0].name)
    ? stack[0].name
    : null;

  return {
    stack,
    route,
    nav,
    currentTab,
    first,
  };
}
