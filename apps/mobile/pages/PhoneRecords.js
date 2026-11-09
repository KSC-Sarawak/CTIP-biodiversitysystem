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
import { outboxRowView, failureNotice, conflictRows } from '../../shared/offline/syncStatus.js';
import { LIMITS, HEIGHT_PROBLEM, heightOk } from '../../shared/offline/records.js';
import { sentForReviewElsewhere } from '../../shared/offline/conflicts.js';
import { useTheme, font } from '../components/Theme.js';
import SyncBar from '../components/SyncBar.js';
import {
  Screen, Bar, Section, Row, Thumb, Mono, Txt, DotLabel, Notice, KV, Button, Empty, Field, Area,
} from '../components/Bits.js';
import { shortDate, dateTime, coords, accuracy } from '../components/format.js';

// A photo kept on the phone, as something <Image> can show. A photo already on
// the server has no bytes left here, so it shows the leaf instead.
const photoUri = (photo) => (photo?.base64 ? `data:${photo.type || 'image/jpeg'};base64,${photo.base64}` : null);

// The first photo of each record on the phone, read when the list changes.
// Only that one photo is read per record (recordFirstPhoto), never all of them:
// photos are full size, and a field day's backlog would not fit in memory.
function useFirstPhotos(outboxItems, recordFirstPhoto) {
  const [uris, setUris] = useState({});
  const ids = outboxItems.map((r) => r.id).join(',');
  useEffect(() => {
    let active = true;
    (async () => {
      const next = {};
      for (const id of ids ? ids.split(',') : []) next[id] = photoUri(await recordFirstPhoto(id));
      if (active) setUris(next);
    })();
    return () => { active = false; };
  }, [ids, recordFirstPhoto]);
  return uris;
}

const matches = (view, q) => {
  const term = q.trim().toLowerCase();
  return !term || view.name.toLowerCase().includes(term) || (view.qr_id || '').toLowerCase().includes(term);
};

/** "On this phone" in My records. Nothing when no record waits on the phone. */
export function OnThisPhone({ nav, q = '', top = false }) {
  const { db, outboxItems = [], cachedTags = [], recordFirstPhoto } = useStore();
  const { c } = useTheme();
  const thumbs = useFirstPhotos(outboxItems, recordFirstPhoto);
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

// The two copies of a record that two devices edited, side by side (UI E). Only
// the fields that differ are listed (conflictRows).
function ConflictTable({ rows }) {
  const { c } = useTheme();
  const cell = { flex: 1, minWidth: 0 };
  const head = { fontSize: 13, color: c.ink2, fontFamily: font('text', 700) };
  return (
    <View accessibilityLabel="The two versions of this record">
      <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line }}>
        <Text style={[cell, head]}>Field</Text>
        <Text style={[cell, head]}>This phone</Text>
        <Text style={[cell, head]}>Other device</Text>
      </View>
      {rows.map((r, i) => (
        <View key={r.field} style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
          <Text style={[cell, { fontFamily: font('text', 700), fontSize: 15, lineHeight: 22, color: c.ink2 }]}>{r.label}</Text>
          <View style={cell}><Txt v="body" style={{ fontSize: 15, lineHeight: 22 }}>{r.mine}</Txt></View>
          <View style={cell}><Txt v="body" style={{ fontSize: 15, lineHeight: 22 }}>{r.theirs}</Txt></View>
        </View>
      ))}
    </View>
  );
}

// "Fix this record" (fix_record): the API refused this record's content, so the
// botanist changes its text here and sends it again. The form is filled from
// the record once, when it opens, with the same limits as the capture form. An
// edit shows only the fields it changes (the only ones it sends); a new plant
// also shows its species name. Only the text changes (fixRecordChanges): the
// record keeps its ids, photos, tag, time and place.
function FixRecordForm({ record, button, busy, onSave }) {
  const o = record.observation || {};
  const isEdit = record.kind === 'edit';
  const shows = (field) => !isEdit || field in o;
  const [form, setForm] = useState(() => ({
    height_cm: o.height_cm != null ? String(o.height_cm) : '',
    morphology: o.morphology || '',
    notes: o.notes || '',
    proposed_species_name: record.specimen?.proposed_species_name || '',
  }));
  const set = (field) => (text) => setForm((f) => ({ ...f, [field]: text }));
  const heightValid = heightOk(form.height_cm);

  // Only the fields shown on this form are sent to fixRecord.
  const save = () => {
    if (!heightValid) {
      Alert.alert('Height not valid', HEIGHT_PROBLEM);
      return;
    }
    const changes = {};
    for (const field of ['height_cm', 'morphology', 'notes']) if (shows(field)) changes[field] = form[field];
    if (record.kind === 'new_plant') changes.proposed_species_name = form.proposed_species_name;
    onSave(changes);
  };

  return (
    <Section title="Fix this record" gap={12}>
      {record.kind === 'new_plant' ? (
        <Field label="Species" value={form.proposed_species_name} onChangeText={set('proposed_species_name')} italic maxLength={LIMITS.speciesName} />
      ) : null}
      {shows('height_cm') ? (
        <Field
          label="Height (cm)"
          optional
          value={form.height_cm}
          onChangeText={(t) => set('height_cm')(t.replace(/[^\d.]/g, ''))}
          keyboardType="decimal-pad"
          width={140}
          error={heightValid ? undefined : HEIGHT_PROBLEM}
        />
      ) : null}
      {shows('morphology') ? <Area label="Appearance" value={form.morphology} onChangeText={set('morphology')} maxLength={LIMITS.text} /> : null}
      {shows('notes') ? <Area label="Field notes" optional value={form.notes} onChangeText={set('notes')} rows={2} maxLength={LIMITS.text} /> : null}
      <Button label={button} onPress={save} disabled={busy} />
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
  const { db, outboxItems = [], cachedTags = [], recordPhotos, retryRecord, discardRecord, removeRecordPhoto, fixRecord, resolveConflict } = useStore();
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
  const conflict = record.state === 'conflict';
  // The other device already sent it for review: this phone's edit can never
  // land, so only "Keep the other version" is offered (CTIP-67).
  const sentElsewhere = conflict && sentForReviewElsewhere(record);
  const isEdit = record.kind === 'edit';
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

  // The botanist's choice for a record two devices edited (CTIP-67). The store
  // shows the toast, for success and for failure, so there is no alert here.
  const choose = async (choice) => {
    if (busy) return;
    setBusy(true);
    const res = await resolveConflict(record.id, choice);
    setBusy(false);
    if (res?.ok && choice === 'theirs') nav.back(); // the phone's copy is gone
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

  // No pull to refresh while "Fix this record" is open, so a pull cannot interrupt the typing.
  return (
    <Screen
      refresh={notice?.action !== 'fix_record'}
      header={<Bar title={view.qr_id || 'Record on this phone'} sub={STATUS_TEXT[view.status]} onBack={nav.back} />}
      gap={20}
      top={20}
    >
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <Thumb uri={photoUri(photos[0])} size={64} />
        <View style={{ flex: 1, gap: 3 }}>
          <Txt v="title2" style={{ fontSize: 24, lineHeight: 30 }}>{view.name}</Txt>
          <Txt v="caption" color={c.ink2} style={{ fontFamily: font('text', 600) }}>
            {isEdit ? 'Changes to a record' : view.revisit ? 'Revisit' : 'New plant'} · saved on this phone
          </Txt>
        </View>
        <DotLabel status={view.status} />
      </View>

      {conflict ? (
        <View style={{ gap: 12 }}>
          <Notice
            tone="warning"
            icon="info"
            body={sentElsewhere
              ? "This record was already sent for review from another device, so the changes on this phone can't be sent. Keep the other version to clear it."
              : 'This record was changed on another device before this phone sent its changes. Choose which version to keep.'}
          />
          {record.error?.message && !sentElsewhere ? <Txt v="small" color={c.ink2}>{record.error.message}</Txt> : null}
          {conflictRows(record).length ? <ConflictTable rows={conflictRows(record)} /> : null}
          {sentElsewhere ? null : <Button label="Keep this phone's version" onPress={() => choose('mine')} disabled={busy} />}
          <Button label="Keep the other version" kind={sentElsewhere ? 'primary' : 'secondary'} onPress={() => choose('theirs')} disabled={busy} />
        </View>
      ) : null}

      {notice ? (
        <View style={{ gap: 12 }}>
          <Notice tone="warning" icon="info" body={notice.body} />
          {notice.action === 'fix_record' ? (
            <FixRecordForm
              key={record.id}
              record={record}
              button={notice.button}
              busy={busy}
              onSave={(changes) => act(() => fixRecord(record.id, changes))}
            />
          ) : notice.button ? (
            <Button label={notice.button} onPress={fix[notice.action]} disabled={busy} />
          ) : null}
        </View>
      ) : null}

      {isEdit ? null : <Section title="Photos" right={<Txt v="caption" color={c.ink3}>{photos.length} of 6</Txt>} gap={12}>
        {photos.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {photos.map((p, i) => <Thumb key={p.id || i} uri={photoUri(p)} size={76} />)}
          </View>
        ) : (
          <Txt v="small" color={c.ink2}>No photos.</Txt>
        )}
      </Section>}

      <Section title={isEdit ? 'Changed on this phone' : 'Record'} gap={0}>
        {isEdit ? (
          <KV rows={[
            ['Tag', view.qr_id ? <Mono key="t" size={14}>{view.qr_id}</Mono> : '-'],
            ...[['height_cm', 'Height'], ['morphology', 'Appearance'], ['notes', 'Notes']]
              .filter(([field]) => field in o)
              .map(([field, label]) => [label, field === 'height_cm' ? (o.height_cm != null ? `${o.height_cm} cm` : '-') : o[field] || '-']),
          ]} />
        ) : (
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
        )}
      </Section>

      <Button label="Delete from this phone" kind="dangerText" height={48} size={15} onPress={askDelete} disabled={busy} />
    </Screen>
  );
}
