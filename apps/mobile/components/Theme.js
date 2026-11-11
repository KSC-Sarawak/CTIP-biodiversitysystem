// apps/mobile/components/Theme.js
// Light and dark themes for the field app. Colour values come from apps/shared/tokens.js
// (the same file the web app reads), so the two apps cannot drift apart.
//
// useTheme() gives every screen:
//   c        the colours for the current theme (c.accent, c.ink2, c.dangerSoft, ...)
//   t        ready-made text styles (t.title1, t.body, t.sci, t.mono, ...)
//   mode     'device' | 'light' | 'dark'  (what the person picked in More > Appearance)
//   scheme   'light' | 'dark'             (what is actually showing)
//   setMode  change the theme
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
// One import per weight, so only these nine font files are bundled into the app.
import { Fraunces_500Medium } from '@expo-google-fonts/fraunces/500Medium';
import { Fraunces_500Medium_Italic } from '@expo-google-fonts/fraunces/500Medium_Italic';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { Fraunces_700Bold } from '@expo-google-fonts/fraunces/700Bold';
import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';

import { colors, typeScale, space, radius, STATUS_TONE, STATUS_TEXT } from '../../shared/tokens.js';

// Passed to useFonts() in App.js. The keys are the fontFamily names used below.
export const FONT_FILES = {
  Fraunces_500Medium,
  Fraunces_500Medium_Italic,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  JetBrainsMono_500Medium,
};

// On Android a custom font must be picked by its file name, not by fontWeight,
// so each weight has its own family name.
const FAMILY = {
  display: { 500: 'Fraunces_500Medium', 600: 'Fraunces_600SemiBold', 700: 'Fraunces_700Bold', italic: 'Fraunces_500Medium_Italic' },
  text: { 400: 'Nunito_400Regular', 600: 'Nunito_600SemiBold', 700: 'Nunito_700Bold', 800: 'Nunito_800ExtraBold' },
  mono: { 500: 'JetBrainsMono_500Medium' },
};

// fontFamily for a role and weight, e.g. font('text', 700) -> 'Nunito_700Bold'
export const font = (role, weight = 400, italic = false) =>
  italic ? FAMILY[role].italic : FAMILY[role][weight] || FAMILY[role][Object.keys(FAMILY[role])[0]];

// The type scale from tokens.js as React Native text styles (colour added per theme).
function textStyles(c) {
  const out = {};
  for (const [name, s] of Object.entries(typeScale)) {
    out[name] = {
      fontFamily: font(s.font, s.weight, s.italic),
      fontSize: s.size,
      lineHeight: s.line,
      color: name === 'sci' ? c.ink2 : c.ink,
      ...(s.caps ? { textTransform: 'uppercase', letterSpacing: s.size * s.tracking, color: c.ink2 } : null),
    };
  }
  return out;
}

const ThemeContext = createContext(null);

// The theme picked in More > Appearance is kept on the phone (it is a display
// choice, not a secret, so plain storage is enough) and used again at the next start.
const MODE_KEY = 'daun.themeMode';
const MODES = ['device', 'light', 'dark'];

export function ThemeProvider({ children }) {
  const device = useColorScheme(); // follows the phone's dark mode setting
  const [mode, setModeState] = useState(null); // null until the saved choice has been read
  const scheme = mode === 'light' || mode === 'dark' ? mode : device === 'light' ? 'light' : 'dark';

  // Read the saved choice once. Nothing is drawn until it is known (the splash
  // screen is still up), so the app never opens in one theme and jumps to the other.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(MODE_KEY)
      .then((saved) => { if (active) setModeState(MODES.includes(saved) ? saved : 'device'); })
      .catch(() => { if (active) setModeState('device'); });
    return () => { active = false; };
  }, []);

  const setMode = useCallback((next) => {
    if (!MODES.includes(next)) return;
    setModeState(next);
    AsyncStorage.setItem(MODE_KEY, next).catch(() => {}); // not saved: the theme still changes for now
  }, []);

  const value = useMemo(() => {
    const c = colors(scheme);
    return { c, t: textStyles(c), mode: mode || 'device', scheme, setMode, space, radius };
  }, [scheme, mode, setMode]);

  if (mode === null) return null;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

// Tone name ('success', 'danger', ...) for a status or conservation value.
export const toneOf = (value) => STATUS_TONE[String(value || '').toLowerCase()] || 'neutral';

// Plain-language label for a status ("synced" -> "Needs review").
export const statusText = (value) => {
  const v = String(value || '');
  if (STATUS_TEXT[v]) return STATUS_TEXT[v];
  const t = v.replaceAll('_', ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};
