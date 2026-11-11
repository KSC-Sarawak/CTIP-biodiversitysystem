// apps/mobile/hooks/useReduceMotion.js
// The phone's "reduce motion" setting. Anything that moves checks it first
// (the motion rule in apps/shared/tokens.js).
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => { if (active) setReduce(!!on); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => setReduce(!!on));
    return () => {
      active = false;
      sub?.remove?.();
    };
  }, []);

  return reduce;
}
