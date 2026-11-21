// apps/mobile/pages/PlantReview.js
// Review mode for an UNPUBLISHED tagged plant (RBAC D18, officers only). The same rules
// as the website's review mode (apps/web/src/pages/Specimen.jsx, ReviewModePanel):
// the species, the photos and the hide-location switch are a draft. Nothing is saved
// until "Save changes" or "Send back to botanist", and the plant stays unpublished
// either way: "Publish again" on the plant page is a separate step (D17).
import React, { useState } from 'react';
import { View, Text, Image, Pressable, Alert } from 'react-native';

import { useStore } from '../../shared/store.js';
import { plantView, nameOf } from '../../shared/selectors.js';
import { can } from '../../shared/permissions.js';
import { HIDE_LOCATION_LABEL, PHOTO_CAPTION_MAX, hideLocationRule } from '../../shared/data.js';
import { useTheme, font } from '../components/Theme.js';
import { Screen, Bar, Section, Txt, Sci, Chip, Button, Area, Field, Notice, Check, TextLink, Empty } from '../components/Bits.js';
import SpeciesForm from '../components/SpeciesForm.js';
import { longDate } from '../components/format.js';

export default function PlantReview({ nav, params = {} }) {
  const { db, role, setPlantSpecies, setPlantLocationHidden, setPlantPhotos, reviewObservation, notify } = useStore();
  const { c } = useTheme();
  const raw = db.plants.find((p) => p.qr_id === params.qr && !p.is_deleted);
  const plant = plantView(db, raw);

  // The draft. Filled once from the plant; the screen does not poll, so nothing undoes it.
  const [spText, setSpText] = useState(plant?.species?.scientific_name || plant?.proposed_species || '');
  const [hideChoice, setHideChoice] = useState(null); // null until the officer changes it
  const [captions, setCaptions] = useState({}); // photo id -> edited caption
  const [removed, setRemoved] = useState(() => new Set()); // photo ids marked for removal
  const [reason, setReason] = useState('');
  const [needReason, setNeedReason] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addingSpecies, setAddingSpecies] = useState(false);

  if (!plant || !can(role, 'review')) {
    return <Screen header={<Bar title="Review tag" onBack={nav.back} />}><Empty icon="qr">This plant cannot be reviewed here.</Empty></Screen>;
  }
  const obs = db.observations.filter((o) => o.specimen_id === plant.id).sort((a, b) => (b.observed_at || '').localeCompare(a.observed_at || ''));
  const pendingObs = obs.find((o) => o.status === 'synced');
  const returnedObs = obs.find((o) => o.status === 'returned');
  const approvedObs = obs.find((o) => o.status === 'approved'); // the newest approved one
  if (!plant.withdrawn || pendingObs) {
    return (
      <Screen header={<Bar title={`Review ${plant.qr_id}`} onBack={nav.back} />}>
        <Notice
          tone="info"
          icon="info"
          title={pendingObs ? 'An observation is waiting for review' : 'This plant is published'}
          body={pendingObs ? 'Review that observation first, from the plant page or the review queue.' : 'Review mode is only for an unpublished plant. Unpublish it first, from the plant page.'}
        />
      </Screen>
    );
  }

  const speciesList = db.species.filter((s) => !s.is_deleted);
  const match = speciesList.find((s) => s.scientific_name.toLowerCase() === spText.trim().toLowerCase()) || null;
  const suggestions = !match && spText.trim().length > 1
    ? speciesList.filter((s) => `${s.common_name} ${s.scientific_name}`.toLowerCase().includes(spText.trim().toLowerCase())).slice(0, 3)
    : [];
  const speciesId = match ? match.id : raw.species_id || null; // unknown text keeps the current species
  const hideRule = hideLocationRule((match || plant.species)?.conservation_status, raw.endangered_override, hideChoice);
  const speciesChanged = (speciesId || null) !== (raw.species_id || null);
  const hideChanged = plant.lat != null && !hideRule.locked && hideRule.on !== !!raw.endangered_override;
  const captionOf = (ph) => (ph.id in captions ? captions[ph.id] : ph.caption || '');
  const captionsChanged = plant.photos.some((ph) => !removed.has(ph.id) && captionOf(ph).trim() !== (ph.caption || '').trim());
  const kept = plant.photos.filter((ph) => !removed.has(ph.id));
  const changes = [
    speciesChanged && 'the species',
    removed.size > 0 && `remove ${removed.size} ${removed.size === 1 ? 'photo' : 'photos'}`,
    captionsChanged && 'photo captions',
    hideChanged && (hideRule.on ? 'hide the exact location' : 'show the exact location'),
  ].filter(Boolean);
  const dirty = changes.length > 0;
  // Only an approved observation can be sent back, and only one at a time.
  const canSendBack = !!approvedObs && !returnedObs;
  const botanist = approvedObs ? nameOf(db, approvedObs.recorded_by) : 'the botanist';

  const toggleRemoved = (id) => {
    const next = new Set(removed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setRemoved(next);
  };

  // Save the draft, species first (it decides whether the location is always hidden).
  const applyDraft = async () => {
    if (speciesChanged && !(await setPlantSpecies(raw.id, speciesId))) return false;
    if (hideChanged && !(await setPlantLocationHidden(raw.id, hideRule.on))) return false;
    if (removed.size > 0 || captionsChanged) {
      const res = await setPlantPhotos(plant.id, kept.map((ph) => ({ ...ph, caption: captionOf(ph) })));
      if (!res.ok) {
        notify(res.message);
        return false;
      }
    }
    return true;
  };

  const save = () => {
    if (!dirty || busy) return;
    Alert.alert('Save changes?', `Changes: ${changes.join(', ')}.${removed.size ? ' Removed photos are deleted for good.' : ''} ${plant.qr_id} stays unpublished until you press Publish again.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Save changes',
        style: removed.size ? 'destructive' : 'default',
        onPress: async () => {
          setBusy(true);
          const saved = await applyDraft();
          setBusy(false);
          if (saved) {
            notify('Changes saved. The plant is still unpublished.');
            nav.back();
          }
        },
      },
    ]);
  };

  const sendBack = () => {
    if (!canSendBack || busy) return;
    if (!reason.trim()) return setNeedReason(true);
    Alert.alert(
      `Send ${plant.qr_id} back?`,
      `${botanist}'s observation of ${longDate(approvedObs.observed_at)} goes back to them with your reason, as "Sent back for review".${dirty ? ` Your changes are saved first: ${changes.join(', ')}.` : ''} The plant stays unpublished until you press Publish again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send back',
          onPress: async () => {
            setBusy(true);
            const saved = await applyDraft();
            const res = saved ? await reviewObservation(approvedObs.id, 'return', reason.trim()) : { ok: false };
            setBusy(false);
            if (res?.ok) {
              notify(`${plant.qr_id} sent back to ${botanist}`);
              nav.back();
            }
          },
        },
      ],
    );
  };

  const discard = () => {
    if (!dirty) return nav.back();
    Alert.alert('Discard changes?', 'Nothing you changed in review mode has been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => nav.back() },
    ]);
  };

  return (
    <Screen
      refresh={false}
      header={<Bar title={`Review ${plant.qr_id}`} sub={plant.name} onBack={discard} />}
      top={20}
      gap={20}
      footer={(
        <>
          <Button label="Discard" kind="dangerText" flex={1} size={15} disabled={busy} onPress={discard} />
          <Button label={busy ? 'Saving…' : 'Save changes'} icon="check" flex={1.6} size={15} disabled={!dirty || busy} onPress={save} />
        </>
      )}
    >
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Chip status="unpublished" />
          <Txt v="caption" color={dirty ? c.warning : c.ink2}>{dirty ? `Unsaved: ${changes.join(', ')}` : 'No changes yet'}</Txt>
        </View>
        <Txt v="caption" color={c.ink2}>Changes here are a draft. They are saved only when you press Save changes or Send back. The plant stays unpublished either way.</Txt>
      </View>

      <Section title="1  Species" gap={8}>
        <Field label="Confirm species" value={spText} onChangeText={setSpText} italic
          hint={match ? `${match.common_name} · ${match.family}` : 'Pick a species from the list.'} />
        {suggestions.map((s) => (
          <Pressable key={s.id} accessibilityRole="button" onPress={() => setSpText(s.scientific_name)} style={({ pressed }) => ({ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.bg, opacity: pressed ? 0.7 : 1 })}>
            <Text style={{ fontFamily: font('text', 700), fontSize: 15, color: c.ink }}>{s.common_name}</Text>
            <Sci size={14}>{s.scientific_name}</Sci>
          </Pressable>
        ))}
        {!match ? <TextLink label="Not in the list? Create a new species" size={14} onPress={() => setAddingSpecies(true)} /> : null}
        {plant.proposed_species ? <Txt v="caption" color={c.ink2}>Botanist's guess: {plant.proposed_species}</Txt> : null}
      </Section>

      <Section title="2  Photos" right={<Txt v="caption" color={c.ink2}>{kept.length} of {plant.photos.length} kept</Txt>} gap={12}>
        {/* RBAC D1: only botanists add observation photos. */}
        <Txt v="caption" color={c.ink2}>Edit a caption or remove a photo. To add a new photo, send the plant back and ask the botanist for it.</Txt>
        {plant.photos.length ? plant.photos.map((ph, i) => {
          const gone = removed.has(ph.id);
          return (
            <View key={ph.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', opacity: gone ? 0.55 : 1 }}>
              <Image source={{ uri: ph.url }} accessibilityLabel={`Photo ${i + 1} of ${plant.qr_id}`} style={{ width: 76, height: 76, borderRadius: 10, backgroundColor: c.accentSoft }} />
              <View style={{ flex: 1, gap: 6 }}>
                {gone
                  ? <Txt v="caption" color={c.ink2}>Will be removed when you save.</Txt>
                  : <Field label={`Caption ${i + 1}`} optional value={captionOf(ph)} maxLength={PHOTO_CAPTION_MAX} onChangeText={(t) => setCaptions({ ...captions, [ph.id]: t })} />}
                <Button label={gone ? 'Undo' : 'Remove'} icon={gone ? 'undo' : 'trash'} kind="secondary" height={40} size={14} onPress={() => toggleRemoved(ph.id)} />
              </View>
            </View>
          );
        }) : <Txt v="caption" color={c.ink2}>No photos on this plant.</Txt>}
      </Section>

      {plant.lat != null ? (
        <Section title="3  Location" gap={8}>
          <Check label={HIDE_LOCATION_LABEL} hint={hideRule.hint} value={hideRule.on} disabled={hideRule.locked} onChange={setHideChoice} />
        </Section>
      ) : null}

      <Section title="4  Send back to the botanist" gap={10}>
        {canSendBack ? (
          <>
            <Txt v="caption" color={c.ink2}>Optional. {botanist} sees this reason and fixes their observation of {longDate(approvedObs.observed_at)}.</Txt>
            <Area label="Reason" value={reason} onChangeText={(t) => { setReason(t); setNeedReason(false); }} placeholder="What should the botanist fix?" maxLength={2000} />
            {needReason ? <Txt v="caption" color={c.danger}>Add a reason so the botanist knows what to fix.</Txt> : null}
            <Button label="Send back to botanist" icon="undo" kind="secondary" disabled={busy} onPress={sendBack} />
          </>
        ) : (
          <Txt v="caption" color={c.ink2}>
            {returnedObs ? `Already with ${nameOf(db, returnedObs.recorded_by)}. It comes back to the review queue when they resend it.` : 'No approved observation to send back.'}
          </Txt>
        )}
      </Section>

      {addingSpecies ? (
        <SpeciesForm
          guess={spText}
          onClose={() => setAddingSpecies(false)}
          onSaved={(created) => {
            setAddingSpecies(false);
            setSpText(created.scientific_name);
          }}
        />
      ) : null}
    </Screen>
  );
}
