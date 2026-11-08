// apps/mobile/pages/PhoneRecords.js
// Records saved on this phone and not sent yet (CTIP-68): the "On this phone"
// group at the top of My records (UI C), and one such record in detail, with
// what to do when it could not be sent (UI D). Design:
// docs/architecture/offline-sync.md, sections 5 and 6. The words and rules are
// in apps/shared/offline/syncStatus.js, where the node tests check them.
import React, { useEffect, useState } from 'react';
import { View, Text, Alert } from 'react-native';

import { useStore } from '../../shared/store.js';
import { STATUS_TEXT } from '../../shared/tokens.js';
import { outboxRowView, failureNotice } from '../../shared/offline/syncStatus.js';
import { useTheme, font } from '../components/Theme.js';
import SyncBar from '../components/SyncBar.js';
import {
  Screen, Bar, Section, Row, Thumb, Mono, Txt, DotLabel, Notice, KV, Button, Empty,
} from '../components/Bits.js';
import { shortDate, dateTime, coords, accuracy } from '../components/format.js';

// A photo kept on the phone, as something <Image> can show. A photo already on
// the server has no bytes left here, so it shows the leaf instead.
const photoUri = (photo) => (photo?.base64 ? `data:${photo.type || 'image/jpeg'};base64,${photo.base64}` : null);

// The first photo of each record on the phone, read when the list changes.
function useFirstPhotos(outboxItems, recordPhotos) {
  const [uris, setUris] = useState({});
  const ids = outboxItems.map((r) => r.id).join(',');
  useEffect(() => {
    let active = true;
    (async () => {
      const next = {};
      for (const id of ids ? ids.split(',') : []) next[id] = photoUri((await recordPhotos(id))[0]);
      if (active) setUris(next);
    })();
    return () => { active = false; };
  }, [ids, recordPhotos]);
  return uris;
}

const matches = (view, q) => {
  const term = q.trim().toLowerCase();
  return !term || view.name.toLowerCase().includes(term) || (view.qr_id || '').toLowerCase().includes(term);
};

/** "On this phone" in My records. Nothing when no record waits on the phone. */
export function OnThisPhone({ nav, q = '', top = false }) {
  const { db, outboxItems = [], cachedTags = [], recordPhotos } = useStore();
  const { c } = useTheme();
  const thumbs = useFirstPhotos(outboxItems, recordPhotos);
  if (!outboxItems.length) return null;
  const rows = outboxItems
    .map((r) => outboxRowView(r, { db, outboxItems, cached: cachedTags }))
    .filter((v) => matches(v, q));

  return (
    <Section title="On this phone" top={top} gap={8}>
      <SyncBar />
      <View>
        {rows.map((v, i) => (
          <Row
            key={v.id}
            accessibilityLabel={v.label}
            left={<Thumb uri={thumbs[v.id]} />}
            title={v.name}
            sub={
              <>
                {v.qr_id ? <Mono size={13}>{v.qr_id}</Mono> : null}
                <Txt v="small" color={c.ink2} style={{ fontSize: 13 }}>
                  · {v.revisit ? 'revisit, ' : ''}{shortDate(v.observed_at)}
                </Txt>
              </>
            }
            right={<DotLabel status={v.status} />}
            onPress={() => nav.go('phoneRecord', { id: v.id })}
            last={i === rows.length - 1}
          />
        ))}
      </View>
    </Section>
  );
}

// Where the plant was seen: the visit's own fix, else the new plant's.
function placeOf(record) {
  const o = record.observation || {};
  const s = record.specimen || {};
  return o.lat != null ? o : s;
}

/** One record on this phone (route "phoneRecord", params { id }). */
export function PhoneRecordDetail({ nav, params = {} }) {
  const { db, outboxItems = [], cachedTags = [], recordPhotos, retryRecord, discardRecord, removeRecordPhoto } = useStore();
  const { c } = useTheme();
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const record = outboxItems.find((r) => r.id === params.id);

  // Read the photos again whenever the record changes (a photo removed, one sent).
  const changed = record ? `${record.state}|${record.step}|${record.updated_at || ''}` : '';
  useEffect(() => {
    let active = true;
    if (params.id) recordPhotos(params.id).then((list) => { if (active) setPhotos(list); });
    return () => { active = false; };
  }, [params.id, changed, recordPhotos]);

  if (!record) {
    return (
      <Screen header={<Bar title="Record" onBack={nav.back} />}>
        <Empty icon="file">This record is no longer on this phone. If it was sent, it is in My records.</Empty>
      </Screen>
    );
  }

  const view = outboxRowView(record, { db, outboxItems, cached: cachedTags });
  const notice = failureNotice(record, photos);
  const o = record.observation || {};
  const place = placeOf(record);

  // Every action shows its own message (toast) and keeps the screen as it is
  // when it fails, so the botanist can try again.
  const act = async (task) => {
    if (busy) return;
    setBusy(true);
    const res = await task();
    setBusy(false);
    if (res && !res.ok && res.message) Alert.alert('Not changed', res.message);
  };

  const fix = {
    pick_tag: () => nav.go('scan', { pickFor: record.id }),
    remove_photo: () => act(() => removeRecordPhoto(record.id, notice.photoId)),
    retry: () => act(() => retryRecord(record.id)),
  };

  const askDelete = () => {
    Alert.alert(
      'Delete this record?',
      "It hasn't been sent, so it will be lost for good.",
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => act(async () => {
            const res = await discardRecord(record.id);
            if (res?.ok) nav.back();
            return res;
          }),
        },
      ],
    );
  };

  return (
    <Screen
      header={<Bar title={view.qr_id || 'Record on this phone'} sub={STATUS_TEXT[view.status]} onBack={nav.back} />}
      gap={20}
      top={20}
    >
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <Thumb uri={photoUri(photos[0])} size={64} />
        <View style={{ flex: 1, gap: 3 }}>
          <Txt v="title2" style={{ fontSize: 24, lineHeight: 30 }}>{view.name}</Txt>
          <Txt v="caption" color={c.ink2} style={{ fontFamily: font('text', 600) }}>
            {view.revisit ? 'Revisit' : 'New plant'} · saved on this phone
          </Txt>
        </View>
        <DotLabel status={view.status} />
      </View>

      {notice ? (
        <View style={{ gap: 12 }}>
          <Notice tone="warning" icon="info" body={notice.body} />
          {notice.button ? (
            <Button label={notice.button} onPress={fix[notice.action]} disabled={busy} />
          ) : null}
        </View>
      ) : null}

      <Section title="Photos" right={<Txt v="caption" color={c.ink3}>{photos.length} of 6</Txt>} gap={12}>
        {photos.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {photos.map((p, i) => <Thumb key={p.id || i} uri={photoUri(p)} size={76} />)}
          </View>
        ) : (
          <Txt v="small" color={c.ink2}>No photos.</Txt>
        )}
      </Section>

      <Section title="Record" gap={0}>
        <KV rows={[
          ['Tag', view.qr_id ? <Mono key="t" size={14}>{view.qr_id}</Mono> : '-'],
          ['Seen', dateTime(o.observed_at)],
          ['Height', o.height_cm ? `${o.height_cm} cm` : '-'],
          ['Appearance', o.morphology || '-'],
          ['Notes', o.notes || '-'],
          ['Location', (
            <Text key="l" style={{ fontFamily: font('mono', 500), fontSize: 14, color: c.ink }}>
              {coords(place.lat, place.lng)}{' '}
              <Text style={{ fontFamily: font('text', 400), color: c.ink2 }}>{place.lat != null ? accuracy(place.gps_accuracy_m) : ''}</Text>
            </Text>
          )],
        ]} />
      </Section>

      <Button label="Delete from this phone" kind="dangerText" height={48} size={15} onPress={askDelete} disabled={busy} />
    </Screen>
  );
}
