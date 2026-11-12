// apps/mobile/components/OfflineStrip.js
// A thin line above the tab bar while the app cannot reach the API, so every
// screen says the same thing: what you see is what this phone has saved.
import React from 'react';
import { View } from 'react-native';

import { useStore } from '../../shared/store.js';
import { useTheme } from './Theme.js';
import Icon from './Icon.js';
import { Txt } from './Bits.js';

export const OFFLINE_STRIP_HEIGHT = 32;

export default function OfflineStrip() {
  const { apiStatus } = useStore();
  const { c } = useTheme();
  if (apiStatus !== 'offline') return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        height: OFFLINE_STRIP_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: 16,
        backgroundColor: c.neutralSoft,
        borderTopWidth: 1,
        borderTopColor: c.line,
      }}
    >
      <Icon name="info" size={14} color={c.ink2} />
      <Txt v="caption" color={c.ink2} numberOfLines={1}>Offline. Showing what is saved on this phone.</Txt>
    </View>
  );
}
