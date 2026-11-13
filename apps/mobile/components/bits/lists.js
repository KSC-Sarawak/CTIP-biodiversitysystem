// apps/mobile/components/bits/lists.js
// List item components: interactive rows, menu rows, icon tiles, plant photo thumbnails, and avatars.
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import Icon from '../Icon.js';
import { useTheme, font } from '../Theme.js';
import { initials as toInitials } from '../../../shared/utils.js';

// Flat list row with hairline divider (no card). `serif` titles for plant names.
// `accessibilityLabel`: one sentence a screen reader says for the whole row.
export function Row({ left, title, sub, right, onPress, last, serif = true, accessibilityLabel }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={accessibilityLabel} onPress={onPress} disabled={!onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line, opacity: pressed ? 0.7 : 1 })}>
      {left || null}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text numberOfLines={2} style={serif ? { fontFamily: font('display', 600), fontSize: 17, lineHeight: 22, color: c.ink } : { fontFamily: font('text', 700), fontSize: 16, lineHeight: 22, color: c.ink }}>{title}</Text>
        {sub ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 2 }}>{sub}</View> : null}
      </View>
      {right !== undefined ? right : onPress ? <Icon name="chevR" size={20} color={c.ink3} /> : null}
    </Pressable>
  );
}

export function MenuRow({ icon, label, onPress, right, last, tone = 'accent' }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => ({ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line, opacity: pressed ? 0.7 : 1 })}>
      <IconTile name={icon} tone={tone} />
      <Text style={{ flex: 1, fontFamily: font('text', 700), fontSize: 16, color: c.ink }}>{label}</Text>
      {right !== undefined ? right : <Icon name="chevR" size={20} color={c.ink3} />}
    </Pressable>
  );
}

export function IconTile({ name, tone = 'accent', size = 40 }) {
  const { c } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c[tone + 'Soft'] }}>
      <Icon name={name} size={20} color={c[tone]} />
    </View>
  );
}

// Plant photo. Falls back to a leaf on a soft green tile when there is no photo
// or it cannot load (no signal, deleted file).
export function Thumb({ uri, fallbackUri, size = 52, radius = 10, style }) {
  const { c } = useTheme();
  const [currentUri, setCurrentUri] = useState(uri);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCurrentUri(uri);
    setFailed(false);
  }, [uri]);

  const handleError = () => {
    if (fallbackUri && currentUri !== fallbackUri) {
      setCurrentUri(fallbackUri);
    } else {
      setFailed(true);
    }
  };

  const box = { width: size, height: size, borderRadius: radius };
  if (!currentUri || failed) {
    return (
      <View style={[box, { backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }, style]}>
        <Icon name="leaf" size={size * 0.42} color={c.accent} />
      </View>
    );
  }
  return <Image source={{ uri: currentUri }} onError={handleError} style={[box, { backgroundColor: c.bg }, style]} accessibilityIgnoresInvertColors />;
}

export function Avatar({ name, uri, size = 40, muted }) {
  const { c } = useTheme();
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [uri]);

  if (uri && !imgFailed) {
    return (
      <Image
        source={{ uri }}
        onError={() => setImgFailed(true)}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.bg }}
        accessibilityIgnoresInvertColors
      />
    );
  }

  return (
    <View accessibilityElementsHidden importantForAccessibility="no" style={{ width: size, height: size, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: muted ? c.bg : c.accent }}>
      <Text style={{ fontFamily: font('text', 800), fontSize: size * 0.36, color: muted ? c.ink : c.onAccent }}>{toInitials(name)}</Text>
    </View>
  );
}
