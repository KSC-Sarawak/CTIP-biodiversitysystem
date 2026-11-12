// apps/mobile/components/OfflineSpecies.js
// What every species search screen (the species picker, the Plants tab) shows when
// the search is answered from the species saved on the phone (CTIP-84): the
// caption (UI H copy) and which picture a species row uses. One place, so the two
// screens cannot drift apart.
import React from 'react';

import { useTheme } from './Theme.js';
import { Txt } from './Bits.js';
import { shortDate } from './format.js';

// Offline with nothing ever saved: say how to still record the plant.
export const OFFLINE_EMPTY_TEXT = 'Species search needs a connection the first time. Type the name you know; an officer will match it.';

// `search` is what useSpeciesSearch returns. null when the search is online.
export function offlineCaptionText(search) {
  if (!search?.offline) return null;
  if (search.cachedCount === 0) return OFFLINE_EMPTY_TEXT;
  return `Offline: searching ${search.cachedCount} species saved on this phone (updated ${shortDate(search.cachedAt)}).`;
}

export function OfflineCaption({ search }) {
  const { c } = useTheme();
  const text = offlineCaptionText(search);
  return text ? <Txt v="caption" color={c.ink2}>{text}</Txt> : null;
}

// Saved species have their picture on the phone (thumb_path); online ones have a URL.
export function speciesPhoto(s) {
  return s.thumb_path || s.photo || s.primary_image_url || s.media?.[0]?.url || undefined;
}
