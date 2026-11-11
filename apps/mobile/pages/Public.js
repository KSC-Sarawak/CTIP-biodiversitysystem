// apps/mobile/pages/Public.js
// Screens anyone can open: Home, More, About, Contact, and the "no access" fallback.
import React, { useState } from 'react';
import { View, Linking } from 'react-native';

import { useStore } from '../../shared/store.js';
import { visiblePlants, speciesCatalogue, speciesMedia } from '../../shared/selectors.js';
import { getAboutContent, getContactContent, getHomeContent, getStaffPageContent } from '../../shared/publicContent.js';
import { SITE, PARK } from '../../shared/site.js';
import { ROLE_LABEL } from '../../shared/permissions.js';
import { useTheme } from '../components/Theme.js';
import Icon from '../components/Icon.js';
import { LogoMark, AppearanceSection, VersionLine } from '../components/Chrome.js';
import {
  Screen, Header, TitleBlock, SearchField, Section, Row, Thumb, Sci, DotLabel, TextLink, Txt,
  MenuRow, Button, KV, IconTile, IconButton, Empty, EmptyState,
} from '../components/Bits.js';

// Resolve the best thumbnail photo URL for a plant, falling back to public species media
function getPlantPhoto(db, p) {
  const sm = speciesMedia(db, p.species_id || p.species?.id);
  const smUrl = sm?.[0]?.url;
  const specPhoto = p.species?.photo;
  const directPhoto = p.photos?.find((ph) => ph?.url && !ph.url.includes('/object/public/observation-photos/'))?.url;
  const primaryUri = directPhoto || smUrl || specPhoto || p.photo || p.photos?.[0]?.url;
  const fallbackUri = smUrl || specPhoto;
  return { uri: primaryUri, fallbackUri };
}

// Newest published plants first (the date an officer approved them), or published species
function recentPublished(db) {
  const approvedAt = (plant) => {
    const obs = (db.observations || []).filter((o) => o.specimen_id === plant.id && o.status === 'approved');
    const rev = (db.reviews || []).filter((r) => obs.some((o) => o.id === r.observation_id));
    return rev.map((r) => r.created_at).sort().pop() || obs[0]?.observed_at || plant.created_at || '';
  };
  const plants = visiblePlants(db, 'visitor').sort((a, b) => approvedAt(b).localeCompare(approvedAt(a)));
  if (plants.length > 0) return plants;

  return speciesCatalogue(db, 'visitor')
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .map((s) => ({
      id: s.id,
      name: s.common_name || s.name || s.scientific_name,
      scientific: s.scientific_name,
      endangered: s.endangered,
      photos: s.photo ? [{ url: s.photo }] : (s.media?.length ? [{ url: s.media[0].url }] : []),
      species: s,
    }));
}

export function Home({ nav }) {
  const { db } = useStore();
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const recent = recentPublished(db).slice(0, 6);
  const home = getHomeContent(PARK);

  return (
    <Screen
      header={
        <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 8 }}>
          <LogoMark />
          <TextLink label="Sign in" onPress={() => nav.go('signin')} />
        </View>
      }
      top={4}
    >
      <TitleBlock title="Plants of Niah" sub={`Verified records from ${PARK}`} size={34} />
      {/* The search opens the Plants list on the keyboard's search key, so the
          screen does not change under the person while they are still typing. */}
      <SearchField
        value={q}
        onChangeText={setQ}
        onSubmitEditing={() => {
          if (q.trim()) nav.go('plants', { q: q.trim() });
        }}
        placeholder="Search plants or tag ID"
      />
      <Section title={home.recentSectionTitle} top={false} gap={0} right={<TextLink label="See all" size={14} onPress={() => nav.tab('plants')} />}>
        <EmptyState count={recent.length}>No published plants or species yet.</EmptyState>
        {recent.map((p, i) => {
          const { uri, fallbackUri } = getPlantPhoto(db, p);
          return (
            <Row
              key={p.id}
              left={<Thumb uri={uri} fallbackUri={fallbackUri} />}
              title={p.name}
              sub={
                <>
                  <Sci size={14}>{p.scientific || p.scientific_name}</Sci>
                  {p.endangered ? <DotLabel status="endangered" /> : null}
                </>
              }
              onPress={() => {
                if (p.qr_id) nav.go('tag', { qr: p.qr_id });
                else if (p.species?.id || p.id) nav.go('species', { id: p.species?.id || p.id });
                else nav.tab('plants');
              }}
              last={i === recent.length - 1}
            />
          );
        })}
      </Section>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Icon name="lock" size={16} color={c.ink2} />
        <Txt v="caption" color={c.ink2} style={{ flex: 1 }}>Endangered plants never show an exact location.</Txt>
      </View>
    </Screen>
  );
}

// Visitor "More" tab.
export function More({ nav }) {
  const { c } = useTheme();
  return (
    <Screen gap={20}>
      <TitleBlock title="More" />
      <View>
        <MenuRow icon="book" label="Plant book" onPress={() => nav.go('book')} />
        <MenuRow icon="info" label={`About ${SITE}`} onPress={() => nav.go('about')} />
        <MenuRow icon="mail" label="Contact" onPress={() => nav.go('contact')} last />
      </View>
      <AppearanceSection />
      <Section title="Park staff" gap={12}>
        <Txt v="body" color={c.ink2} style={{ fontSize: 15, lineHeight: 22 }}>
          For Sarawak Forestry Corporation botanists, officers and admins.
        </Txt>
        <Button label="Staff sign in" kind="secondary" icon="lock" onPress={() => nav.go('signin')} />
      </Section>
      <VersionLine />
    </Screen>
  );
}

export function About({ nav }) {
  const { c } = useTheme();
  const about = getAboutContent(SITE, PARK);
  const features = getHomeContent(PARK).features;
  return (
    <Screen header={<Header left={<IconButton name="chevL" label="Back" onPress={nav.back} />} />} top={0} gap={18}>
      <TitleBlock title={about.title} />
      {about.paragraphs.map((p) => (
        <Txt key={p.slice(0, 20)} v="body" style={{ lineHeight: 25 }}>{p}</Txt>
      ))}
      <View>
        {features.map((f, i) => (
          <View key={f.title} style={{ flexDirection: 'row', gap: 14, paddingVertical: 14, borderBottomWidth: i < features.length - 1 ? 1 : 0, borderBottomColor: c.line }}>
            <IconTile name={f.icon} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="label" style={{ fontSize: 16 }}>{f.title}</Txt>
              <Txt v="body" color={c.ink2} style={{ fontSize: 15, lineHeight: 22 }}>{f.text}</Txt>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

export function Contact({ nav }) {
  const info = getContactContent();
  return (
    <Screen header={<Header left={<IconButton name="chevL" label="Back" onPress={nav.back} />} />} top={0} gap={18}>
      <TitleBlock title={info.title} />
      <KV rows={[['Organisation', info.organization], ['Address', info.address], ['Email', info.email]]} />
      <Button label="Email us" icon="mail" onPress={() => Linking.openURL(`mailto:${info.email}`)} />
    </Screen>
  );
}

export function NoAccess({ nav }) {
  const { role } = useStore();
  return (
    <Screen header={<Header left={nav.canGoBack ? <IconButton name="chevL" label="Back" onPress={nav.back} /> : null} />} top={0}>
      <Empty icon="lock">
        {role === 'visitor' ? 'This page is for staff. Sign in to continue.' : 'Your role does not include this page.'}
      </Empty>
      {role === 'visitor' ? <Button label="Staff sign in" onPress={() => nav.go('signin')} /> : null}
    </Screen>
  );
}

// Staff portal landing screen (counterpart to web #/staff)
export function StaffLanding({ nav }) {
  const { me, role } = useStore();
  const { c } = useTheme();
  const staff = getStaffPageContent(PARK);

  if (me && role !== 'visitor') {
    return (
      <Screen header={<Header left={nav.canGoBack ? <IconButton name="chevL" label="Back" onPress={nav.back} /> : null} />} top={0} gap={16}>
        <View style={{ alignItems: 'flex-start', paddingTop: 8 }}>
          <LogoMark size={48} />
        </View>
        <TitleBlock title="Staff Portal" sub={`Signed in as ${me.full_name || me.email}`} />
        <View style={{ padding: 16, borderRadius: 14, backgroundColor: c.bg, gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Txt v="label" style={{ fontSize: 16 }}>{me.full_name || 'Staff member'}</Txt>
            <DotLabel status="approved" label={ROLE_LABEL[role] || role} />
          </View>
          <Txt v="small" color={c.ink2}>{me.email}</Txt>
        </View>

        <Button label="Go to staff dashboard" icon="dashboard" height={50} onPress={() => nav.go('dashboard')} />

        <Section title="Quick actions" gap={8}>
          {role === 'botanist' && (
            <>
              <Button label="My records" icon="file" kind="secondary" onPress={() => nav.go('records')} />
              <Button label="Add plant" icon="plus" kind="secondary" onPress={() => nav.go('add')} />
            </>
          )}
          {role === 'officer' && (
            <>
              <Button label="Review queue" icon="clipboard" kind="secondary" onPress={() => nav.go('review')} />
              <Button label="Monitoring" icon="activity" kind="secondary" onPress={() => nav.go('monitor')} />
            </>
          )}
          {role === 'admin' && (
            <>
              <Button label="User management" icon="users" kind="secondary" onPress={() => nav.go('users')} />
              <Button label="Audit log" icon="shield" kind="secondary" onPress={() => nav.go('audit')} />
            </>
          )}
          <Button label="More tools" icon="more" kind="quiet" onPress={() => nav.tab('staffMore')} />
        </Section>
      </Screen>
    );
  }

  return (
    <Screen header={<Header left={nav.canGoBack ? <IconButton name="chevL" label="Back" onPress={nav.back} /> : null} />} top={0} gap={18}>
      <View style={{ alignItems: 'flex-start', paddingTop: 8 }}>
        <LogoMark size={48} />
      </View>
      <TitleBlock title={staff.title} />
      <Txt v="body" color={c.ink2}>{staff.description}</Txt>
      <View style={{ paddingTop: 8 }}>
        <Button label="Sign in as staff" icon="user" height={50} onPress={() => nav.go('signin')} />
      </View>
      <Section title="Looking around?" gap={10}>
        <Txt v="body" color={c.ink2}>{staff.visitorHint}</Txt>
        <Button label="Browse plant catalogue" icon="leaf" kind="secondary" onPress={() => nav.tab('plants')} />
        <Button label="Open plant map" icon="map" kind="secondary" onPress={() => nav.tab('map')} />
      </Section>
    </Screen>
  );
}
