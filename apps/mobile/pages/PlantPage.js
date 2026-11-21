// apps/mobile/pages/PlantPage.js
// Species profile (one kind of plant) and the tagged-plant page (one plant in the
// forest, what you see after scanning its tag).
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, useWindowDimensions, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '../../shared/store.js';
import { plantView, visiblePlants, shownCoords, nameOf, speciesObservationPhotos, lastUpdated } from '../../shared/selectors.js';
import { can } from '../../shared/permissions.js';
import { MAP_BOUNDS } from '../../shared/site.js';
import { isExactProtected } from '../../shared/mapConfig.js';
import { HIDDEN_LOCATION_NOTE, HIDE_LOCATION_LABEL, REDUCED_LOCATION_NOTE, hideLocationRule } from '../../shared/data.js';
import { useTheme, font } from '../components/Theme.js';
import Icon from '../components/Icon.js';
import LeafletMap from '../components/LeafletMap.js';
import {
  Txt, Sci, Mono, Chip, Section, TextLink, Row, Thumb, KV, Button, Empty, Header, IconButton, Screen, Notice, Check, Area, Field,
} from '../components/Bits.js';
import PhotoNote from '../components/PhotoNote.js';
import { longDate, coords, dateTime } from '../components/format.js';
import { usePolling } from '../hooks/usePolling.js';
import { usePullRefresh } from '../hooks/usePullRefresh.js';
import { SpeciesFormModal } from './Species.js';

// Big photo at the top with a round back button and a photo counter. Swipe for more.
function Hero({ photos, height = 260, onBack, right }) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  return (
    <View>
      <View style={{ height }}>
        {photos.length ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}>
            {photos.map((p, i) => (
              <Image key={p.id ? `${p.id}-${i}` : i} source={{ uri: p.url }} accessibilityLabel={p.caption || `Photo ${i + 1} of ${photos.length}`} style={{ width, height, backgroundColor: c.accentSoft }} />
            ))}
          </ScrollView>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentSoft }}>
            <Icon name="leaf" size={64} color={c.accent} />
          </View>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack}
          hitSlop={4}
          style={({ pressed }) => ({ position: 'absolute', left: 12, top: 12, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface, opacity: pressed ? 0.7 : 1 })}>
          <Icon name="chevL" size={22} color={c.ink} />
        </Pressable>
        {right ? (
          <View style={{ position: 'absolute', right: 12, top: 12 }}>
            {right}
          </View>
        ) : null}
        {photos.length > 1 ? (
          <View style={{ position: 'absolute', right: 12, bottom: 12, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: c.surface }}>
            <Text style={{ fontFamily: font('text', 700), fontSize: 12, color: c.ink }}>{index + 1} / {photos.length}</Text>
          </View>
        ) : null}
      </View>
      <PhotoNote photo={photos[Math.min(index, photos.length - 1)]} style={{ paddingHorizontal: 20, paddingTop: 10 }} />
    </View>
  );
}

function Page({ hero, children }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const refreshControl = usePullRefresh();
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }} refreshControl={refreshControl}>
        {hero}
        <View style={{ paddingHorizontal: 20, paddingTop: 20, gap: 22 }}>{children}</View>
      </ScrollView>
    </View>
  );
}

const HIDDEN_NOTE = HIDDEN_LOCATION_NOTE;

export function SpeciesProfile({ nav, params }) {
  const { db, role, saveSpecies, notify } = useStore();
  const { c, t } = useTheme();
  const [editing, setEditing] = useState(false);
  const sp = db.species.find((s) => s.id === params?.id && !s.is_deleted);
  const staff = can(role, 'pending');
  const canEdit = can(role, 'species');
  if (!sp || (!sp.is_published && !staff)) {
    return (
      <Screen header={<Header left={<IconButton name="chevL" label="Back" onPress={nav.back} />} />}>
        <Empty>This species is not published yet.</Empty>
      </Screen>
    );
  }
  const plants = visiblePlants(db, role).filter((p) => p.species_id === sp.id);
  const media = db.species_media ? db.species_media.filter((m) => m.species_id === sp.id).sort((a, b) => a.sort_order - b.sort_order) : [];
  const obsPhotos = speciesObservationPhotos(db, sp.id);
  const effectiveMedia = media.length > 0 ? media.map((m) => ({ id: m.id, url: m.url })) : obsPhotos;
  const rawPhotos = [...effectiveMedia, ...plants.flatMap((p) => p.photos)];
  const seenKeys = new Set();
  const photos = rawPhotos.filter((p) => {
    const k = p?.id || p?.url;
    if (!k || seenKeys.has(k)) return false;
    seenKeys.add(k);
    return true;
  }).slice(0, 6);
  const onMap = plants.some((p) => shownCoords(p, role)); // at least one plant whose spot this role may see

  return (
    <Page
      hero={
        <Hero
          photos={photos}
          onBack={nav.back}
          right={
            canEdit ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit species"
                onPress={() => setEditing(true)}
                hitSlop={4}
                style={({ pressed }) => ({
                  height: 44,
                  paddingHorizontal: 16,
                  borderRadius: 22,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: c.surface,
                  opacity: pressed ? 0.7 : 1,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.15,
                  shadowRadius: 2,
                  elevation: 2,
                })}
              >
                <Icon name="pencil" size={16} color={c.ink} />
                <Text style={{ fontFamily: font('text', 700), fontSize: 13, color: c.ink }}>Edit</Text>
              </Pressable>
            ) : null
          }
        />
      }
    >
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text style={[t.overline, { color: c.accent }]}>{sp.family}</Text>
          {canEdit && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit species"
              onPress={() => setEditing(true)}
              hitSlop={8}
            >
              <Text style={{ fontFamily: font('text', 700), fontSize: 14, color: c.accent }}>Edit species</Text>
            </Pressable>
          )}
        </View>
        <Text accessibilityRole="header" style={{ fontFamily: font('display', 700), fontSize: 30, lineHeight: 36, color: c.ink }}>{sp.common_name || sp.scientific_name}</Text>
        <Sci size={17}>{sp.scientific_name}</Sci>
        <View style={{ paddingTop: 6 }}><Chip status={sp.conservation_status} /></View>
      </View>
      {sp.description ? <Txt v="body" style={{ lineHeight: 25 }}>{sp.description}</Txt> : null}
      {sp.updated_at ? <Txt v="caption" color={c.ink2}>Last updated {longDate(sp.updated_at)}</Txt> : null}
      {sp.ecology ? (
        <Section title="Habitat and ecology"><Txt v="body" style={{ lineHeight: 25 }}>{sp.ecology}</Txt></Section>
      ) : null}
      {sp.cultural_significance ? (
        <Section title="Cultural significance"><Txt v="body" style={{ lineHeight: 25 }}>{sp.cultural_significance}</Txt></Section>
      ) : null}
      <Section title="Where it grows" right={onMap ? <TextLink label="Open map" size={14} onPress={() => nav.go('map', { species: sp.id })} /> : null}>
        {onMap ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open map"
            onPress={() => nav.go('map', { species: sp.id })}
            style={{
              height: 180,
              borderRadius: 16,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: c.line,
              backgroundColor: c.mapTile,
            }}
          >
            <View pointerEvents="none" style={{ flex: 1 }}>
              <LeafletMap
                points={plants.map((p) => {
                  const pt = shownCoords(p, role);
                  return pt ? {
                    id: p.id,
                    qr_id: p.qr_id,
                    name: p.name || sp.common_name,
                    scientific: sp.scientific_name,
                    color: c.accent,
                    lat: pt.lat,
                    lng: pt.lng,
                    protect: isExactProtected(p),
                  } : null;
                }).filter(Boolean)}
                bounds={MAP_BOUNDS}
                interactive={false}
                rounded
                height="100%"
              />
            </View>
          </Pressable>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Icon name="lock" size={18} color={c.ink2} />
            <Txt v="body" color={c.ink2} style={{ fontSize: 15 }}>{plants.length ? HIDDEN_NOTE : 'No tagged plants yet.'}</Txt>
          </View>
        )}
      </Section>
      {plants.length ? (
        <Section title="Tagged plants" gap={0}>
          {plants.map((p, i) => (
            <Row key={p.id} serif={false} left={<Thumb uri={p.photos[0]?.url} size={48} />}
              title={<Mono size={16}>{p.qr_id}</Mono>}
              sub={staff ? <Txt v="small" color={c.ink2}>Tagged {longDate(db.observations.find((o) => o.specimen_id === p.id)?.observed_at)}</Txt> : null}
              onPress={() => nav.go('tag', { qr: p.qr_id })} last={i === plants.length - 1} />
          ))}
        </Section>
      ) : null}

      {/* Edit Species Modal */}
      {editing && (
        <SpeciesFormModal
          species={sp}
          onClose={() => setEditing(false)}
          onSave={async (fields) => {
            const res = await saveSpecies({ ...fields, id: sp.id });
            if (res?.ok !== false) {
              notify(`${fields.scientific_name || 'Species'} updated`);
              setEditing(false);
            } else {
              Alert.alert('Error', res?.message || 'Could not save species');
            }
          }}
        />
      )}
    </Page>
  );
}

// The newest "return" decision on an observation: why it was sent back.
const lastReturn = (db, obsId) =>
  db.reviews.filter((r) => r.observation_id === obsId && r.decision === 'return').sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;

// RBAC D17: a change that decides what the public sees needs the officer to type a word,
// like the website's confirm popups.
function TypedConfirm({ title, intro, notes = [], word, confirmLabel, icon, danger, reasonLabel, reasonHint, busy, onConfirm, onCancel }) {
  const { c } = useTheme();
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [needReason, setNeedReason] = useState(false);
  const ready = typed.trim().toUpperCase() === word && !busy;
  const submit = () => {
    if (reasonLabel && !reason.trim()) return setNeedReason(true);
    if (ready) onConfirm(reason.trim());
  };
  return (
    <Section title={title} gap={12}>
      <Txt v="body" style={{ fontSize: 15, lineHeight: 22 }}>{intro}</Txt>
      {notes.filter(Boolean).map((n) => <Txt key={n} v="caption" color={c.ink2}>{n}</Txt>)}
      {reasonLabel ? (
        <View style={{ gap: 6 }}>
          <Area label={reasonLabel} value={reason} onChangeText={(t) => { setReason(t); setNeedReason(false); }} placeholder={reasonHint} maxLength={1000} />
          {needReason ? <Txt v="caption" color={c.danger}>Add a reason so the botanist knows why.</Txt> : null}
        </View>
      ) : null}
      <Field label={`Type ${word} to confirm`} value={typed} onChangeText={setTyped} mono autoComplete="off" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button label={busy ? 'Saving…' : confirmLabel} icon={icon} kind={danger ? 'danger' : 'primary'} flex={1.4} disabled={!ready} onPress={submit} />
        <Button label="Cancel" kind="secondary" flex={1} disabled={busy} onPress={onCancel} />
      </View>
    </Section>
  );
}

export function TaggedPlant({ nav, params }) {
  usePolling(5000);
  const { db, me, role, setPlantLocationHidden, setPlantPublished } = useStore();
  const { c } = useTheme();
  const [unpublishing, setUnpublishing] = useState(false); // RBAC D17: reason box open
  const [publishing, setPublishing] = useState(false); // RBAC D17: "Publish again" confirm open
  const [busy, setBusy] = useState(false);
  const raw = db.plants.find((p) => p.qr_id === params?.qr && !p.is_deleted);
  const p = plantView(db, raw);
  const staff = can(role, 'pending');
  const hasPublishedSpecies = p?.species && p.species.is_published;
  if (!p || (!p.isPublic && !hasPublishedSpecies && !staff)) {
    return (
      <Screen header={<Header left={<IconButton name="chevL" label="Back" onPress={nav.back} />} />}>
        <Empty icon="qr">{params?.qr} is not published yet. Check back once park staff have verified it.</Empty>
      </Screen>
    );
  }
  const obs = db.observations.filter((o) => o.specimen_id === p.id).sort((a, b) => a.observed_at.localeCompare(b.observed_at));
  const firstObs = obs[0];
  const lastObs = obs[obs.length - 1];
  const where = (!p.isPublic && !staff) ? null : shownCoords(p, role);
  const updated = lastUpdated(db, p, role);
  const hideRule = hideLocationRule(p.species?.conservation_status);

  // Publishing (RBAC D17, D18), officers only:
  //   waiting for review -> "Review this record" (approve, return or reject).
  //   published          -> "Unpublish plant" (reason required). No review option.
  //   unpublished        -> "Review tag" (review mode) and "Publish again", a separate step.
  const canReview = can(role, 'review');
  const canPublish = can(role, 'publishPlants');
  const newestFirst = [...obs].reverse();
  const pendingObs = newestFirst.find((o) => o.status === 'synced');
  // Botanists only get their own unfinished observations (RBAC D16).
  const returnedObs = newestFirst.find((o) => o.status === 'returned');
  const approvedObs = newestFirst.find((o) => o.status === 'approved');
  const withdrawn = p.withdrawn;
  const published = p.status === 'approved' && !withdrawn;
  const sentBack = withdrawn && returnedObs ? lastReturn(db, returnedObs.id) : null;
  // The one status shown at the top. Once unpublished, "Published" is never shown.
  const stage = pendingObs ? 'synced' : withdrawn ? (returnedObs ? 'returned' : 'unpublished') : p.status;
  const stageText = stage === 'returned' && withdrawn ? (role === 'botanist' ? 'Sent back for review' : 'Sent back to botanist') : undefined;
  const blockedPublish = pendingObs
    ? 'An observation is waiting for review. Decide it first.'
    : returnedObs
    ? 'The plant is with the botanist. Wait for them to resend it, then review it.'
    : !approvedObs
    ? 'No observation is approved yet.'
    : '';
  // Hiding is safe and saves at once; showing the exact spot to the public is asked first.
  const changeHidden = (hide) => {
    if (hide) return setPlantLocationHidden(p.id, true);
    Alert.alert('Show the exact location?', `Anyone will be able to find ${p.qr_id} on the public map.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Show location', style: 'destructive', onPress: () => setPlantLocationHidden(p.id, false) },
    ]);
  };
  const changePublished = async (isPublished, reason) => {
    setBusy(true);
    const ok = await setPlantPublished(p.id, isPublished, reason); // shows its own message
    setBusy(false);
    if (ok) { setUnpublishing(false); setPublishing(false); }
  };

  return (
    <Page hero={<Hero photos={p.photos} height={220} onBack={nav.back} />}>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: c.bg }}>
            <Icon name="qr" size={16} color={c.ink} />
            <Mono size={13}>{p.qr_id}</Mono>
          </View>
          {staff ? <TextLink label="Show QR code" size={14} onPress={() => nav.go('tagQr', { qr: p.qr_id })} /> : null}
        </View>
        <Text accessibilityRole="header" style={{ fontFamily: font('display', 700), fontSize: 28, lineHeight: 34, color: c.ink }}>{p.name}</Text>
        {p.scientific ? <Sci size={16}>{p.scientific}{p.species?.family ? ` · ${p.species.family}` : ''}</Sci> : null}
        {staff ? <View style={{ flexDirection: 'row', gap: 8, paddingTop: 6 }}><Chip status={stage} label={stageText} />{p.endangered ? <Chip status="endangered" /> : null}</View> : null}
      </View>
      {!staff ? (
        <Txt v="body" style={{ lineHeight: 25 }}>
          {p.isPublic
            ? `You found tagged plant ${p.qr_id}. It was recorded by park botanists.`
            : `Tag ${p.qr_id} is on a ${p.name} (${p.scientific}). This field observation is currently being verified by park staff.`}
        </Txt>
      ) : null}
      {staff && withdrawn ? (
        <Notice
          tone="warning"
          icon="eyeOff"
          title="Unpublished"
          body={p.withdrawn_reason || 'No reason was given.'}
          meta={`By ${nameOf(db, p.withdrawn_by)} on ${dateTime(p.withdrawn_at)}. Visitors cannot see this plant.${canPublish ? ' Use Review tag to change it or send it back to the botanist. It stays unpublished until you press Publish again.' : ''}`}
        />
      ) : null}
      {sentBack && role === 'botanist' && returnedObs.recorded_by === me?.id ? (
        <View style={{ gap: 10 }}>
          <Notice
            tone="warning"
            icon="undo"
            title="Sent back for review"
            body={sentBack.comment || 'Please check this record.'}
            meta={`From ${nameOf(db, sentBack.reviewer_id)} on ${dateTime(sentBack.created_at)}. Fix your observation of ${longDate(returnedObs.observed_at)} and send it again. An officer reviews it before the plant can be published again.`}
          />
          <Button label="Fix and resend" icon="send" onPress={() => nav.go('record', { id: returnedObs.id })} />
        </View>
      ) : null}
      {sentBack && role !== 'botanist' ? (
        <Notice
          tone="warning"
          icon="undo"
          title={`Sent back to ${nameOf(db, returnedObs.recorded_by)}`}
          body={sentBack.comment}
          meta={`By ${nameOf(db, sentBack.reviewer_id)} on ${dateTime(sentBack.created_at)}. Waiting for the botanist to fix and resend it; it then comes back to the review queue.`}
        />
      ) : null}
      {canPublish && published && unpublishing ? (
        <TypedConfirm
          title={`Unpublish ${p.qr_id}`}
          intro="Hides the whole plant from visitors: the plant library, the map and its QR page. Its observations keep their decisions. Once it is unpublished you can review it, then publish it again."
          reasonLabel="Reason (sent to the botanist)"
          reasonHint="For example: wrong species on the tag"
          word="UNPUBLISH"
          confirmLabel="Unpublish"
          icon="eyeOff"
          danger
          busy={busy}
          onConfirm={(reason) => changePublished(false, reason)}
          onCancel={() => setUnpublishing(false)}
        />
      ) : null}
      {canPublish && withdrawn && publishing && !blockedPublish ? (
        <TypedConfirm
          title={`Publish ${p.qr_id} again`}
          intro="Put it back in the plant library, on the public map and on its QR page? Visitors will be able to see it."
          notes={[
            p.lat != null ? (p.endangered ? 'Its exact location stays hidden from the public.' : 'Its exact location will be shown on the public map.') : null,
            p.species && !p.species.is_published ? 'Its species is not published yet, so visitors will not see it until the species is.' : null,
          ]}
          word="PUBLISH"
          confirmLabel="Publish again"
          icon="eye"
          busy={busy}
          onConfirm={() => changePublished(true)}
          onCancel={() => setPublishing(false)}
        />
      ) : null}
      <Section title="This plant">
        <KV rows={[
          ['Height', p.height_cm ? `${p.height_cm} cm` : '-'],
          ...(staff ? [
            ['Recorded', longDate(firstObs?.observed_at)],
            ['Recorded by', nameOf(db, p.registered_by)],
            ['Last visit', longDate(lastObs?.observed_at)],
            ...(updated ? [['Last updated', longDate(updated)]] : []),
          ] : []),
          // RBAC D9: a visitor gets no coordinates for a protected plant, so check the flag before "not captured".
          ['Location', where ? <Mono size={14}>{coords(where.lat, where.lng)}</Mono> : (!staff && p.endangered) || p.lat != null ? HIDDEN_NOTE : 'Not captured when recorded.'],
        ]} />
        {/* Only when an approximate spot is actually shown: a visitor gets no coordinates at all (RBAC D9). */}
        {p.location_reduced && where ? <Txt v="caption" color={c.ink2}>{REDUCED_LOCATION_NOTE}</Txt> : null}
        {/* RBAC D15: officers and admins. While an observation waits for review, an officer sets it in that review. */}
        {where && can(role, 'hideLocation') && !(canReview && pendingObs) ? (
          <Check
            label={HIDE_LOCATION_LABEL}
            hint={hideRule.hint}
            value={p.endangered}
            disabled={hideRule.locked}
            onChange={changeHidden}
          />
        ) : null}
      </Section>
      {where ? (
        <Section
          title="Where it is"
          right={<TextLink label="Open full map" size={14} onPress={() => nav.go('map', { species: p.species?.id })} />}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open full map"
            onPress={() => nav.go('map', { species: p.species?.id })}
            style={{
              height: 180,
              borderRadius: 16,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: c.line,
              backgroundColor: c.mapTile,
            }}
          >
            <View pointerEvents="none" style={{ flex: 1 }}>
              <LeafletMap
                points={[{
                  id: p.id,
                  qr_id: p.qr_id,
                  name: p.name,
                  scientific: p.scientific || '',
                  color: c.accent,
                  lat: where.lat,
                  lng: where.lng,
                  protect: isExactProtected(p),
                }]}
                selectedId={p.id}
                bounds={{
                  minLat: where.lat - 0.003,
                  maxLat: where.lat + 0.003,
                  minLng: where.lng - 0.003,
                  maxLng: where.lng + 0.003,
                }}
                interactive={false}
                rounded
                height="100%"
              />
            </View>
          </Pressable>
        </Section>
      ) : null}
      <View style={{ gap: 8 }}>
        {role === 'botanist' ? (
          obs.some((o) => o.status === 'synced') ? (
            <Notice tone="info" icon="lock" title="Review in progress" body="An observation of this plant is waiting for an officer's decision. Record editing and revisits are locked until review is complete." />
          ) : (
            <Button label="Record a revisit" icon="plus" onPress={() => nav.go('revisit', { qr: p.qr_id })} />
          )
        ) : null}
        {canReview && pendingObs ? (
          <Button label="Review this record" icon="clipboard" onPress={() => nav.go('reviewItem', { id: pendingObs.id })} />
        ) : null}
        {canReview && withdrawn && !pendingObs ? (
          <Button label="Review tag" icon="clipboard" onPress={() => nav.go('plantReview', { qr: p.qr_id })} />
        ) : null}
        {canPublish && withdrawn && !publishing ? (
          <View style={{ gap: 4 }}>
            <Button label="Publish again" icon="eye" kind="secondary" disabled={!!blockedPublish} onPress={() => setPublishing(true)} />
            {blockedPublish ? <Txt v="caption" color={c.ink2}>{blockedPublish}</Txt> : null}
          </View>
        ) : null}
        {canPublish && published && !unpublishing ? (
          <Button label="Unpublish plant" icon="eyeOff" kind="secondary" onPress={() => setUnpublishing(true)} />
        ) : null}
        {p.species ? <Button label="About this species" kind="secondary" icon="leaf" onPress={() => nav.go('species', { id: p.species.id })} /> : null}
      </View>
    </Page>
  );
}
