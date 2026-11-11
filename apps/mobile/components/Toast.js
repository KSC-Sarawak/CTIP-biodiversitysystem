// apps/mobile/components/Toast.js
// Transient toast notification overlay. It settles into place (a short fade and
// rise, skipped when the phone asks for less motion) and a tap puts it away.
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, Text } from 'react-native';
import { useTheme, font } from './Theme.js';
import { useReduceMotion } from '../hooks/useReduceMotion.js';

export default function Toast({ message, bottom = 24, onDismiss }) {
  const { c } = useTheme();
  const reduceMotion = useReduceMotion();
  const shown = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;
    if (reduceMotion) {
      shown.setValue(1);
      return;
    }
    shown.setValue(0);
    Animated.timing(shown, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [message, reduceMotion, shown]);

  if (!message) return null;

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom,
        opacity: shown,
        transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
      }}
    >
      <Pressable
        accessibilityHint="Dismisses this message"
        onPress={onDismiss}
        style={{ padding: 14, borderRadius: 14, backgroundColor: c.ink }}
      >
        <Text style={{ fontFamily: font('text', 700), fontSize: 15, color: c.surface }}>
          {message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
