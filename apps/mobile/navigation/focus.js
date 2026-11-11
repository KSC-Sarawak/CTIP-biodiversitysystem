// apps/mobile/navigation/focus.js
// Is this screen the one on show? The navigator keeps the screens under the top
// one mounted, so going back finds them as they were left. Those hidden screens
// must go quiet: no polling, no GPS, no camera, no say over the back button.
import { createContext, useContext, useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

// True outside the navigator too (a screen shown on its own, a window).
export const FocusContext = createContext(true);

export const useIsFocused = () => useContext(FocusContext);

// Android's back button, for the screen on show only. `handler` answers true
// when it dealt with the press; otherwise the navigator goes back one screen.
// React Native asks the newest listener first, and the navigator's own is
// registered once at start-up, so a screen's handler always gets its say.
export function useBackHandler(handler, enabled = true) {
  const focused = useIsFocused();
  const latest = useRef(handler);
  latest.current = handler; // the newest handler, without registering again on every render

  useEffect(() => {
    if (!focused || !enabled) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => latest.current() === true);
    return () => sub.remove();
  }, [focused, enabled]);
}
