// apps/mobile/pages/Species.js
// Officer & Admin Species Management:
// Add species, edit taxonomy & IUCN data, toggle publish/unpublish,
// photo manager with captions & reorder, delete & restore.
import React, { useState } from 'react';
import { View, Text, Pressable, Alert, Modal, ScrollView, TextInput, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { useStore } from '../../shared/store.js';
import { visiblePlants, speciesMedia } from '../../shared/selectors.js';
import { fuzzyMatch } from '../../shared/fuzzy.js';
import { isThreatened, BLANK_SPECIES, CONSERVATION } from '../../shared/data.js';
import { useTheme, font } from '../components/Theme.js';
import Icon from '../components/Icon.js';
import {
  Screen, Header, IconButton, TitleBlock, SearchField, SortBar, Row, Thumb, Sci, DotLabel, Notice,
  Empty, EmptyState, Button, Chip, Field, Segmented, Txt, Mono,
} from '../components/Bits.js';
import { useShowMore } from '../hooks/useShowMore.js';

const SORT_SPECIES_ADMIN = [
  { key: 'name', label: 'Name (A–Z)' },
  { key: 'scientific', label: 'Scientific (A–Z)' },
  { key: 'family', label: 'Family' },
  { key: 'unpublished', label: 'Unpublished first' },
  { key: 'endangered', label: 'Endangered first' },
];

export default function SpeciesAdmin({ nav }) {
  const { db, role, saveSpecies, togglePublish, deleteSpecies, restoreSpecies, setSpeciesMedia, notify } = useStore();
  const { c } = useTheme();

  const [q, setQ] = useState('');
  const [sort, setSort] = useState('name');

  // Species Form Modal
  const [formSpecies, setFormSpecies] = useState(null); // null | BLANK_SPECIES | existing species

  // Photo Manager Modal
  const [photosOf, setPhotosOf] = useState(null); // null | species

  const plants = visiblePlants(db, role);
  const allActive = (db.species || []).filter((s) => !s.is_deleted);
  const deleted = (db.species || []).filter((s) => s.is_deleted);

  const needle = q.trim().toLowerCase();
  const rows = allActive.filter((s) => !needle || fuzzyMatch([s.common_name, s.scientific_name, s.family, s.genus].join(' '), needle));

  const sorted = [...rows].sort((a, b) => {
    if (sort === 'scientific') return (a.scientific_name || '').localeCompare(b.scientific_name || '');
    if (sort === 'family') return (a.family || '').localeCompare(b.family || '') || (a.common_name || a.scientific_name).localeCompare(b.common_name || b.scientific_name);
    if (sort === 'unpublished') {
      const ua = a.is_published ? 1 : 0;
      const ub = b.is_published ? 1 : 0;
      if (ua !== ub) return ua - ub;
      return (a.common_name || a.scientific_name).localeCompare(b.common_name || b.scientific_name);
    }
    if (sort === 'endangered') {
      const ea = isThreatened(a.conservation_status) ? 1 : 0;
      const eb = isThreatened(b.conservation_status) ? 1 : 0;
      if (eb !== ea) return eb - ea;
      return (a.common_name || a.scientific_name).localeCompare(b.common_name || b.scientific_name);
    }
    return (a.common_name || a.scientific_name).localeCompare(b.common_name || b.scientific_name);
  });

  const unpublishedCount = allActive.filter((s) => !s.is_published).length;
  const { shown, left, showMore } = useShowMore(sorted, `${needle}|${sort}`);

  const handleTogglePublish = (s) => {
    const action = s.is_published ? 'Unpublish' : 'Publish';
    Alert.alert(
      `${action} species`,
      s.is_published
        ? `Hide ${s.scientific_name} from the public catalogue? Visitors will no longer see it or its plants.`
        : `Make ${s.scientific_name} visible in the public catalogue? Approved plants of this species will appear to visitors.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action,
          onPress: () => {
            togglePublish(s.id);
            notify(`${s.scientific_name} is now ${s.is_published ? 'hidden' : 'public'}`);
          },
        },
      ]
    );
  };

  const handleDelete = (s) => {
    const plantCount = (db.plants || []).filter((p) => p.species_id === s.id && !p.is_deleted).length;
    Alert.alert(
      'Delete species',
      `Delete ${s.scientific_name}? ${plantCount ? `There are ${plantCount} tagged plant(s) of this species. ` : ''}You can restore this species later from the Recently Deleted list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteSpecies(s.id);
            notify(`${s.scientific_name} deleted`);
          },
        },
      ]
    );
  };

  const handleRestore = (s) => {
    const clash = allActive.some((x) => x.scientific_name?.toLowerCase() === s.scientific_name?.toLowerCase());
    if (clash) {
      return Alert.alert('Cannot restore', 'An active species with this scientific name already exists.');
    }
    restoreSpecies(s.id);
    notify(`${s.scientific_name} restored`);
  };

  return (
    <Screen
      header={
        <Header
          left={<IconButton name="chevL" label="Back" onPress={nav.back} />}
          right={<Button label="New species" icon="plus" height={36} size={13} onPress={() => setFormSpecies({ ...BLANK_SPECIES })} />}
        />
      }
      top={0}
      gap={16}
    >
      <TitleBlock title="Species" sub={`${allActive.length} species · ${unpublishedCount} not published`} />

      <SearchField value={q} onChangeText={setQ} placeholder="Search species by name, family or genus" />
      <SortBar items={SORT_SPECIES_ADMIN} value={sort} onChange={setSort} />

      <View>
        <EmptyState count={sorted.length} icon="search" filtered={!!needle}>
          {needle ? 'No species match.' : 'No species yet.'}
        </EmptyState>
        {shown.map((s, i) => {
          const media = speciesMedia(db, s.id);
          const photoUrl = media[0]?.url || s.photo || plants.find((p) => p.species_id === s.id && p.photos?.length)?.photos[0]?.url;
          return (
            <Row
              key={s.id}
              left={<Thumb uri={photoUrl} />}
              title={s.common_name || s.scientific_name}
              sub={
                <View style={{ gap: 4 }}>
                  <Sci size={14}>{s.scientific_name}</Sci>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Txt v="caption" color={c.ink2}>{s.family || 'No family'}</Txt>
                    <DotLabel status={s.conservation_status} />
                    {!s.is_published && <DotLabel tone="neutral" label="Not published" />}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 14, marginTop: 4 }}>
                    <Pressable onPress={() => setFormSpecies(s)}>
                      <Txt v="caption" color={c.accent} style={{ fontWeight: '700' }}>Edit</Txt>
                    </Pressable>
                    <Pressable onPress={() => setPhotosOf(s)}>
                      <Txt v="caption" color={c.accent} style={{ fontWeight: '700' }}>Photos ({media.length})</Txt>
                    </Pressable>
                    <Pressable onPress={() => handleTogglePublish(s)}>
                      <Txt v="caption" color={s.is_published ? c.warning : c.accent} style={{ fontWeight: '600' }}>
                        {s.is_published ? 'Unpublish' : 'Publish'}
                      </Txt>
                    </Pressable>
                    <Pressable onPress={() => handleDelete(s)}>
                      <Txt v="caption" color={c.danger} style={{ fontWeight: '600' }}>Delete</Txt>
                    </Pressable>
                  </View>
                </View>
              }
              onPress={() => nav.go('species', { id: s.id })}
              last={i === shown.length - 1}
            />
          );
        })}
        {left > 0 ? <Button label={`Show more (${left} left)`} kind="text" height={48} size={15} onPress={showMore} /> : null}
      </View>

      {/* Recently Deleted Section */}
      {deleted.length > 0 && (
        <View style={{ marginTop: 16, padding: 14, borderRadius: 14, backgroundColor: c.bg, gap: 10 }}>
          <Txt v="label" style={{ fontSize: 16 }}>Recently deleted ({deleted.length})</Txt>
          <Txt v="caption" color={c.ink2}>These species are hidden. Tap Restore to make them active again.</Txt>
          {deleted.map((s) => (
            <View
              key={s.id}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingVertical: 8,
                borderBottomWidth: 1,
                borderBottomColor: c.line,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="label" style={{ fontSize: 15 }}>{s.common_name || s.scientific_name}</Txt>
                <Sci size={13}>{s.scientific_name}</Sci>
              </View>
              <Button label="Restore" kind="quiet" height={36} size={13} onPress={() => handleRestore(s)} />
            </View>
          ))}
        </View>
      )}

      {/* Species Form Modal (Create / Edit) */}
      {formSpecies && (
        <SpeciesFormModal
          species={formSpecies}
          onClose={() => setFormSpecies(null)}
          onSave={async (saved) => {
            const res = await saveSpecies(saved);
            if (res?.ok !== false) {
              notify(`Species ${saved.id ? 'updated' : 'created'}`);
              setFormSpecies(null);
            } else {
              Alert.alert('Error', res?.message || 'Could not save species');
            }
          }}
        />
      )}

      {/* Photo Manager Modal */}
      {photosOf && (
        <PhotoManagerModal
          species={photosOf}
          initialPhotos={speciesMedia(db, photosOf.id) || []}
          onClose={() => setPhotosOf(null)}
          onSave={async (mediaList) => {
            const res = await setSpeciesMedia(photosOf.id, mediaList);
            if (res?.ok !== false) {
              notify('Photos updated');
              setPhotosOf(null);
            } else {
              Alert.alert('Error', res?.message || 'Could not save photos');
            }
          }}
        />
      )}
    </Screen>
  );
}

export function SpeciesFormModal({ species, onClose, onSave, onManagePhotos }) {
  const { db, setSpeciesMedia, notify } = useStore();
  const { c } = useTheme();
  const isEditing = !!species.id;
  const [managingPhotos, setManagingPhotos] = useState(false);
  const photosList = isEditing ? speciesMedia(db, species.id) || [] : [];

  const [scientificName, setScientificName] = useState(species.scientific_name || '');
  const [commonName, setCommonName] = useState(species.common_name || '');
  const [family, setFamily] = useState(species.family || '');
  const [genus, setGenus] = useState(species.genus || '');
  const [conservationStatus, setConservationStatus] = useState(species.conservation_status || 'least concern');
  const [description, setDescription] = useState(species.description || '');
  const [culturalSignificance, setCulturalSignificance] = useState(species.cultural_significance || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!scientificName.trim()) {
      return Alert.alert('Scientific name required', 'Please provide a binomial scientific name.');
    }
    setSaving(true);
    try {
      await onSave({
        ...species,
        scientific_name: scientificName.trim(),
        common_name: commonName.trim(),
        family: family.trim(),
        genus: genus.trim() || scientificName.trim().split(' ')[0],
        conservation_status: conservationStatus,
        description: description.trim(),
        cultural_significance: culturalSignificance.trim(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal animationType="slide" visible onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.surface }}>
        <Header
          left={<IconButton name="chevL" label="Back" onPress={onClose} />}
          title={isEditing ? 'Edit species' : 'New species'}
          right={<IconButton name="x" label="Close" onPress={onClose} />}
        />
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
          <TitleBlock
            title={isEditing ? `Edit ${species.scientific_name}` : 'Add new species'}
            sub="Update taxonomy & IUCN conservation status"
          />

          <Field
            label="Scientific name *"
            value={scientificName}
            onChangeText={setScientificName}
            placeholder="e.g. Shorea albida"
          />

          <Field
            label="Common name"
            value={commonName}
            onChangeText={setCommonName}
            placeholder="e.g. Alan bunga"
          />

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Family"
                value={family}
                onChangeText={setFamily}
                placeholder="e.g. Dipterocarpaceae"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Genus"
                value={genus}
                onChangeText={setGenus}
                placeholder="e.g. Shorea"
              />
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Txt v="label" style={{ fontSize: 15 }}>IUCN Conservation Status</Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {CONSERVATION.map((st) => {
                const selected = conservationStatus === st;
                return (
                  <Pressable
                    key={st}
                    onPress={() => setConservationStatus(st)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 8,
                      backgroundColor: selected ? c.accent : c.bg,
                    }}
                  >
                    <Txt v="caption" color={selected ? c.onAccent : c.ink} style={{ fontWeight: '600' }}>
                      {st}
                    </Txt>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Photos Management Card in Species Edit */}
          {isEditing && (
            <View style={{ padding: 14, borderRadius: 14, backgroundColor: c.bg, gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt v="label" style={{ fontSize: 15 }}>
                    Species photos ({photosList.length})
                  </Txt>
                  <Txt v="caption" color={c.ink2}>
                    Manage cover photo, gallery images & mandatory captions
                  </Txt>
                </View>
                <Button
                  label="Edit photos"
                  icon="camera"
                  kind="secondary"
                  height={38}
                  size={13}
                  onPress={() => {
                    if (onManagePhotos) onManagePhotos(species);
                    else setManagingPhotos(true);
                  }}
                />
              </View>

              {photosList.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 4 }}>
                  {photosList.map((ph, idx) => (
                    <View
                      key={ph.id || idx}
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 8,
                        overflow: 'hidden',
                        borderWidth: ph.is_primary ? 2 : 1,
                        borderColor: ph.is_primary ? c.accent : c.line,
                        backgroundColor: c.surface,
                      }}
                    >
                      <Image source={{ uri: ph.url }} style={{ width: '100%', height: '100%' }} />
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <Txt v="caption" color={c.ink3} style={{ fontStyle: 'italic' }}>
                  No photos uploaded for this species yet. Tap "Edit photos" to add from library.
                </Txt>
              )}
            </View>
          )}

          <View style={{ gap: 6 }}>
            <Txt v="label" style={{ fontSize: 15 }}>Description</Txt>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Botanical description, growth habit, habitat..."
              placeholderTextColor={c.ink3}
              multiline
              style={{
                minHeight: 80,
                padding: 12,
                borderRadius: 12,
                backgroundColor: c.bg,
                color: c.ink,
                fontFamily: font('text', 400),
                fontSize: 15,
                textAlignVertical: 'top',
              }}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Txt v="label" style={{ fontSize: 15 }}>Cultural significance</Txt>
            <TextInput
              value={culturalSignificance}
              onChangeText={setCulturalSignificance}
              placeholder="Traditional uses, folklore, local names..."
              placeholderTextColor={c.ink3}
              multiline
              style={{
                minHeight: 70,
                padding: 12,
                borderRadius: 12,
                backgroundColor: c.bg,
                color: c.ink,
                fontFamily: font('text', 400),
                fontSize: 15,
                textAlignVertical: 'top',
              }}
            />
          </View>

          <Button
            label={saving ? 'Saving…' : isEditing ? 'Save changes' : 'Create species'}
            height={50}
            disabled={saving || !scientificName.trim()}
            onPress={handleSubmit}
          />
        </ScrollView>

        {/* Embedded Photo Manager Modal */}
        {managingPhotos && (
          <PhotoManagerModal
            species={species}
            initialPhotos={photosList}
            onClose={() => setManagingPhotos(false)}
            onSave={async (mediaList) => {
              const res = await setSpeciesMedia(species.id, mediaList);
              if (res?.ok !== false) {
                notify('Photos updated');
                setManagingPhotos(false);
              } else {
                Alert.alert('Error', res?.message || 'Could not save photos');
              }
            }}
          />
        )}
      </View>
    </Modal>
  );
}

export function PhotoManagerModal({ species, initialPhotos, onClose, onSave }) {
  const { c } = useTheme();
  const [photos, setPhotos] = useState(() => initialPhotos.map((p, idx) => ({ ...p, sort_order: p.sort_order ?? idx })));
  const [saving, setSaving] = useState(false);

  const addPhotoFromLibrary = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        const asset = res.assets[0];
        const newPhoto = {
          id: `local-${Date.now()}`,
          species_id: species.id,
          url: asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri,
          caption: '',
          is_primary: photos.length === 0,
          sort_order: photos.length,
        };
        setPhotos((prev) => [...prev, newPhoto]);
      }
    } catch (err) {
      Alert.alert('Error', 'Could not open photo library');
    }
  };

  const removePhoto = (index) => {
    setPhotos((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length && !next.some((p) => p.is_primary)) {
        next[0].is_primary = true;
      }
      return next.map((p, i) => ({ ...p, sort_order: i }));
    });
  };

  const movePhoto = (index, dir) => {
    const target = index + dir;
    if (target < 0 || target >= photos.length) return;
    setPhotos((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[target];
      copy[target] = temp;
      return copy.map((p, i) => ({ ...p, sort_order: i }));
    });
  };

  const setPrimary = (index) => {
    setPhotos((prev) => prev.map((p, i) => ({ ...p, is_primary: i === index })));
  };

  const updateCaption = (index, text) => {
    setPhotos((prev) => prev.map((p, i) => (i === index ? { ...p, caption: text } : p)));
  };

  const handleSave = async () => {
    const emptyIdx = photos.findIndex((p) => !p.caption?.trim());
    if (emptyIdx >= 0) {
      return Alert.alert(
        'Caption Required',
        `Please provide a caption for photo ${emptyIdx + 1}. Every species photo requires a descriptive caption.`
      );
    }
    setSaving(true);
    try {
      await onSave(photos);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal animationType="slide" visible onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.surface }}>
        <Header
          left={<IconButton name="chevL" label="Back" onPress={onClose} />}
          title={`Photos of ${species.common_name || species.scientific_name}`}
          right={<IconButton name="x" label="Close" onPress={onClose} />}
        />
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
          <TitleBlock
            title="Species photos"
            sub="Manage photos, mandatory captions & display order"
          />

          <Button label="Add photo from library" icon="camera" kind="secondary" height={44} onPress={addPhotoFromLibrary} />

          {photos.length === 0 ? (
            <Empty icon="camera">No photos added for this species yet.</Empty>
          ) : (
            <View style={{ gap: 14 }}>
              {photos.map((ph, idx) => (
                <View
                  key={ph.id || idx}
                  style={{
                    flexDirection: 'row',
                    gap: 12,
                    padding: 12,
                    borderRadius: 14,
                    backgroundColor: c.bg,
                    borderWidth: ph.is_primary ? 2 : 0,
                    borderColor: c.accent,
                  }}
                >
                  <Image source={{ uri: ph.url }} style={{ width: 72, height: 72, borderRadius: 8, backgroundColor: c.surface }} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Pressable onPress={() => setPrimary(idx)}>
                        <Txt v="caption" color={ph.is_primary ? c.accent : c.ink3} style={{ fontWeight: '700' }}>
                          {ph.is_primary ? '★ Primary cover photo' : 'Set as primary'}
                        </Txt>
                      </Pressable>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <Pressable onPress={() => movePhoto(idx, -1)} disabled={idx === 0}>
                          <Txt v="caption" color={idx === 0 ? c.ink3 : c.ink} style={{ fontWeight: '700', paddingHorizontal: 4 }}>▲</Txt>
                        </Pressable>
                        <Pressable onPress={() => movePhoto(idx, 1)} disabled={idx === photos.length - 1}>
                          <Txt v="caption" color={idx === photos.length - 1 ? c.ink3 : c.ink} style={{ fontWeight: '700', paddingHorizontal: 4 }}>▼</Txt>
                        </Pressable>
                        <Pressable onPress={() => removePhoto(idx)}>
                          <Txt v="caption" color={c.danger} style={{ fontWeight: '700', paddingHorizontal: 4 }}>✕</Txt>
                        </Pressable>
                      </View>
                    </View>
                    <TextInput
                      value={ph.caption || ''}
                      onChangeText={(t) => updateCaption(idx, t)}
                      placeholder="Photo caption (required)*"
                      placeholderTextColor={c.ink3}
                      style={{
                        padding: 8,
                        borderRadius: 8,
                        backgroundColor: c.surface,
                        color: c.ink,
                        fontSize: 13,
                        fontFamily: font('text', 400),
                        borderWidth: 1,
                        borderColor: !ph.caption?.trim() ? (c.danger || '#e11d48') : c.line,
                      }}
                    />
                    {!ph.caption?.trim() && (
                      <Txt v="caption" color={c.danger || '#e11d48'} style={{ fontSize: 11, marginTop: -2 }}>
                        * Caption is required
                      </Txt>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          <Button
            label={saving ? 'Saving photos…' : 'Save photo changes'}
            height={48}
            disabled={saving}
            onPress={handleSave}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}
