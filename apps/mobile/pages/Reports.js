// apps/mobile/pages/Reports.js
// Reporting & Analytics:
// 1. Summary charts & breakdowns (status, conservation, family, species)
// 2. Full plant records data table with search, date range filters, 1km zone filter, genus filter,
//    CSV export, and printable report output.
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, Alert, TextInput } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';

import { useStore } from '../../shared/store.js';
import { countPlants, visiblePlants } from '../../shared/selectors.js';
import { label, toCsv, fmtDate } from '../../shared/utils.js';
import { STATUS_TEXT } from '../../shared/tokens.js';
import { CONSERVATION } from '../../shared/data.js';
import { useTheme, font } from '../components/Theme.js';
import Icon from '../components/Icon.js';
import {
  Screen, Header, IconButton, TitleBlock, Stat, Section, Txt, Mono, Sci, Row, Thumb, Notice,
  Segmented, SearchField, Pills, SortBar, Button, DotLabel, EmptyState, Field,
} from '../components/Bits.js';
import { shortDate } from '../components/format.js';
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

function Bar({ labelText, n, max, tone = 'accent', onPress, on }) {
  const { c } = useTheme();
  const body = (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <Txt v={on ? 'label' : 'body'} style={{ fontSize: 15, flex: 1 }}>{labelText}</Txt>
        <Txt v="label">{n}</Txt>
      </View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: c.bg, overflow: 'hidden' }}>
        <View style={{ width: `${max ? (n / max) * 100 : 0}%`, height: 10, borderRadius: 5, backgroundColor: c[tone] }} />
      </View>
    </>
  );
  if (!onPress) return <View style={{ gap: 6, paddingVertical: 4 }}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: !!on }}
      accessibilityLabel={`${labelText}: ${n} plants.`}
      onPress={onPress}
      style={({ pressed }) => ({ gap: 6, paddingVertical: 4, minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
    >
      {body}
    </Pressable>
  );
}

function Bars({ title, rows, picked, onPick, onOpen }) {
  const { c } = useTheme();
  if (!rows || !rows.length) return null;
  const max = Math.max(...rows.map((r) => r.n));
  return (
    <Section title={title} gap={10}>
      {rows.map((r) => {
        const id = `${title}:${r.label}`;
        const on = picked === id;
        return (
          <View key={r.label}>
            <Bar labelText={r.label} n={r.n} max={max} on={on} onPress={() => onPick(on ? null : id)} />
            {on ? (
              <View style={{ marginTop: 4, marginBottom: 8, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: c.line }}>
                {r.plants.map((p, i) => (
                  <Row
                    key={p.id}
                    serif={false}
                    left={<Thumb uri={p.photos?.[0]?.url} size={48} />}
                    title={p.name}
                    sub={
                      <>
                        {p.scientific ? <Sci size={14}>{p.scientific}</Sci> : null}
                        <Mono size={13}>{p.qr_id}</Mono>
                      </>
                    }
                    onPress={() => onOpen(p)}
                    last={i === r.plants.length - 1}
                  />
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </Section>
  );
}

const SORT_RECORDS = [
  { key: 'recorded', label: 'Last visit' },
  { key: 'tag', label: 'Tag ID' },
  { key: 'name', label: 'Species (A–Z)' },
  { key: 'status', label: 'Status' },
  { key: 'height', label: 'Height' },
];

export default function Reports({ nav }) {
  const { db, role } = useStore();
  const { c } = useTheme();

  const [tab, setTab] = useState('overview'); // overview | records
  const [picked, setPicked] = useState(null); // overview bars

  // Records Table filters
  const [q, setQ] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedZone, setSelectedZone] = useState('all');
  const [selectedGenus, setSelectedGenus] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [sort, setSort] = useState('recorded');
  const [exporting, setExporting] = useState(false);

  // Filter pickers
  const [filterPicker, setFilterPicker] = useState(null); // 'zone' | 'genus'

  const lastSeenMap = useMemo(() => {
    const map = {};
    for (const o of db.observations || []) {
      if (!map[o.specimen_id] || o.observed_at > map[o.specimen_id]) {
        map[o.specimen_id] = o.observed_at;
      }
    }
    return map;
  }, [db.observations]);

  const plants = useMemo(() => {
    return visiblePlants(db, role).map((p) => ({
      ...p,
      lastSeen: lastSeenMap[p.id] || null,
      genus: p.species?.genus || p.scientific?.split(' ')[0] || '',
    }));
  }, [db, role, lastSeenMap]);

  const zoneNames = useMemo(() => {
    return Object.fromEntries(
      (db.zones || []).map((z) => [z.id, z.name || `Zone ${z.id}`])
    );
  }, [db.zones]);

  const availableZones = useMemo(() => {
    const zonesSet = new Set(plants.map((p) => p.zone_id).filter(Boolean));
    return [...zonesSet].map((id) => ({ id, name: zoneNames[id] || `Zone ${id}` }));
  }, [plants, zoneNames]);

  const availableGenera = useMemo(() => {
    const genera = [...new Set(plants.map((p) => p.genus).filter(Boolean))].sort();
    return genera;
  }, [plants]);

  const needle = q.trim().toLowerCase();

  const filteredRecords = useMemo(() => {
    return plants.filter((p) => {
      if (selectedStatus !== 'all' && p.status !== selectedStatus) return false;
      if (selectedZone !== 'all' && p.zone_id !== selectedZone) return false;
      if (selectedGenus !== 'all' && p.genus !== selectedGenus) return false;

      // Date range filter
      if (fromDate && (!p.lastSeen || p.lastSeen.slice(0, 10) < fromDate.trim())) return false;
      if (toDate && (!p.lastSeen || p.lastSeen.slice(0, 10) > toDate.trim())) return false;

      if (!needle) return true;
      const haystack = `${p.qr_id || ''} ${p.name || ''} ${p.scientific || ''} ${p.genus || ''} ${p.species?.family || ''}`.toLowerCase();
      return haystack.includes(needle);
    }).sort((a, b) => {
      if (sort === 'tag') return String(a.qr_id || '').localeCompare(String(b.qr_id || ''));
      if (sort === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
      if (sort === 'status') return String(a.status || '').localeCompare(String(b.status || ''));
      if (sort === 'height') return (b.height_cm || 0) - (a.height_cm || 0);
      return String(b.lastSeen || '').localeCompare(String(a.lastSeen || ''));
    });
  }, [plants, selectedStatus, selectedZone, selectedGenus, fromDate, toDate, needle, sort]);

  const { shown, left, showMore } = useShowMore(filteredRecords, `${needle}|${sort}|${selectedStatus}|${selectedZone}|${selectedGenus}|${fromDate}|${toDate}`);

  const countByStatus = (s) => plants.filter((p) => p.status === s).length;
  const speciesCount = (db.species || []).filter((s) => !s.is_deleted).length;
  const openPlant = (p) => nav.go('tag', { qr: p.qr_id });

  const exportCsv = async () => {
    if (!filteredRecords.length || exporting) return;
    setExporting(true);
    try {
      const csvData = toCsv([
        ['Tag', 'Plant name', 'Scientific name', 'Family', 'Genus', 'Conservation', 'Status', 'Last visit', 'Height (cm)', 'Zone'],
        ...filteredRecords.map((p) => [
          p.qr_id,
          p.name,
          p.scientific,
          p.species?.family || '',
          p.genus || '',
          p.conservation || '',
          STATUS_TEXT[p.status] || p.status,
          p.lastSeen ? fmtDate(p.lastSeen) : '',
          p.height_cm ?? '',
          zoneNames[p.zone_id] || '',
        ]),
      ]);

      const fileUri = `${FileSystem.cacheDirectory}plant-records-report.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csvData, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Plant Records CSV' });
      } else {
        Alert.alert('Saved', `CSV file saved to ${fileUri}`);
      }
    } catch (err) {
      Alert.alert('Export Error', err.message || 'Could not export CSV');
    } finally {
      setExporting(false);
    }
  };

  const exportPrintPdf = async () => {
    if (!filteredRecords.length || exporting) return;
    setExporting(true);
    try {
      const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Plant Records Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; color: #222; }
  h1 { margin-bottom: 4px; }
  p.meta { color: #666; margin-top: 0; font-size: 14px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; }
  th { background-color: #f5f5f5; font-weight: 600; }
  tr:nth-child(even) { background-color: #fafafa; }
  .mono { font-family: monospace; font-weight: bold; }
  .sci { font-style: italic; }
</style>
</head>
<body>
  <h1>Plant Records Report</h1>
  <p class="meta">Niah National Park · ${filteredRecords.length} records matching filters · Generated ${escapeHtml(new Date().toLocaleDateString())}</p>
  <table>
    <thead>
      <tr>
        <th>Tag</th>
        <th>Species / Common</th>
        <th>Scientific name</th>
        <th>Status</th>
        <th>Conservation</th>
        <th>Zone</th>
        <th>Last Visit</th>
        <th>Height</th>
      </tr>
    </thead>
    <tbody>
      ${filteredRecords
        .map(
          (p) => `
        <tr>
          <td class="mono">${escapeHtml(p.qr_id || '-')}</td>
          <td><b>${escapeHtml(p.name || '-')}</b></td>
          <td class="sci">${escapeHtml(p.scientific || '-')}</td>
          <td>${escapeHtml(STATUS_TEXT[p.status] || p.status || '-')}</td>
          <td>${escapeHtml(p.conservation || '-')}</td>
          <td>${escapeHtml(zoneNames[p.zone_id] || '-')}</td>
          <td>${escapeHtml(p.lastSeen ? fmtDate(p.lastSeen) : '-')}</td>
          <td>${escapeHtml(p.height_cm ? `${p.height_cm} cm` : '-')}</td>
        </tr>
      `
        )
        .join('')}
    </tbody>
  </table>
</body>
</html>`;

      const printResult = await Print.printToFileAsync({ html: htmlContent, base64: true });
      let targetUri = `${FileSystem.cacheDirectory}plant-records-report.pdf`;
      if (printResult.base64) {
        await FileSystem.writeAsStringAsync(targetUri, printResult.base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else if (printResult.uri) {
        try {
          await FileSystem.copyAsync({ from: printResult.uri, to: targetUri });
        } catch {
          targetUri = printResult.uri;
        }
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(targetUri, { mimeType: 'application/pdf', dialogTitle: 'Print or Share Records PDF', UTI: 'com.adobe.pdf' });
      } else {
        Alert.alert('PDF Created', `Report PDF saved to ${targetUri}`);
      }
    } catch (err) {
      Alert.alert('Print Error', err.message || 'Could not generate report PDF');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Screen header={<Header left={<IconButton name="chevL" label="Back" onPress={nav.back} />} />} top={0} gap={16}>
      <TitleBlock title="Reporting & Analytics" sub="Park biodiversity statistics & data exports" />

      <Segmented
        value={tab}
        onChange={setTab}
        items={[
          { key: 'overview', label: 'Summary & Charts' },
          { key: 'records', label: 'Records & Export' },
        ]}
      />

      {tab === 'overview' && (
        <View style={{ gap: 18 }}>
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Stat value={plants.length} label="Tagged plants" />
              <Stat value={speciesCount} label="Species" />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Stat value={plants.filter((p) => p.endangered).length} label="Endangered plants" tone="danger" />
              <Stat value={(db.alerts || []).filter((a) => a.status === 'open').length} label="Open IoT alerts" tone="danger" />
            </View>
          </View>

          <Section title="Plants by record status" gap={10}>
            <Bar labelText="Published" n={countByStatus('approved')} max={plants.length} tone="success" />
            <Bar labelText="Needs review" n={countByStatus('synced')} max={plants.length} tone="info" />
            <Bar labelText="Returned" n={countByStatus('returned')} max={plants.length} tone="warning" />
          </Section>

          <Txt v="caption" color={c.ink2}>Tap a bar to inspect matching plants.</Txt>

          <Bars
            title="By conservation status"
            rows={countPlants(plants, (p) => (p.conservation === 'unknown' ? null : label(p.conservation)))}
            picked={picked}
            onPick={setPicked}
            onOpen={openPlant}
          />
          <Bars
            title="By family"
            rows={countPlants(plants, (p) => p.species?.family)}
            picked={picked}
            onPick={setPicked}
            onOpen={openPlant}
          />
          <Bars
            title="By species"
            rows={countPlants(plants, (p) => p.scientific || null)}
            picked={picked}
            onPick={setPicked}
            onOpen={openPlant}
          />
        </View>
      )}

      {tab === 'records' && (
        <View style={{ gap: 14 }}>
          {/* Action Export Buttons */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              label={exporting ? 'Exporting…' : 'Export CSV'}
              icon="download"
              kind="secondary"
              flex={1}
              height={44}
              disabled={!filteredRecords.length || exporting}
              onPress={exportCsv}
            />
            <Button
              label={exporting ? 'Generating PDF…' : 'Print / PDF'}
              icon="printer"
              kind="secondary"
              flex={1}
              height={44}
              disabled={!filteredRecords.length || exporting}
              onPress={exportPrintPdf}
            />
          </View>

          {/* Search Field */}
          <SearchField
            value={q}
            onChangeText={setQ}
            placeholder="Search by tag, name, genus or family"
          />

          {/* Date range filter fields */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field
                label="From date"
                value={fromDate}
                onChangeText={setFromDate}
                placeholder="YYYY-MM-DD"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="To date"
                value={toDate}
                onChangeText={setToDate}
                placeholder="YYYY-MM-DD"
              />
            </View>
          </View>

          {/* 1km Zone & Genus Filter Buttons */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              label={selectedZone !== 'all' ? zoneNames[selectedZone] || 'Zone' : 'All 1km zones'}
              kind={selectedZone !== 'all' ? 'primary' : 'quiet'}
              flex={1}
              height={40}
              size={13}
              onPress={() => setFilterPicker('zone')}
            />
            <Button
              label={selectedGenus !== 'all' ? selectedGenus : 'All genera'}
              kind={selectedGenus !== 'all' ? 'primary' : 'quiet'}
              flex={1}
              height={40}
              size={13}
              onPress={() => setFilterPicker('genus')}
            />
          </View>

          {/* Status pills */}
          <Pills
            value={selectedStatus}
            onChange={setSelectedStatus}
            items={[
              { key: 'all', label: 'All records' },
              { key: 'approved', label: 'Published' },
              { key: 'synced', label: 'Needs review' },
              { key: 'returned', label: 'Returned' },
              { key: 'draft', label: 'Draft' },
            ]}
          />

          {/* Sort bar */}
          <SortBar items={SORT_RECORDS} value={sort} onChange={setSort} />

          {/* Plant records feed/table */}
          <View>
            <EmptyState count={filteredRecords.length} icon="file" filtered={!!needle || fromDate || toDate || selectedZone !== 'all' || selectedGenus !== 'all' || selectedStatus !== 'all'}>
              No plant records match your filters.
            </EmptyState>
            {shown.map((p, i) => (
              <Row
                key={p.id}
                left={<Thumb uri={p.photos?.[0]?.url} />}
                title={p.name}
                sub={
                  <View style={{ gap: 2 }}>
                    <Sci size={14}>{p.scientific || 'Unconfirmed'}</Sci>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Mono size={13}>{p.qr_id}</Mono>
                      <Txt v="caption" color={c.ink2}>· {zoneNames[p.zone_id] || 'No zone'}</Txt>
                      <Txt v="caption" color={c.ink2}>· {p.lastSeen ? shortDate(p.lastSeen) : 'No visit'}</Txt>
                      {p.height_cm ? <Txt v="caption" color={c.ink2}>· {p.height_cm}cm</Txt> : null}
                    </View>
                  </View>
                }
                right={<DotLabel status={p.status} />}
                onPress={() => openPlant(p)}
                last={i === shown.length - 1}
              />
            ))}
            {left > 0 ? <Button label={`Show more (${left} left)`} kind="text" height={48} size={15} onPress={showMore} /> : null}
          </View>
        </View>
      )}

      {/* Filter Picker Modal */}
      {filterPicker && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setFilterPicker(null)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} onPress={() => setFilterPicker(null)}>
            <Pressable style={{ maxHeight: '70%', backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt v="title2">{filterPicker === 'zone' ? 'Filter by 1km Zone' : 'Filter by Genus'}</Txt>
                <IconButton name="x" label="Close" onPress={() => setFilterPicker(null)} />
              </View>
              <ScrollView>
                <Pressable
                  style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line }}
                  onPress={() => {
                    if (filterPicker === 'zone') setSelectedZone('all');
                    else setSelectedGenus('all');
                    setFilterPicker(null);
                  }}
                >
                  <Txt v="body" style={{ fontWeight: (!selectedZone && filterPicker === 'zone') || (!selectedGenus && filterPicker === 'genus') ? '700' : '400' }}>
                    {filterPicker === 'zone' ? 'All zones' : 'All genera'}
                  </Txt>
                </Pressable>
                {filterPicker === 'zone'
                  ? availableZones.map((z) => {
                      const selected = selectedZone === z.id;
                      return (
                        <Pressable
                          key={z.id}
                          style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line }}
                          onPress={() => {
                            setSelectedZone(z.id);
                            setFilterPicker(null);
                          }}
                        >
                          <Txt v="body" color={selected ? c.accent : c.ink} style={{ fontWeight: selected ? '700' : '400' }}>
                            {z.name}
                          </Txt>
                        </Pressable>
                      );
                    })
                  : availableGenera.map((g) => {
                      const selected = selectedGenus === g;
                      return (
                        <Pressable
                          key={g}
                          style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line }}
                          onPress={() => {
                            setSelectedGenus(g);
                            setFilterPicker(null);
                          }}
                        >
                          <Txt v="body" color={selected ? c.accent : c.ink} style={{ fontWeight: selected ? '700' : '400' }}>
                            {g}
                          </Txt>
                        </Pressable>
                      );
                    })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </Screen>
  );
}
