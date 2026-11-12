// apps/mobile/pages/Tags.js
// QR tag stock: how many are unused, assigned and retired, and a lookup by ID.
// Tapping a tag's QR icon or an unused tag shows a sharable, saveable image for printing.
import React, { useState } from 'react';
import { View, Pressable } from 'react-native';

import { useStore } from '../../shared/store.js';
import { plantView } from '../../shared/selectors.js';
import { useTheme } from '../components/Theme.js';
import Icon from '../components/Icon.js';
import { Screen, Header, IconButton, TitleBlock, Stat, SearchField, Row, Mono, Txt, DotLabel, EmptyState, Button } from '../components/Bits.js';
import { TagQrView } from './TagQr.js';
import { useShowMore } from '../hooks/useShowMore.js';

export default function Tags({ nav }) {
  const { db } = useStore();
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const [activeQr, setActiveQr] = useState(null);

  const n = (s) => db.tags.filter((t) => t.status === s).length;
  const order = { unused: 0, assigned: 1, retired: 2 };
  const needle = q.trim().toUpperCase();
  const rows = (db.tags || [])
    .filter((t) => !needle || (t?.qr_id && t.qr_id.includes(needle)))
    .sort((a, b) => order[a.status] - order[b.status] || String(a?.qr_id || '').localeCompare(String(b?.qr_id || '')));
  const plantFor = (qr) => plantView(db, db.plants.find((p) => p.qr_id === qr));
  const { shown, left, showMore } = useShowMore(rows, needle);

  if (activeQr) {
    return <TagQrView qr={activeQr} onBack={() => setActiveQr(null)} />;
  }

  return (
    <Screen header={<Header left={<IconButton name="chevL" label="Back" onPress={nav.back} />} />} top={0} gap={16}>
      <TitleBlock title="QR tags" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat value={n('unused')} label="Unused" />
        <Stat value={n('assigned')} label="Assigned" />
        <Stat value={n('retired')} label="Retired" />
      </View>
      <SearchField value={q} onChangeText={setQ} placeholder="Find a tag ID" />
      <View>
        <EmptyState count={rows.length} icon="qr" filtered={!!needle}>{needle ? 'No tag with that ID.' : 'No QR tags yet.'}</EmptyState>
        {shown.map((t, i) => {
          const p = t.status === 'assigned' ? plantFor(t.qr_id) : null;
          const isUnused = t.status === 'unused';
          return (
            <Row
              key={t.qr_id}
              serif={false}
              left={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Show QR code image for ${t.qr_id}`}
                  onPress={() => setActiveQr(t.qr_id)}
                  hitSlop={8}
                  style={{ padding: 4 }}
                >
                  <Icon name="qr" size={22} color={c.accent} />
                </Pressable>
              }
              title={<Mono size={16}>{t.qr_id}</Mono>}
              sub={<Txt v="small" color={c.ink2} style={{ fontSize: 14 }}>{p ? p.name : `Batch ${t.batch_label}`}</Txt>}
              right={<DotLabel status={t.status} />}
              onPress={p ? () => nav.go('tag', { qr: t.qr_id }) : isUnused ? () => setActiveQr(t.qr_id) : undefined}
              last={i === shown.length - 1}
            />
          );
        })}
        {left > 0 ? <Button label={`Show more (${left} left)`} kind="text" height={48} size={15} onPress={showMore} /> : null}
      </View>
    </Screen>
  );
}
