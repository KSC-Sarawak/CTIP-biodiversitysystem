// apps/mobile/pages/Dashboard.js
// The Plants tab: the species catalogue (everyone) and the tagged plants (staff).
// Both load in pages as you scroll (infinite scroll) and show a small loading line
// while the next page arrives.
import React, { useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, Animated, Linking, Alert, Modal, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { useStore } from '../../shared/store.js';
import { visiblePlants, nameOf, speciesCatalogue, lastVisit } from '../../shared/selectors.js';
import { isThreatened } from '../../shared/data.js';
import { useTheme, font } from '../components/Theme.js';
import {
  TitleBlock, SearchField, Pills, Segmented, SortBar, Row, Thumb, Sci, Mono, DotLabel, Txt, IconButton,
  SkeletonRow, LoadingMore, Empty, EmptyState, Notice, Button, Chip, TextLink,
} from '../components/Bits.js';
import { LogoMark } from '../components/Chrome.js';
import { shortDate } from '../components/format.js';
import { OfflineCaption, OFFLINE_EMPTY_TEXT, speciesPhoto } from '../components/OfflineSpecies.js';
import { useSpeciesSearch } from '../hooks/useSpeciesSearch.js';
import { cleanTerm, isTagSearch } from '../../shared/speciesSearch.js';
import { can, DASHBOARD_LABEL } from '../../shared/permissions.js';
import { fuzzyMatch } from '../../shared/fuzzy.js';
import { STATUS_TEXT } from '../../shared/tokens.js';
import { toCsv, fmtDate } from '../../shared/utils.js';
import { usePolling } from '../hooks/usePolling.js';
import { usePullRefresh } from '../hooks/usePullRefresh.js';

const PAGE_SIZE = 20; // same as the API's default `limit`
const ROW_HEIGHT = 77; // fixed row height lets the list jump straight to a letter
const LETTER_HEIGHT = 42;
const RAIL_MIN = 15; // shorter lists scroll quickly enough without the A–Z rail
const RAIL_SPACE = 16; // room kept right of the rows for the rail
const LIST_BOTTOM = 40; // clears the raised Add plant / Scan button in the tab bar

// Pages through `items` already in the store: page 1, 2, 3… of PAGE_SIZE.
// The rows are in memory, so each page shows at once: there is nothing to wait
// for (`loading` is always false; it is kept so both lists read the same way).
// A botanist or visitor typing a species name searches the API instead
// (useSpeciesSearch, CTIP-26; see SpeciesList), and that search does load.
function usePaged(items, resetKey) {
  const [page, setPage] = useState({ key: resetKey, count: PAGE_SIZE });
  // A new search or filter starts again from page 1.
  const count = page.key === resetKey ? page.count : PAGE_SIZE;
  if (page.key !== resetKey) setPage({ key: resetKey, count: PAGE_SIZE });

  const loadMore = () => {
    if (count < items.length) setPage({ key: resetKey, count: count + PAGE_SIZE });
  };

  return { shown: items.slice(0, count), loading: false, loadMore, total: items.length, done: count >= items.length };
}

function ListHeader({ children }) {
  return <View style={{ gap: 14, paddingTop: 12, paddingBottom: 8 }}>{children}</View>;
}

// The Plants tab holds two lists, opened as `plants` (species first) or `tagged`
// (tagged plants first). Switching between them only changes this screen's
// params (nav.replace), not the screen, so the title and the switch stay exactly
// where they are, nothing slides in, and going back from a plant returns to the
// same list. Each role always sees the two options in the same order.
export function SpeciesList({ nav, params = {} }) {
  return <PlantsTab nav={nav} params={params} route="plants" start="species" />;
}

export function TaggedPlants({ nav, params = {} }) {
  return <PlantsTab nav={nav} params={params} route="tagged" start="tagged" />;
}

function PlantsTab({ nav, params, route, start }) {
  usePolling(5000);
  const view = params.view || start;
  const onView = (v) => nav.replace(route, { ...params, view: v });
  return view === 'species'
    ? <SpeciesCatalogue nav={nav} params={params} onView={onView} />
    : <TaggedList nav={nav} onView={onView} />;
}

// Title, count and the Species / Tagged plants switch, the same in both lists.
// Species is always on the left, Tagged plants on the right.
function PlantsHeader({ nav, view, onView, count, children }) {
  const { c } = useTheme();
  const { role } = useStore();
  const items = [{ key: 'species', label: 'Species' }, { key: 'tagged', label: 'Tagged plants' }];
  return (
    <ListHeader>
      {role === 'visitor' ? (
        <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 4, marginBottom: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {nav.canGoBack ? <IconButton name="chevL" label="Back" onPress={nav.back} /> : null}
            <LogoMark />
          </View>
          <TextLink label="Sign in" onPress={() => nav.go('signin')} />
        </View>
      ) : nav.canGoBack ? (
        <View style={{ marginLeft: -16, marginTop: -8 }}><IconButton name="chevL" label="Back" onPress={nav.back} /></View>
      ) : null}
      <TitleBlock title="Plants" right={<Txt v="small" color={c.ink2}>{count}</Txt>} />
      <Segmented value={view} onChange={(k) => k !== view && onView(k)} items={items} />
      {children}
    </ListHeader>
  );
}

/* ---------- species catalogue ---------- */

const SORT_SPECIES = [
  { key: 'common', label: 'Common (A–Z)' },
  { key: 'scientific', label: 'Scientific (A–Z)' },
  { key: 'family', label: 'Family' },
  { key: 'endangered', label: 'Endangered' },
  { key: 'plants', label: 'Most tagged' },
];

function SpeciesCatalogue({ nav, params, onView }) {
  const { db, role } = useStore();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState(params.q || '');
  const [family, setFamily] = useState('all');
  const [sort, setSort] = useState('common');
  const list = useRef(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [headerH, setHeaderH] = useState(0);
  const staff = role !== 'visitor';

  // Published species only for visitors; staff also see unpublished ones.
  const species = speciesCatalogue(db, role);
  const families = [...new Set(species.map((s) => s.family).filter(Boolean))].sort();
  const plants = visiblePlants(db, role);

  const needle = q.trim().toLowerCase();
  const filtered = species
    .filter((s) => family === 'all' || s.family === family)
    .filter((s) => {
      if (!needle) return true;
      const tags = plants.filter((p) => p.species_id === s.id && p.qr_id).map((p) => String(p.qr_id).toLowerCase());
      const text = [s.common_name, s.scientific_name, s.family].filter(Boolean).join(' '); return fuzzyMatch(text, needle) || tags.some((t) => fuzzyMatch(t, needle));
    });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'scientific') return (a.scientific_name || '').localeCompare(b.scientific_name || '');
    if (sort === 'family') return (a.family || '').localeCompare(b.family || '') || (a.common_name || a.scientific_name).localeCompare(b.common_name || b.scientific_name);
    if (sort === 'endangered') {
      const ea = isThreatened(a.conservation_status) ? 1 : 0;
      const eb = isThreatened(b.conservation_status) ? 1 : 0;
      if (eb !== ea) return eb - ea;
      return (a.common_name || a.scientific_name).localeCompare(b.common_name || b.scientific_name);
    }
    if (sort === 'plants') {
      const ca = plants.filter((p) => p.species_id === a.id).length;
      const cb = plants.filter((p) => p.species_id === b.id).length;
      if (cb !== ca) return cb - ca;
      return (a.common_name || a.scientific_name).localeCompare(b.common_name || b.scientific_name);
    }
    return (a.common_name || a.scientific_name).localeCompare(b.common_name || b.scientific_name);
  });

  const local = usePaged(sorted, `${q}|${family}|${sort}`);

  // For botanists and visitors, typing a name searches published species through
  // the API, a page at a time (CTIP-26). They only ever see published species, so
  // the API returns the same set the list holds. Officers and admins keep searching
  // the loaded list, which also has unpublished species. A tag ID, whole or in part,
  // is always looked up among the plants already loaded, and browsing without a
  // search term keeps the full list with its sorts.
  const apiMode = !can(role, 'species') && !isTagSearch(q) && cleanTerm(q).length >= 2;
  const search = useSpeciesSearch({ q: apiMode ? q : '', family: apiMode ? family : undefined });
  const shown = apiMode ? search.items : local.shown;
  const loading = apiMode ? search.loading : local.loading;
  const loadMore = apiMode ? search.loadMore : local.loadMore;
  const total = apiMode ? (search.total ?? 0) : local.total;
  const done = apiMode ? !search.hasMore : local.done;
  // A pull also asks for the API search results again (nothing to do when the
  // list is searched on the phone: refresh() is then a no-op).
  const refreshControl = usePullRefresh(search.refresh);

  // Insert a letter heading before the first species of each letter (when sorted alphabetically).
  const isAlphaSort = !apiMode && ['common', 'scientific'].includes(sort);
  const rows = [];
  let last = '';
  for (const s of shown) {
    if (isAlphaSort) {
      const name = sort === 'scientific' ? (s.scientific_name || s.common_name) : (s.common_name || s.scientific_name);
      const letter = (name || '?')[0].toUpperCase();
      if (letter !== last) rows.push({ type: 'letter', key: 'L' + letter, letter });
      last = letter;
    }
    rows.push({ type: 'species', key: s.id, s });
  }
  const offsets = [];
  rows.reduce((y, r) => {
    offsets.push(y);
    return y + (r.type === 'letter' ? LETTER_HEIGHT : ROW_HEIGHT);
  }, 0);
  const letters = rows.filter((r) => r.type === 'letter').map((r) => r.letter);
  const showRail = isAlphaSort && letters.length > 1 && total >= RAIL_MIN && headerH > 0;
  const jump = (letter) => {
    const i = rows.findIndex((r) => r.type === 'letter' && r.letter === letter);
    if (i >= 0) list.current?.scrollToOffset({ offset: offsets[i] + headerH, animated: true });
  };

  const header = (
    <View onLayout={(e) => { const h = e.nativeEvent.layout.height; if (h !== headerH) setHeaderH(h); }}>
      <PlantsHeader nav={nav} view="species" onView={onView} count={`${total} species`}>
        <SearchField value={q} onChangeText={setQ} placeholder="Search name or tag ID" />
        <Pills value={family} onChange={setFamily} items={[{ key: 'all', label: 'All families' }, ...families.map((f) => ({ key: f, label: f }))]} />
        {apiMode ? null : <SortBar items={SORT_SPECIES} value={sort} onChange={setSort} />}
        {/* With nothing saved, the empty state below carries the same sentence. */}
        {apiMode && search.cachedCount > 0 ? <OfflineCaption search={search} /> : null}
        {apiMode && search.error ? (
          <View style={{ gap: 8 }}>
            <Notice tone="warning" icon="info" title="Species search unavailable" body={search.error} />
            <Button label="Try again" kind="secondary" height={48} size={15} onPress={search.retry} />
          </View>
        ) : null}
      </PlantsHeader>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: insets.top }}>
      <Animated.FlatList
        ref={list}
        data={rows}
        keyExtractor={(r) => r.key}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: LIST_BOTTOM }}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        refreshControl={refreshControl}
        renderItem={({ item }) => (
          // Only the rows make room for the rail; the header keeps the full width.
          <View style={{ paddingRight: showRail ? RAIL_SPACE : 0 }}>
            {item.type === 'letter' ? (
              <View style={{ height: LETTER_HEIGHT, justifyContent: 'flex-end', paddingBottom: 2 }}>
                <Text accessibilityRole="header" style={{ fontFamily: font('display', 700), fontSize: 18, color: c.accent }}>{item.letter}</Text>
              </View>
            ) : (
              <SpeciesRow s={item.s} plants={plants} staff={staff} onPress={() => nav.go('species', { id: item.s.id })} />
            )}
          </View>
        )}
        ListEmptyComponent={
          loading || (apiMode && search.error) ? null
          : apiMode && search.offline && search.cachedCount === 0 ? <Empty icon="search">{OFFLINE_EMPTY_TEXT}</Empty>
          : <EmptyState count={0} icon="search" filtered={!!needle || family !== 'all'}>{needle || family !== 'all' ? 'No species match. Try another name or family.' : 'No species yet.'}</EmptyState>
        }
        ListFooterComponent={
          loading ? (
            <View>
              {shown.length === 0 ? [0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} />) : <SkeletonRow />}
              <LoadingMore />
            </View>
          ) : done && shown.length > PAGE_SIZE ? <Txt v="caption" color={c.ink3} style={{ textAlign: 'center', paddingVertical: 16 }}>That's every species.</Txt> : null
        }
      />
      {showRail ? (
        <LetterIndex
          letters={letters}
          onJump={jump}
          top={insets.top + 8}
          // Starts just below the header, then stays at the top once the header scrolls away.
          translateY={scrollY.interpolate({ inputRange: [0, headerH], outputRange: [headerH, 0], extrapolate: 'clamp' })}
        />
      ) : null}
    </View>
  );
}

function SpeciesRow({ s, plants, staff, onPress }) {
  const photo = speciesPhoto(s) || plants.find((p) => p.species_id === s.id && p.photos?.length)?.photos[0]?.url;
  return (
    <View style={{ height: ROW_HEIGHT }}>
      <Row
        left={<Thumb uri={photo} />}
        title={s.common_name || s.scientific_name}
        sub={
          <>
            <Sci size={14}>{s.scientific_name}</Sci>
            {isThreatened(s.conservation_status) ? <DotLabel status="endangered" /> : null}
            {staff && s.is_published === false ? <DotLabel tone="neutral" label="Not published" /> : null}
          </>
        }
        onPress={onPress}
        right={null}
      />
    </View>
  );
}

// Letter strip down the right edge, beside the rows (never over the header). Only
// letters that have species are listed.
function LetterIndex({ letters, onJump, top, translateY }) {
  const { c } = useTheme();
  return (
    <Animated.View accessibilityLabel="Jump to letter" style={{ position: 'absolute', right: 2, top, width: 28, alignItems: 'center', transform: [{ translateY }] }}>
      {letters.map((l) => (
        <Pressable key={l} onPress={() => onJump(l)} accessibilityRole="button" accessibilityLabel={`Jump to ${l}`} hitSlop={{ left: 12, right: 4 }}
          style={{ height: 20, justifyContent: 'center' }}>
          <Text style={{ fontFamily: font('text', 800), fontSize: 11, color: c.accent }}>{l}</Text>
        </Pressable>
      ))}
    </Animated.View>
  );
}

/* ---------- tagged plants (staff & visitors) ---------- */

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'Recorded by me' },
  { key: 'synced', label: 'Needs review' },
  { key: 'returned', label: 'Returned' },
  { key: 'endangered', label: 'Endangered' },
];

const SORT_TAGGED = [
  { key: 'recent', label: 'Recent visit' },
  { key: 'name', label: 'Name (A–Z)' },
  { key: 'tag', label: 'Tag ID' },
  { key: 'status', label: 'Status' },
];

function TaggedList({ nav, onView }) {
  const { db, role, me } = useStore();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');

  const lastVisit = (id) => db.observations.filter((o) => o.specimen_id === id).map((o) => o.observed_at).sort().pop();
  const all = visiblePlants(db, role)
    .map((p) => ({ ...p, seen: lastVisit(p.id), by: nameOf(db, p.registered_by) }));

  const needle = q.trim().toLowerCase();
  const filtered = all
    .filter((p) => (filter === 'all' ? true : filter === 'mine' ? p.registered_by === me?.id : filter === 'endangered' ? p.endangered : p.status === filter))
    .filter((p) => !needle || fuzzyMatch([p.qr_id, p.name, p.scientific, p.by].filter(Boolean).join(' '), needle));

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
    if (sort === 'tag') return (a.qr_id || '').localeCompare(b.qr_id || '');
    if (sort === 'status') return (a.status || '').localeCompare(b.status || '') || (b.seen || '').localeCompare(a.seen || '');
    return (b.seen || '').localeCompare(a.seen || '');
  });

  const { shown, loading, loadMore } = usePaged(sorted, `${q}|${filter}|${sort}|${db.plants.length}`);
  const refreshControl = usePullRefresh();
  const filters = role === 'visitor'
    ? [{ key: 'all', label: 'All' }, { key: 'endangered', label: 'Endangered' }]
    : role === 'botanist'
    ? FILTERS
    : FILTERS.filter((f) => f.key !== 'mine');

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: insets.top }}>
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: LIST_BOTTOM }}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={refreshControl}
        ListHeaderComponent={
          <PlantsHeader nav={nav} view="tagged" onView={onView} count={`${all.length} tagged`}>
            <SearchField value={q} onChangeText={setQ} placeholder={role === 'visitor' ? 'Tag ID or species' : 'Tag ID, species or botanist'} />
            <Pills value={filter} onChange={setFilter} items={filters} />
            <SortBar items={SORT_TAGGED} value={sort} onChange={setSort} />
          </PlantsHeader>
        }
        renderItem={({ item: p, index }) => (
          <Row
            left={<Thumb uri={p.photos[0]?.url} />}
            title={p.name}
            sub={
              <>
                <Mono size={13}>{p.qr_id}</Mono>
                {/* One piece of text, so a wrapped line never starts with a dot. */}
                <Txt v="small" color={c.ink2} style={{ fontSize: 13 }}>{[role !== 'visitor' ? p.by : null, shortDate(p.seen)].filter(Boolean).join(' · ')}</Txt>
              </>
            }
            right={<DotLabel status={p.status} />}
            onPress={() => nav.go('tag', { qr: p.qr_id })}
            last={index === shown.length - 1 && !loading}
          />
        )}
        ListEmptyComponent={loading ? null : <EmptyState count={0} icon="search" filtered={!!needle || filter !== 'all'}>{needle || filter !== 'all' ? 'No tagged plants match.' : 'No tagged plants yet.'}</EmptyState>}
        ListFooterComponent={loading ? <View>{shown.length === 0 ? [0, 1, 2, 3].map((i) => <SkeletonRow key={i} />) : null}<LoadingMore /></View> : null}
      />
    </View>
  );
}

/* ---------- staff dashboard (full table, saved views, export, share) ---------- */

const DAY_MS = 86400000;
const DASHBOARD_VIEWS = [
  { key: 'all', name: 'All tagged plants', hint: 'Every tagged plant you can see.', test: () => true, roles: ['officer', 'admin'] },
  { key: 'mine', name: 'My records', hint: 'Plants you tagged.', test: () => true, roles: ['botanist'] },
  { key: 'review', name: 'Needs review', hint: 'Synced from the field and waiting for an officer.', test: (r) => r.status === 'synced', roles: ['officer', 'admin'] },
  { key: 'returned', name: 'Returned to botanist', hint: 'An officer asked for changes.', test: (r) => r.status === 'returned' },
  { key: 'stale', name: 'Not visited in 6 months', hint: 'Due for a field visit.', test: (r) => !r.seen || Date.now() - new Date(r.seen).getTime() > 182 * DAY_MS },
  { key: 'nophotos', name: 'No photos yet', hint: 'Records without a single photo.', test: (r) => r.photos.length === 0 },
  { key: 'endangered', name: 'Endangered species', hint: 'Their locations are hidden from visitors.', test: (r) => r.endangered },
  { key: 'sensor', name: 'Has a sensor node', hint: 'Plants protected by an IoT node.', test: (r) => r.hasNode },
];

const SORT_DASHBOARD = [
  { key: 'qr_id', label: 'Tag ID' },
  { key: 'name', label: 'Species (A–Z)' },
  { key: 'status', label: 'Status' },
  { key: 'by', label: 'Recorded by' },
  { key: 'seen', label: 'Last visit' },
  { key: 'nphotos', label: 'Photos' },
];

export function StaffDashboard({ nav }) {
  usePolling(5000);
  const { db, role, me } = useStore();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();

  const [viewKey, setViewKey] = useState(role === 'officer' ? 'review' : 'all');
  const [q, setQ] = useState('');
  const [speciesId, setSpeciesId] = useState('');
  const [by, setBy] = useState('');
  const [sort, setSort] = useState('qr_id');
  const [exporting, setExporting] = useState(false);

  // Pickers modal state
  const [pickerType, setPickerType] = useState(null); // 'species' | 'by'

  const nodes = new Set((db.nodes || []).map((n) => n.specimen_id));
  const allPlantsVisible = can(role, 'allPlants');

  const rows = visiblePlants(db, role)
    .filter((p) => allPlantsVisible || p.registered_by === me?.id)
    .map((p) => ({
      ...p,
      by: nameOf(db, p.registered_by),
      seen: lastVisit(db, p.id, role),
      nphotos: (p.photos || []).length,
      hasNode: nodes.has(p.id),
    }));

  const views = DASHBOARD_VIEWS
    .filter((v) => !v.roles || v.roles.includes(role))
    .map((v) => ({ ...v, count: rows.filter((r) => v.test(r, me)).length }));

  const curView = views.find((v) => v.key === viewKey) || views[0];
  const needle = q.trim().toLowerCase();

  const filtered = rows
    .filter((r) => curView.test(r, me))
    .filter((r) => !speciesId || r.species_id === speciesId)
    .filter((r) => !by || r.registered_by === by)
    .filter((r) => !needle || `${r.qr_id} ${r.name} ${r.scientific} ${r.by}`.toLowerCase().includes(needle));

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
    if (sort === 'status') return String(a.status || '').localeCompare(String(b.status || ''));
    if (sort === 'by') return String(a.by || '').localeCompare(String(b.by || ''));
    if (sort === 'seen') return String(b.seen || '').localeCompare(String(a.seen || ''));
    if (sort === 'nphotos') return (b.nphotos || 0) - (a.nphotos || 0);
    return String(a.qr_id || '').localeCompare(String(b.qr_id || ''));
  });

  const { shown, loadMore } = usePaged(sorted, `${viewKey}|${q}|${speciesId}|${by}|${sort}`);
  const refreshControl = usePullRefresh();

  const speciesOptions = [...new Map(rows.filter((r) => r.species).map((r) => [r.species_id, r.name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const peopleOptions = [...new Map(rows.map((r) => [r.registered_by, r.by])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));

  const exportCsv = async () => {
    if (exporting || !sorted.length) return;
    setExporting(true);
    try {
      const csvData = toCsv([
        ['Tag', 'Species', 'Scientific name', 'Status', 'Recorded by', 'Last visit', 'Photos'],
        ...sorted.map((r) => [
          r.qr_id,
          r.name,
          r.scientific,
          STATUS_TEXT[r.status] || r.status,
          r.by,
          r.seen ? fmtDate(r.seen) : '',
          r.nphotos,
        ]),
      ]);
      const fileUri = `${FileSystem.cacheDirectory}tagged-plants-${curView.key}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csvData, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: `Export ${curView.name}` });
      } else {
        Alert.alert('CSV Created', `File saved to ${fileUri}`);
      }
    } catch (err) {
      Alert.alert('Export Error', err.message || 'Could not export CSV');
    } finally {
      setExporting(false);
    }
  };

  const shareEmail = async () => {
    const subject = encodeURIComponent(`Daun Sense: ${curView.name}`);
    const body = encodeURIComponent(
      `Please check the tagged plants list (${curView.name}, ${sorted.length} records).\n\nSent from Daun Sense mobile app.`
    );
    try {
      await Linking.openURL(`mailto:?subject=${subject}&body=${body}`);
    } catch {
      Alert.alert('No Mail Client', 'Could not open an email app on this device.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: insets.top }}>
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: LIST_BOTTOM }}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={refreshControl}
        ListHeaderComponent={
          <View style={{ gap: 14, paddingTop: 12, paddingBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Txt v="caption" color={c.ink2} style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  {DASHBOARD_LABEL[role] || 'Staff Dashboard'}
                </Txt>
                <TitleBlock title={curView.name} right={<Txt v="small" color={c.ink2}>{sorted.length} plants</Txt>} />
              </View>
            </View>

            {/* Saved view pills */}
            <Pills
              value={curView.key}
              onChange={setViewKey}
              items={views.map((v) => ({ key: v.key, label: `${v.name} (${v.count})` }))}
            />

            <Txt v="body" color={c.ink2} style={{ fontSize: 14 }}>{curView.hint}</Txt>

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {curView.key === 'review' && curView.count > 0 && (
                <Button label="Open review queue" icon="clipboard" height={44} onPress={() => nav.go('review')} />
              )}
              {role === 'botanist' && (
                <Button label="Add plant" icon="plus" height={44} onPress={() => nav.go('add')} />
              )}
              {can(role, 'tags') && (
                <Button label="QR tags" icon="qr" kind="secondary" height={44} onPress={() => nav.go('tags')} />
              )}
              <Button
                label={exporting ? 'Exporting…' : 'Export CSV'}
                icon="download"
                kind="secondary"
                height={44}
                disabled={!sorted.length || exporting}
                onPress={exportCsv}
              />
              <Button label="Share email" icon="mail" kind="secondary" height={44} onPress={shareEmail} />
            </View>

            {/* Search and filters */}
            <SearchField
              value={q}
              onChangeText={setQ}
              placeholder={allPlantsVisible ? 'Tag ID, species or botanist' : 'Tag ID or species'}
            />

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                label={speciesId ? speciesOptions.find(([id]) => id === speciesId)?.[1] || 'Species' : 'All species'}
                kind={speciesId ? 'primary' : 'quiet'}
                flex={1}
                height={40}
                size={13}
                onPress={() => setPickerType('species')}
              />
              {allPlantsVisible && (
                <Button
                  label={by ? peopleOptions.find(([id]) => id === by)?.[1] || 'Recorder' : 'All recorders'}
                  kind={by ? 'primary' : 'quiet'}
                  flex={1}
                  height={40}
                  size={13}
                  onPress={() => setPickerType('by')}
                />
              )}
            </View>

            {/* Sort Bar */}
            <SortBar items={SORT_DASHBOARD} value={sort} onChange={setSort} />
          </View>
        }
        renderItem={({ item: r, index }) => (
          <Row
            left={<Thumb uri={r.photos?.[0]?.url} />}
            title={r.name}
            sub={
              <>
                <Mono size={13}>{r.qr_id}</Mono>
                <Txt v="small" color={c.ink2} style={{ fontSize: 13 }}>
                  {[r.by, r.seen ? shortDate(r.seen) : 'No visits', `${r.nphotos} photo${r.nphotos === 1 ? '' : 's'}`]
                    .filter(Boolean)
                    .join(' · ')}
                </Txt>
              </>
            }
            right={<DotLabel status={r.status} />}
            onPress={() => nav.go('tag', { qr: r.qr_id })}
            last={index === shown.length - 1}
          />
        )}
        ListEmptyComponent={
          <EmptyState count={0} icon="leaf" filtered={!!needle || !!speciesId || !!by}>
            {needle || speciesId || by ? 'No plants match these filters.' : 'Nothing in this view.'}
          </EmptyState>
        }
      />

      {/* Filter picker modal */}
      {pickerType && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setPickerType(null)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} onPress={() => setPickerType(null)}>
            <Pressable style={{ maxHeight: '70%', backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt v="title2">{pickerType === 'species' ? 'Filter by species' : 'Filter by recorder'}</Txt>
                <IconButton name="x" label="Close" onPress={() => setPickerType(null)} />
              </View>
              <ScrollView>
                <Pressable
                  style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line }}
                  onPress={() => {
                    if (pickerType === 'species') setSpeciesId('');
                    else setBy('');
                    setPickerType(null);
                  }}
                >
                  <Txt v="body" style={{ fontWeight: (!speciesId && pickerType === 'species') || (!by && pickerType === 'by') ? '700' : '400' }}>
                    {pickerType === 'species' ? 'All species' : 'All recorders'}
                  </Txt>
                </Pressable>
                {(pickerType === 'species' ? speciesOptions : peopleOptions).map(([id, label]) => {
                  const selected = pickerType === 'species' ? speciesId === id : by === id;
                  return (
                    <Pressable
                      key={id}
                      style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line }}
                      onPress={() => {
                        if (pickerType === 'species') setSpeciesId(id);
                        else setBy(id);
                        setPickerType(null);
                      }}
                    >
                      <Txt v="body" color={selected ? c.accent : c.ink} style={{ fontWeight: selected ? '700' : '400' }}>
                        {label}
                      </Txt>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}
