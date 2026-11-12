// apps/mobile/pages/Tags.js
// QR tag stock: inventory, batch creation, retirement, deletion, and Batch QR Print Studio.
import React, { useState } from 'react';
import { View, Text, Pressable, Alert, Modal, ScrollView, TextInput } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import QRCodeLib from 'qrcode';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { useStore } from '../../shared/store.js';
import { plantView, tagUrl } from '../../shared/selectors.js';
import { useTheme, font } from '../components/Theme.js';
import Icon from '../components/Icon.js';
import {
  Screen, Header, IconButton, TitleBlock, Stat, SearchField, Row, Mono, Txt, DotLabel, EmptyState, Button, Chip, Field, Segmented,
} from '../components/Bits.js';
import { TagQrView } from './TagQr.js';
import { useShowMore } from '../hooks/useShowMore.js';

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const SIZES = [
  { mm: 40, label: 'Medium · 40mm' },
  { mm: 20, label: 'Tiny · 20mm' },
  { mm: 30, label: 'Small · 30mm' },
  { mm: 60, label: 'Large · 60mm' },
  { mm: 90, label: 'Signpost · 90mm' },
];

export default function Tags({ nav }) {
  const { db, generateTags, retireTag, deleteTag, notify } = useStore();
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const [activeQr, setActiveQr] = useState(null);

  // Batch Create modal
  const [creating, setCreating] = useState(false);
  const [newCount, setNewCount] = useState('10');
  const [newBatch, setNewBatch] = useState('2026-11-A');
  const [creatingBusy, setCreatingBusy] = useState(false);

  // Print Studio modal
  const [printStudio, setPrintStudio] = useState(false);

  const n = (s) => (db.tags || []).filter((t) => t.status === s).length;
  const order = { unused: 0, assigned: 1, retired: 2 };
  const needle = q.trim().toUpperCase();
  const rows = (db.tags || [])
    .filter((t) => !needle || (t?.qr_id && t.qr_id.includes(needle)))
    .sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || String(a?.qr_id || '').localeCompare(String(b?.qr_id || '')));
  const plantFor = (qr) => plantView(db, (db.plants || []).find((p) => p.qr_id === qr));
  const { shown, left, showMore } = useShowMore(rows, needle);

  const handleCreate = async () => {
    const count = parseInt(newCount, 10);
    if (isNaN(count) || count < 1 || count > 50) {
      return Alert.alert('Invalid count', 'Please enter a number between 1 and 50.');
    }
    setCreatingBusy(true);
    try {
      const ids = await generateTags(count, newBatch.trim() || 'batch');
      if (ids && ids.length) {
        setCreating(false);
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not generate tags');
    } finally {
      setCreatingBusy(false);
    }
  };

  const handleRetire = (t) => {
    Alert.alert(
      'Retire QR tag',
      `Retire ${t.qr_id}? A retired tag can no longer be put on a plant or printed, and this cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Retire',
          style: 'destructive',
          onPress: () => {
            retireTag(t.qr_id);
          },
        },
      ]
    );
  };

  const handleDelete = (t) => {
    Alert.alert(
      'Delete unused tag',
      `Delete ${t.qr_id}? This permanently removes this unused tag from the system.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteTag(t.qr_id);
          },
        },
      ]
    );
  };

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

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label="Create batch" icon="plus" flex={1} height={44} onPress={() => setCreating(true)} />
        <Button
          label="Print studio"
          icon="qr"
          kind="secondary"
          flex={1}
          height={44}
          disabled={!rows.filter((t) => t.status !== 'retired').length}
          onPress={() => setPrintStudio(true)}
        />
      </View>

      <SearchField value={q} onChangeText={setQ} placeholder="Find a tag ID" />

      <View>
        <EmptyState count={rows.length} icon="qr" filtered={!!needle}>
          {needle ? 'No tag with that ID.' : 'No QR tags yet.'}
        </EmptyState>
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
              sub={
                <View style={{ gap: 2 }}>
                  <Txt v="small" color={c.ink2} style={{ fontSize: 13 }}>
                    {p ? p.name : `Batch ${t.batch_label || 'default'}`}
                  </Txt>
                  {isUnused && (
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 2 }}>
                      <Pressable onPress={() => handleRetire(t)}>
                        <Txt v="caption" color={c.ink3} style={{ fontWeight: '600' }}>Retire</Txt>
                      </Pressable>
                      <Pressable onPress={() => handleDelete(t)}>
                        <Txt v="caption" color={c.danger} style={{ fontWeight: '600' }}>Delete</Txt>
                      </Pressable>
                    </View>
                  )}
                </View>
              }
              right={<DotLabel status={t.status} />}
              onPress={p ? () => nav.go('tag', { qr: t.qr_id }) : isUnused ? () => setActiveQr(t.qr_id) : undefined}
              last={i === shown.length - 1}
            />
          );
        })}
        {left > 0 ? <Button label={`Show more (${left} left)`} kind="text" height={48} size={15} onPress={showMore} /> : null}
      </View>

      {/* Batch Create Modal */}
      {creating && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setCreating(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }} onPress={() => setCreating(false)}>
            <Pressable style={{ backgroundColor: c.surface, borderRadius: 16, padding: 20, gap: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt v="title2">Create QR tags</Txt>
                <IconButton name="x" label="Close" onPress={() => setCreating(false)} />
              </View>
              <Field
                label="How many (1-50)"
                value={newCount}
                onChangeText={setNewCount}
                keyboardType="number-pad"
                placeholder="10"
              />
              <Field
                label="Batch label"
                value={newBatch}
                onChangeText={setNewBatch}
                placeholder="e.g. 2026-11-A"
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <Button label="Cancel" kind="secondary" flex={1} onPress={() => setCreating(false)} />
                <Button label={creatingBusy ? 'Creating…' : 'Create tags'} flex={1.4} disabled={creatingBusy} onPress={handleCreate} />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Batch Print Studio Modal */}
      {printStudio && (
        <PrintStudioModal tags={db.tags || []} onClose={() => setPrintStudio(false)} />
      )}
    </Screen>
  );
}

function PrintStudioModal({ tags, onClose }) {
  const { c } = useTheme();
  const printableTags = tags.filter((t) => t.status !== 'retired');
  const batches = [...new Set(printableTags.map((t) => t.batch_label || 'default'))];

  const [selectedBatch, setSelectedBatch] = useState('all');
  const [picked, setPicked] = useState(() => new Set(printableTags.slice(0, 10).map((t) => t.qr_id)));
  const [presetMm, setPresetMm] = useState(40);
  const [layout, setLayout] = useState('label'); // label | sheet
  const [copies, setCopies] = useState('1');
  const [caption, setCaption] = useState(true);
  const [cutLines, setCutLines] = useState(true);
  const [exporting, setExporting] = useState(false);

  const displayedTags = printableTags.filter((t) => selectedBatch === 'all' || (t.batch_label || 'default') === selectedBatch);

  const toggleTag = (id) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setPicked(new Set(displayedTags.map((t) => t.qr_id)));
  const clearAll = () => setPicked(new Set());

  const chosenIds = displayedTags.filter((t) => picked.has(t.qr_id)).map((t) => t.qr_id);
  const previewId = chosenIds[0] || 'NIAH-0001';
  const numCopies = Math.max(1, parseInt(copies, 10) || 1);
  const totalTags = chosenIds.length * numCopies;

  const exportHtml = async () => {
    if (!chosenIds.length || exporting) return;
    setExporting(true);
    try {
      // Pre-generate offline inline SVGs for all unique tag IDs
      const svgMap = {};
      for (const id of chosenIds) {
        try {
          const svg = await QRCodeLib.toString(tagUrl(id), { type: 'svg', margin: 1 });
          svgMap[id] = svg;
        } catch {
          svgMap[id] = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(tagUrl(id))}" alt="${escapeHtml(id)}" />`;
        }
      }

      const allItems = chosenIds.flatMap((id) => Array.from({ length: numCopies }, () => id));
      const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Daun Sense QR Tags</title>
<style>
  @page {
    size: ${layout === 'label' ? `${presetMm + 6}mm ${presetMm + (caption ? 14 : 6)}mm` : 'A4'};
    margin: ${layout === 'label' ? '0' : '10mm'};
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4mm;
    background: #fff;
    color: #000;
  }
  .tagcard {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: ${presetMm + 4}mm;
    height: ${presetMm + (caption ? 12 : 4)}mm;
    box-sizing: border-box;
    padding: 2mm;
    ${layout === 'sheet' && cutLines ? 'border: 1px dashed #999;' : ''}
    page-break-inside: avoid;
  }
  .tagcard .qr-svg svg {
    width: ${presetMm}mm;
    height: ${presetMm}mm;
    display: block;
  }
  .tagcard img {
    width: ${presetMm}mm;
    height: ${presetMm}mm;
    display: block;
  }
  .tagcard .id {
    font-family: monospace;
    font-size: ${Math.max(9, presetMm * 0.22)}pt;
    font-weight: bold;
    margin-top: 1.5mm;
    text-align: center;
  }
</style>
</head>
<body>
  ${allItems
    .map(
      (id) => `
    <div class="tagcard">
      <div class="qr-svg">${svgMap[id] || ''}</div>
      ${caption ? `<div class="id">${escapeHtml(id)}</div>` : ''}
    </div>
  `
    )
    .join('')}
</body>
</html>`;

      const fileUri = `${FileSystem.cacheDirectory}batch-tags-print.html`;
      await FileSystem.writeAsStringAsync(fileUri, htmlContent, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/html', dialogTitle: 'Print or Share Tags HTML' });
      } else {
        Alert.alert('Saved', `Printable HTML saved to ${fileUri}`);
      }
    } catch (err) {
      Alert.alert('Export Error', err.message || 'Could not export tags');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal animationType="slide" visible onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.surface }}>
        <Header
          left={<IconButton name="chevL" label="Back" onPress={onClose} />}
          title="Batch QR Print Studio"
          right={<IconButton name="x" label="Close" onPress={onClose} />}
        />
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
          <TitleBlock title="Batch QR Print Studio" sub="Format & print tags for field specimens" />

          {/* Tag selection */}
          <View style={{ padding: 14, borderRadius: 14, backgroundColor: c.bg, gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Txt v="label" style={{ fontSize: 16 }}>Select tags ({chosenIds.length} picked)</Txt>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={selectAll}><Txt v="caption" color={c.accent} style={{ fontWeight: '700' }}>All</Txt></Pressable>
                <Txt v="caption" color={c.ink3}>·</Txt>
                <Pressable onPress={clearAll}><Txt v="caption" color={c.ink3} style={{ fontWeight: '700' }}>Clear</Txt></Pressable>
              </View>
            </View>

            {batches.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                <Pressable
                  onPress={() => setSelectedBatch('all')}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 8,
                    backgroundColor: selectedBatch === 'all' ? c.accent : c.surface,
                  }}
                >
                  <Txt v="caption" color={selectedBatch === 'all' ? c.onAccent : c.ink}>All batches</Txt>
                </Pressable>
                {batches.map((b) => (
                  <Pressable
                    key={b}
                    onPress={() => setSelectedBatch(b)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 8,
                      backgroundColor: selectedBatch === b ? c.accent : c.surface,
                    }}
                  >
                    <Txt v="caption" color={selectedBatch === b ? c.onAccent : c.ink}>{b}</Txt>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <View style={{ maxHeight: 160 }}>
              <ScrollView nestedScrollEnabled>
                {displayedTags.map((t) => {
                  const isChecked = picked.has(t.qr_id);
                  return (
                    <Pressable
                      key={t.qr_id}
                      onPress={() => toggleTag(t.qr_id)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 8,
                        borderBottomWidth: 1,
                        borderBottomColor: c.line,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Icon name={isChecked ? 'check' : 'x'} size={18} color={isChecked ? c.accent : c.ink3} />
                        <Mono size={15}>{t.qr_id}</Mono>
                        <Txt v="caption" color={c.ink2}>· {t.batch_label || 'default'}</Txt>
                      </View>
                      <DotLabel status={t.status} />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          {/* Size & Layout */}
          <View style={{ padding: 14, borderRadius: 14, backgroundColor: c.bg, gap: 12 }}>
            <Txt v="label" style={{ fontSize: 16 }}>Tag Dimensions & Layout</Txt>

            <Txt v="caption" color={c.ink2}>Preset sizes:</Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {SIZES.map((s) => (
                <Pressable
                  key={s.mm}
                  onPress={() => setPresetMm(s.mm)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 8,
                    backgroundColor: presetMm === s.mm ? c.accent : c.surface,
                  }}
                >
                  <Txt v="caption" color={presetMm === s.mm ? c.onAccent : c.ink} style={{ fontWeight: '600' }}>
                    {s.label}
                  </Txt>
                </Pressable>
              ))}
            </ScrollView>

            <Txt v="caption" color={c.ink2}>Output layout:</Txt>
            <Segmented
              value={layout}
              onChange={setLayout}
              items={[
                { key: 'label', label: 'One tag per label' },
                { key: 'sheet', label: 'A4 sheet grid' },
              ]}
            />

            <Field
              label="Copies per tag (1-20)"
              value={copies}
              onChangeText={setCopies}
              keyboardType="number-pad"
              placeholder="1"
            />

            <View style={{ flexDirection: 'row', gap: 20, paddingTop: 4 }}>
              <Pressable
                onPress={() => setCaption(!caption)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                <Icon name={caption ? 'check' : 'x'} size={18} color={caption ? c.accent : c.ink3} />
                <Txt v="body" style={{ fontSize: 14 }}>Print tag ID</Txt>
              </Pressable>

              {layout === 'sheet' && (
                <Pressable
                  onPress={() => setCutLines(!cutLines)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                >
                  <Icon name={cutLines ? 'check' : 'x'} size={18} color={cutLines ? c.accent : c.ink3} />
                  <Txt v="body" style={{ fontSize: 14 }}>Cut lines</Txt>
                </Pressable>
              )}
            </View>
          </View>

          {/* Live Preview */}
          <View style={{ padding: 16, borderRadius: 14, backgroundColor: c.bg, alignItems: 'center', gap: 10 }}>
            <Txt v="caption" color={c.ink2}>Live Tag Preview ({presetMm}mm):</Txt>
            <View
              style={{
                backgroundColor: '#ffffff',
                padding: 12,
                borderRadius: 8,
                borderWidth: layout === 'sheet' && cutLines ? 1 : 0,
                borderColor: '#999999',
                borderStyle: 'dashed',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <QRCode value={tagUrl(previewId)} size={presetMm * 3} backgroundColor="#ffffff" color="#000000" />
              {caption && <Text style={{ fontFamily: font('mono', 700), fontSize: 14, color: '#000000' }}>{previewId}</Text>}
            </View>
            <Txt v="caption" color={c.ink2}>
              {totalTags} tag{totalTags === 1 ? '' : 's'} total ({layout === 'label' ? 'Label format' : 'A4 grid format'})
            </Txt>
          </View>

          {/* Print/Share Action */}
          <Button
            label={exporting ? 'Generating print file…' : `Print / Share ${totalTags} Tags`}
            icon="qr"
            height={50}
            disabled={!chosenIds.length || exporting}
            onPress={exportHtml}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}
