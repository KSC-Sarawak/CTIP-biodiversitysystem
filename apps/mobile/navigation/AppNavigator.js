// apps/mobile/navigation/AppNavigator.js
// Main screen coordinator: mounts screens, enforces permissions, and coordinates TabBar and overlays.
// The screens under the one on show stay mounted (stack.js: the newest few), so
// going back finds the list where it was scrolled to, with its search and filters.
import React, { useRef, useEffect } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '../../shared/store.js';
import { usePlantBook } from '../../shared/plantBook.js';
import { useTheme } from '../components/Theme.js';
import { useKeyboardOffset } from '../hooks/useKeyboardOffset.js';
import { useReduceMotion } from '../hooks/useReduceMotion.js';
import { useAppNavigation } from './useAppNavigation.js';
import { SCREENS, NoAccess, DefaultScreen, canAccess, isFullScreen } from './routes.js';
import { mountedEntries } from './stack.js';
import { FocusContext } from './focus.js';
import { badgeCounts } from './tabs.js';
import TabBar from './TabBar.js';
import Toast from '../components/Toast.js';
import OfflineStrip, { OFFLINE_STRIP_HEIGHT } from '../components/OfflineStrip.js';
import { useAlertNotifications } from '../hooks/useAlertNotifications.js';
import { usePolling } from '../hooks/usePolling.js';

const FAR_AWAY = 30000; // a hidden screen is moved this far down, out of sight

// One mounted screen. The one on show fades in each time it comes to the front
// (no sliding or jumping). A hidden one keeps its size, so lists keep their
// scroll position, but it sits off screen, takes no touches and is not read out.
function KeptScreen({ focused, reduceMotion, children }) {
  const fade = useRef(new Animated.Value(focused ? 0 : 1)).current;
  const still = useRef(reduceMotion);
  still.current = reduceMotion;

  useEffect(() => {
    if (!focused) return;
    if (still.current) {
      fade.setValue(1);
      return;
    }
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [focused, fade]);

  return (
    <Animated.View
      collapsable={false}
      pointerEvents={focused ? 'auto' : 'none'}
      accessibilityElementsHidden={!focused}
      importantForAccessibility={focused ? 'auto' : 'no-hide-descendants'}
      style={[StyleSheet.absoluteFill, { overflow: 'hidden', opacity: focused ? fade : 1 }]}
    >
      <View style={focused ? styles.shown : styles.hidden}>
        <FocusContext.Provider value={focused}>{children}</FocusContext.Provider>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shown: { flex: 1 },
  hidden: { flex: 1, top: FAR_AWAY },
});

export default function AppNavigator() {
  const { role, me, db, toast, outboxItems, apiStatus, notify } = useStore();
  const { c, scheme } = useTheme();
  const { keyboard, keyboardOpen } = useKeyboardOffset();
  const reduceMotion = useReduceMotion();
  const navBar = useSafeAreaInsets().bottom;
  usePlantBook(); // keeps the phone's copy up to date, ready for when there is no signal

  const { stack, route, nav, currentTab } = useAppNavigation(role);
  useAlertNotifications(db, me, nav);
  // Poll notifications and live updates every 5s across all screens
  usePolling(5000);

  const showTabs = !isFullScreen(route.name);
  const camera = route.name === 'scan';

  const tabsShown = showTabs && !keyboardOpen;
  // The offline line sits on top of the tab bar, so the toast moves up by its height.
  const strip = tabsShown && apiStatus === 'offline' ? OFFLINE_STRIP_HEIGHT : 0;
  const toastBottom = keyboardOpen ? keyboard + 12 : showTabs ? 96 + strip : 24;

  const mounted = mountedEntries(stack);
  const firstMounted = stack.length - mounted.length; // where the mounted screens start in the stack

  return (
    <View style={{ flex: 1, backgroundColor: camera ? c.camera : c.surface }}>
      <StatusBar style={camera || scheme === 'dark' ? 'light' : 'dark'} />

      {/* While typing, the screen ends exactly at the top of the keyboard, so a reply box has
          the same gap above and below it. Otherwise, screens without the tab bar keep clear of
          Android's navigation bar themselves. The tab bar is hidden while typing. */}
      <View
        style={{
          flex: 1,
          paddingBottom: keyboardOpen ? keyboard : !showTabs && !camera ? navBar : 0,
        }}
      >
        {/* The screens fill this box, one over the other; the padding above is outside it. */}
        <View style={{ flex: 1 }}>
          {mounted.map((entry, i) => {
            const index = firstMounted + i;
            const focused = index === stack.length - 1;
            const Screen = SCREENS[entry.name] || DefaultScreen;
            // A screen under the top one can always go back; the first one never can.
            const screenNav = { ...nav, canGoBack: index > 0 };
            return (
              <KeptScreen key={entry.key} focused={focused} reduceMotion={reduceMotion}>
                {canAccess(role, entry.name) ? (
                  <Screen nav={screenNav} params={entry.params} />
                ) : (
                  <NoAccess nav={screenNav} />
                )}
              </KeptScreen>
            );
          })}
        </View>
      </View>

      <Toast message={toast} bottom={toastBottom} onDismiss={() => notify('')} />

      {tabsShown ? <OfflineStrip /> : null}
      {tabsShown ? (
        <TabBar
          role={role}
          current={currentTab}
          badges={badgeCounts(db, me, outboxItems)}
          onTab={(key) => (key === 'scan' ? nav.go('scan') : nav.tab(key))}
        />
      ) : null}
    </View>
  );
}
