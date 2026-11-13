// apps/mobile/pages/Admin.js
// Staff "More" tab (profile, tools, appearance, sign out), and the admin's Users and Audit log.
import React, { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';

import { useStore } from '../../shared/store.js';
import { nameOf } from '../../shared/selectors.js';
import { fuzzyMatch } from '../../shared/fuzzy.js';
import { can, ROLE_LABEL } from '../../shared/permissions.js';
import { useTheme, font } from '../components/Theme.js';
import { AppearanceSection, VersionLine } from '../components/Chrome.js';
import {
  Screen, Header, IconButton, TitleBlock, Section, MenuRow, Button, Avatar, Txt, Mono, SearchField, Pills, SortBar, Row, DotLabel,
  Field, Segmented, EmptyState, Chip,
} from '../components/Bits.js';
import { shortDate } from '../components/format.js';
import { clearAllDrafts, listDrafts } from '../draftStore.js';
import { unregisterCurrentPushToken } from '../hooks/useAlertNotifications.js';
import { unsentTitle } from '../../shared/offline/syncStatus.js';
import { useShowMore } from '../hooks/useShowMore.js';

export function StaffMore({ nav }) {
  const { me, role, logout, outboxItems = [], syncNow, apiStatus } = useStore();

  // UI G (CTIP-68): records saved on this phone and not sent yet. Signing out
  // keeps them (encrypted; Product Owner decision), and they send the next time
  // this person signs in here. Online, "Send now" tries first, then asks again
  // with what is left; when nothing is left it carries on signing out.
  const askAboutUnsent = (count) => {
    const buttons = [{ text: 'Stay signed in', style: 'cancel' }];
    if (apiStatus === 'connected') {
      buttons.push({
        text: 'Send now',
        onPress: async () => {
          const summary = await syncNow({ manual: true });
          const left = summary ? summary.pending + summary.failed + summary.conflicts : count;
          if (left > 0) askAboutUnsent(left);
          else signOutWithDrafts(true);
        },
      });
    }
    buttons.push({ text: 'Sign out', style: 'destructive', onPress: () => signOutWithDrafts(true) });
    Alert.alert(
      unsentTitle(count),
      'They stay on this phone, encrypted, and send the next time you sign in here. Sign out anyway?',
      buttons,
    );
  };

  const handleSignOut = () => {
    if (outboxItems.length > 0) askAboutUnsent(outboxItems.length);
    else signOutWithDrafts(false);
  };

  // Unfinished form drafts (CTIP-57) are not records: they are deleted on sign-out.
  // `asked`: the person already said yes to signing out (the unsent-records
  // question), so they are not asked a second time.
  const signOutWithDrafts = async (asked) => {
    let drafts = [];
    try {
      drafts = await listDrafts();
    } catch {}

    const doSignOut = async () => {
      try {
        await unregisterCurrentPushToken();
      } catch {}
      try {
        await clearAllDrafts();
      } catch {}
      await logout();
    };

    if (drafts && drafts.length > 0) {
      const count = drafts.length;
      Alert.alert(
        'Unsent plant drafts',
        `This phone has ${count === 1 ? '1 unsent plant draft' : `${count} unsent plant drafts`}. Signing out deletes them, so they do not stay on a shared phone. Sign out anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete and sign out', style: 'destructive', onPress: doSignOut },
        ]
      );
    } else if (asked) {
      await doSignOut();
    } else {
      // Nothing would be lost, but a slip of the thumb should not sign anyone out.
      Alert.alert('Sign out?', "You'll need your password and 6-digit code to sign in again.", [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', onPress: doSignOut },
      ]);
    }
  };
  const { c } = useTheme();
  const tools = [
    { icon: 'dashboard', label: 'Staff dashboard', go: 'dashboard' },
    { icon: 'user', label: 'Account settings', go: 'account' },
    can(role, 'monitor') && { icon: 'activity', label: 'Monitoring', go: 'monitor' },
    can(role, 'species') && { icon: 'leaf', label: 'Species', go: 'speciesAdmin' },
    can(role, 'tags') && { icon: 'qr', label: 'QR tags', go: 'tags' },
    can(role, 'reports') && { icon: 'chart', label: 'Reports', go: 'reports' },
    can(role, 'audit') && { icon: 'shield', label: 'Audit log', go: 'audit' },
    can(role, 'discuss') && { icon: 'chat', label: 'Discussion', go: 'discussion' },
    { icon: 'map', label: 'Plant map', go: 'map' },
    !can(role, 'species') && { icon: 'leaf', label: 'Species catalogue', go: 'plants' },
    { icon: 'book', label: 'Plant book', go: 'book' },
  ].filter(Boolean);

  return (
    <Screen gap={18}>
      <TitleBlock title="More" />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open account settings"
        onPress={() => nav.go('account')}
        style={({ pressed }) => [{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          padding: 14,
          borderRadius: 14,
          backgroundColor: c.bg,
          opacity: pressed ? 0.75 : 1,
        }]}
      >
        <Avatar name={me?.full_name || me?.email || 'User'} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="label" style={{ fontSize: 17 }}>{me?.full_name || me?.email || 'User'}</Txt>
          <Txt v="small" color={c.ink2} style={{ fontFamily: font('text', 400) }}>{(ROLE_LABEL[role] || role || 'Member')} · {me?.email}</Txt>
        </View>
        <Txt v="caption" color={c.accent} style={{ fontFamily: font('text', 600) }}>Edit</Txt>
      </Pressable>
      <Section title="Tools" gap={0}>
        {tools.map((t, i) => <MenuRow key={t.label} icon={t.icon} label={t.label} onPress={() => nav.go(t.go)} last={i === tools.length - 1} />)}
      </Section>
      <AppearanceSection />
      <VersionLine />
      <Button label="Sign out" kind="dangerText" icon="logout" height={48} size={15} onPress={handleSignOut} />
    </Screen>
  );
}

const ROLE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'botanist', label: 'Botanists' },
  { key: 'officer', label: 'Officers' },
  { key: 'admin', label: 'Admins' },
  { key: 'off', label: 'Deactivated' },
];

const SORT_USERS = [
  { key: 'active', label: 'Active first' },
  { key: 'name', label: 'Name (A–Z)' },
  { key: 'nameDesc', label: 'Name (Z–A)' },
  { key: 'role', label: 'Role' },
  { key: 'email', label: 'Email' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_DAYS = 30; // 30-day grace period for soft delete
const removeDate = (u) => new Date(new Date(u.deleted_at).getTime() + GRACE_DAYS * DAY_MS);
const daysLeft = (u) => Math.max(0, Math.ceil((removeDate(u) - Date.now()) / DAY_MS));

export function Users({ nav }) {
  const { db, me, addUser, updateUser, deleteUser, restoreUser, notify } = useStore();
  const [openId, setOpenId] = useState(null); // the account showing its role and active controls
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('active');
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', role: 'botanist', password: '' });
  const [error, setError] = useState(null); // { field: 'name' | 'email' | 'password', text }
  const [sending, setSending] = useState(false);

  const needle = q.trim().toLowerCase();
  const profiles = db.profiles || [];

  const rows = profiles
    .filter((p) => {
      if (filter === 'all') return true;
      if (filter === 'off') return !p.is_active || p.deleted_at;
      return p.role === filter && p.is_active && !p.deleted_at;
    })
    .filter((p) => !needle || fuzzyMatch(`${p.full_name || ''} ${p.email || ''} ${p.role || ''}`, needle));

  const sorted = [...rows].sort((a, b) => {
    if (sort === 'name') return (a.full_name || '').localeCompare(b.full_name || '');
    if (sort === 'nameDesc') return (b.full_name || '').localeCompare(a.full_name || '');
    if (sort === 'role') return (a.role || '').localeCompare(b.role || '') || (a.full_name || '').localeCompare(b.full_name || '');
    if (sort === 'email') return (a.email || '').localeCompare(b.email || '');
    return ((b.is_active && !b.deleted_at ? 1 : 0) - (a.is_active && !a.deleted_at ? 1 : 0)) || (a.full_name || '').localeCompare(b.full_name || '');
  });

  const activeUsers = sorted.filter((u) => u.is_active && !u.deleted_at);
  const inactiveUsers = sorted.filter((u) => !u.is_active || u.deleted_at)
    .sort((a, b) => (!!b.deleted_at - !!a.deleted_at) || (a.deleted_at && b.deleted_at ? a.deleted_at.localeCompare(b.deleted_at) : 0));

  const off = profiles.filter((p) => !p.is_active || p.deleted_at).length;

  const changeRole = (p, role) => {
    if (role === (p.role || 'botanist')) return;
    Alert.alert(`Change ${p.full_name || p.email || 'this user'} to ${ROLE_LABEL[role] || role}?`, 'Their access changes straight away.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Change role', onPress: () => updateUser(p.id, { role }) },
    ]);
  };

  const setActive = (p) => {
    if (!p.is_active) return updateUser(p.id, { is_active: true });
    Alert.alert(`Deactivate ${p.full_name || p.email || 'this user'}?`, 'They will not be able to sign in. Their records stay.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deactivate', style: 'destructive', onPress: () => updateUser(p.id, { is_active: false }) },
    ]);
  };

  const removeUser = (p) => {
    Alert.alert(
      'Delete user (30-day grace period)',
      `Delete ${p.full_name || p.email}? Their account is turned off immediately. You can restore them from the Not active section for 30 days before permanent removal.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete user',
          style: 'destructive',
          onPress: async () => {
            await deleteUser(p.id);
            setOpenId(null);
          },
        },
      ]
    );
  };

  const restoreUserAccount = (p) => {
    Alert.alert(
      'Restore user account',
      `Restore ${p.full_name || p.email}? The account returns deactivated; switch it back on when they should sign in again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            await restoreUser(p.id);
          },
        },
      ]
    );
  };

  const problem = (field) => (error?.field === field ? error.text : undefined);
  const invite = async () => {
    if (sending) return;
    if (!form.full_name.trim()) return setError({ field: 'name', text: 'Enter their name.' });
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError({ field: 'email', text: 'Enter a valid email.' });
    if (form.password && form.password.length < 8) return setError({ field: 'password', text: 'A temporary password needs at least 8 characters.' });
    setSending(true);
    let res;
    try {
      res = await addUser({ ...form, full_name: form.full_name.trim(), password: form.password || undefined });
    } finally {
      setSending(false);
    }
    if (!res?.ok) return setError({ field: 'email', text: res?.message || 'Someone already uses this email.' });
    setInviting(false);
    setForm({ full_name: '', email: '', role: 'botanist', password: '' });
    setError(null);
  };

  return (
    <Screen gap={14} refresh={!inviting}>
      <TitleBlock title="User Administration" sub={`${profiles.length} accounts · ${off} not active`}
        right={!inviting ? <Button label="Invite member" icon="plus" height={44} size={14} onPress={() => setInviting(true)} /> : null} />

      {inviting ? (
        <View style={{ gap: 14, padding: 16, borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
          <Txt v="title3">Invite member</Txt>
          <Field label="Full name" value={form.full_name} onChangeText={(v) => setForm({ ...form, full_name: v })} error={problem('name')} />
          <Field label="Email" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" error={problem('email')} />
          <Segmented value={form.role} onChange={(v) => setForm({ ...form, role: v })} items={[{ key: 'botanist', label: 'Botanist' }, { key: 'officer', label: 'Officer' }, { key: 'admin', label: 'Admin' }]} />
          <Field label="Temporary password" optional secure value={form.password} onChangeText={(v) => setForm({ ...form, password: v })} error={problem('password')}
            hint="Leave blank to send an email invitation, or set one so they can sign in straight away." />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Cancel" kind="secondary" flex={1} disabled={sending} onPress={() => { setInviting(false); setError(null); }} />
            <Button label={sending ? (form.password ? 'Creating…' : 'Sending…') : form.password ? 'Create account' : 'Send invite'} flex={1.4} disabled={sending} onPress={invite} />
          </View>
        </View>
      ) : null}

      <SearchField value={q} onChangeText={setQ} placeholder="Search name or email" />
      <Pills value={filter} onChange={setFilter} items={ROLE_FILTERS} />
      <SortBar items={SORT_USERS} value={sort} onChange={setSort} />

      {/* Active Users Section */}
      <View style={{ gap: 4 }}>
        <Txt v="label" color={c.ink2} style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4 }}>
          Active accounts ({activeUsers.length})
        </Txt>
        <EmptyState count={activeUsers.length} icon="users" filtered={profiles.length > 0}>No active users match.</EmptyState>
        {activeUsers.map((p, i) => (
          <View key={p.id}>
            <Row
              serif={false}
              left={<Avatar name={p.full_name || p.email || 'Member'} uri={p.avatar_url} size={44} />}
              title={`${p.full_name || p.email || 'Unnamed member'}${p.id === me?.id ? ' (you)' : ''}`}
              sub={<Txt v="small" color={c.ink2} style={{ fontFamily: font('text', 400) }}>{p.email}</Txt>}
              right={<Text style={{ fontFamily: font('text', 700), fontSize: 13, color: c.ink2 }}>{((ROLE_LABEL[p.role] || p.role || 'Member')).split(' ').pop().replace(/^\w/, (m) => m.toUpperCase())}</Text>}
              onPress={p.id === me?.id ? undefined : () => setOpenId(openId === p.id ? null : p.id)}
              last={i === activeUsers.length - 1 && openId !== p.id}
            />
            {openId === p.id ? (
              <View style={{ gap: 10, padding: 14, marginBottom: 8, borderRadius: 14, backgroundColor: c.bg }}>
                <Txt v="label">Role</Txt>
                <Segmented value={p.role || 'botanist'} onChange={(role) => changeRole(p, role)} items={[{ key: 'botanist', label: 'Botanist' }, { key: 'officer', label: 'Officer' }, { key: 'admin', label: 'Admin' }]} />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <Button label="Deactivate account" kind="secondary" flex={1} height={44} size={14} onPress={() => setActive(p)} />
                  <Button label="Delete user" kind="dangerText" flex={1} height={44} size={14} onPress={() => removeUser(p)} />
                </View>
              </View>
            ) : null}
          </View>
        ))}
      </View>

      {/* Not Active & Deleted Users Section */}
      {inactiveUsers.length > 0 && (
        <View style={{ gap: 6, marginTop: 14, padding: 14, borderRadius: 14, backgroundColor: c.bg }}>
          <Txt v="label" style={{ fontSize: 16 }}>Not active accounts ({inactiveUsers.length})</Txt>
          <Txt v="caption" color={c.ink2}>Deactivated or soft-deleted users. Deleted accounts can be restored within 30 days.</Txt>
          {inactiveUsers.map((p) => {
            const isDeleted = !!p.deleted_at;
            const remaining = isDeleted ? daysLeft(p) : null;
            return (
              <View
                key={p.id}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: c.line,
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt v="label" style={{ fontSize: 15 }}>{p.full_name || p.email}</Txt>
                  <Txt v="small" color={c.ink2}>{p.email} · {ROLE_LABEL[p.role]}</Txt>
                  {isDeleted ? (
                    <Txt v="caption" color={c.danger} style={{ fontWeight: '600' }}>
                      Deleted · {remaining} day{remaining === 1 ? '' : 's'} left to restore
                    </Txt>
                  ) : (
                    <DotLabel tone="neutral" label="Deactivated" />
                  )}
                </View>
                <Button
                  label={isDeleted ? 'Restore' : 'Reactivate'}
                  kind="quiet"
                  height={38}
                  size={13}
                  onPress={() => (isDeleted ? restoreUserAccount(p) : setActive(p))}
                />
              </View>
            );
          })}
        </View>
      )}

      <Button label="Audit log" kind="text" icon="shield" height={48} size={15} onPress={() => nav.go('audit')} />
    </Screen>
  );
}

// Plain sentence for one audit row.
function describe(db, a) {
  const plantOfObs = (id) => db.plants?.find((p) => p.id === db.observations?.find((o) => o.id === id)?.specimen_id)?.qr_id;
  const nv = a.new_value || {};
  if (a.table_name === 'observations' && nv.status) {
    const verb = { approved: 'Approved', returned: 'Returned', rejected: 'Rejected', synced: 'Sent' }[nv.status] || 'Updated';
    return `${verb} the record for ${plantOfObs(a.record_id) || 'a plant'}`;
  }
  if (a.table_name === 'profiles') {
    if (nv.is_active === false) return `Deactivated ${nameOf(db, a.record_id)}`;
    if (nv.is_active === true) return `Turned on ${nameOf(db, a.record_id)}`;
    if (a.action === 'insert') return `Added ${nv.email}`;
    if (nv.password) return 'Changed their password';
  }
  return `${a.action === 'insert' ? 'Added' : a.action === 'delete' ? 'Removed' : 'Changed'} ${a.table_name?.replace('_', ' ') || 'row'}`;
}

// Full raw JSON state diff (old_value -> new_value for all keys with sensitive redaction)
const SENSITIVE_KEYS = new Set(['password', 'password_hash', 'mfa_secret', 'token', 'access_token', 'refresh_token', 'secret']);

function formatVal(k, v) {
  if (v === undefined) return undefined;
  if (SENSITIVE_KEYS.has(k.toLowerCase())) return '••••••••';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

function fullJsonDiff(a) {
  const nv = a.new_value || {};
  const ov = a.old_value || {};
  const allKeys = [...new Set([...Object.keys(nv), ...Object.keys(ov)])];
  if (!allKeys.length) return null;
  return allKeys.map((k) => {
    const bVal = formatVal(k, ov[k]);
    const aVal = formatVal(k, nv[k]);
    const before = bVal === undefined ? '(none)' : bVal;
    const after = aVal === undefined ? '(deleted)' : aVal;
    return `${k}: ${before} → ${after}`;
  });
}

export function Audit({ nav }) {
  const { db } = useStore();
  const { c } = useTheme();
  const [filter, setFilter] = useState('all');

  const rows = (db.audit || [])
    .filter((a) => filter === 'all' || (filter === 'accounts' ? a.table_name === 'profiles' : a.table_name !== 'profiles'))
    .sort((a, b) => (b.changed_at || '').localeCompare(a.changed_at || ''));

  const { shown, left, showMore } = useShowMore(rows, filter);

  return (
    <Screen header={<Header left={<IconButton name="chevL" label="Back" onPress={nav.back} />} />} top={0} gap={16}>
      <TitleBlock
        title="Audit Log"
        sub={`${rows.length} total changes recorded · Security & state diffs`}
      />
      <Pills
        value={filter}
        onChange={setFilter}
        items={[
          { key: 'all', label: `All (${rows.length})` },
          { key: 'records', label: 'Records' },
          { key: 'accounts', label: 'Accounts' },
        ]}
      />
      <View>
        <EmptyState count={rows.length} icon="shield" filtered={(db.audit || []).length > 0}>
          No changes recorded.
        </EmptyState>
        {shown.map((a, i) => {
          const diffs = fullJsonDiff(a);
          const actionUpper = String(a.action || 'update').toUpperCase();
          return (
            <View
              key={a.id}
              style={{
                gap: 8,
                paddingVertical: 14,
                borderBottomWidth: i === shown.length - 1 ? 0 : 1,
                borderBottomColor: c.line,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Txt v="label">{nameOf(db, a.changed_by)}</Txt>
                <Txt v="caption" color={c.ink3} style={{ fontFamily: font('text', 600) }}>
                  {shortDate(a.changed_at)}
                </Txt>
              </View>

              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Chip value={a.table_name || 'table'} />
                <Chip value={actionUpper} />
              </View>

              <Txt v="body" style={{ fontSize: 15, lineHeight: 22 }}>
                {describe(db, a)}
              </Txt>

              {/* Full JSON state diff */}
              {diffs && diffs.length > 0 && (
                <View style={{ padding: 10, borderRadius: 10, backgroundColor: c.bg, gap: 4 }}>
                  <Txt v="caption" color={c.ink2} style={{ fontWeight: '700' }}>State Diff (old_value → new_value):</Txt>
                  {diffs.map((line, idx) => (
                    <Mono key={idx} size={12} color={c.ink}>
                      {line}
                    </Mono>
                  ))}
                </View>
              )}
            </View>
          );
        })}
        {left > 0 ? <Button label={`Show more (${left} left)`} kind="text" height={48} size={15} onPress={showMore} /> : null}
      </View>
    </Screen>
  );
}
