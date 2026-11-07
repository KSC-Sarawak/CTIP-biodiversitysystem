// apps/mobile/components/SpeciesPicker.js
// The species field on a new plant record: type a name, and published species
// that match come from the API (CTIP-26). Picking one fills the record (CTIP-63).
// The botanist can always submit the name they typed, even with no connection;
// with no connection the search uses the species saved on the phone (CTIP-84).
import React from 'react';
import { View, Text, Pressable } from 'react-native';

import { summarize, isStillPicked } from '../../shared/speciesSearch.js';
import { useSpeciesSearch } from '../hooks/useSpeciesSearch.js';
import { shortDate } from './format.js';
import { useTheme, font } from './Theme.js';
import { Field, Sci, Txt, Thumb, DotLabel, SkeletonRow, Notice, Button, TextLink } from './Bits.js';

const MAX_RESULTS = 5;

function Result({ s, onPress }) {
  const { c } = useTheme();
  const taxonomy = [s.family, s.genus].filter(Boolean).join(' · ');
  const about = summarize(s.description);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Pick ${s.common_name || s.scientific_name}`} onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12,
        borderRadius: 10, backgroundColor: c.bg, opacity: pressed ? 0.7 : 1 })}>
      {/* Saved species have their picture on the phone (thumb_path); online ones have a URL. */}
      <Thumb uri={s.thumb_path || s.primary_image_url || undefined} size={48} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontFamily: font('text', 700), fontSize: 15, color: c.ink }}>{s.common_name || s.scientific_name}</Text>
        <Sci size={14}>{s.scientific_name}</Sci>
        {taxonomy ? <Txt v="caption" color={c.ink2}>{taxonomy}</Txt> : null}
        {about ? <Txt v="caption" color={c.ink2} numberOfLines={2}>{about}</Txt> : null}
      </View>
      {s.conservation_status ? <DotLabel status={s.conservation_status} /> : null}
    </Pressable>
  );
}

export default function SpeciesPicker({ value, onChange, onPick, picked, error }) {
  const { c } = useTheme();
  // Once a species is picked (and the name not edited since), stop searching and
  // show where the name came from instead (CTIP-63).
  const fromList = isStillPicked(picked, value);
  const search = useSpeciesSearch({ q: fromList ? '' : value });
  const needle = value.trim().toLowerCase();
  const exact = search.items.find((s) => s.scientific_name.toLowerCase() === needle);
  const results = exact ? [] : search.items.slice(0, MAX_RESULTS);
  const searching = search.active && !exact;

  const hint = fromList
    ? 'From the species list. Edit the name if this plant is something else.'
    : exact
    ? [exact.common_name, exact.family].filter(Boolean).join(' · ') + '. From the species list.'
    : 'Type at least 2 letters to search the species list, or enter the name yourself.';

  // With no connection the list comes from the phone. Say so, and when it was saved;
  // if nothing was ever saved, say how to still record the plant.
  const offlineEmpty = searching && search.offline && search.cachedCount === 0;
  const caption = !searching || !search.offline ? null
    : offlineEmpty
    ? 'Species search needs a connection the first time. Type the name you know; an officer will match it.'
    : `Offline: searching ${search.cachedCount} species saved on this phone (updated ${shortDate(search.cachedAt)}).`;

  return (
    <View style={{ gap: 6 }}>
      <Field label="Species (required)" value={value} onChangeText={onChange} placeholder="Start typing a name" italic error={error} hint={hint} />
      {fromList ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.accentSoft }}>
          <Txt v="caption" color={c.ink} style={{ flex: 1 }}>
            From species list: {[picked.common_name, picked.family, picked.genus].filter(Boolean).join(' · ') || picked.scientific_name}
          </Txt>
          <TextLink label="Clear" onPress={() => onChange('')} />
        </View>
      ) : null}
      {caption ? <Txt v="caption" color={c.ink2}>{caption}</Txt> : null}
      {searching && search.loading && results.length === 0 ? <SkeletonRow /> : null}
      {results.map((s) => <Result key={s.id} s={s} onPress={() => onPick(s)} />)}
      {searching && search.error ? (
        <View style={{ gap: 8 }}>
          <Notice tone="warning" icon="info" title="Species search unavailable" body={search.error} />
          <Button label="Try again" kind="secondary" height={44} size={15} onPress={search.retry} />
        </View>
      ) : null}
      {searching && !search.loading && !search.error && !offlineEmpty && results.length === 0 ? (
        <Txt v="caption" color={c.ink2}>No published species match. You can submit with the name you typed.</Txt>
      ) : null}
    </View>
  );
}
