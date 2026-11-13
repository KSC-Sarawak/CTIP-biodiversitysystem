// apps/mobile/pages/Account.js
// Staff profile and account settings for mobile:
// - Profile photo upload with client-side auto-crop/resize to square
// - Remove avatar photo (reverts to user initials)
// - Profile name, username and phone editing
// - Password update
// - Account details & managed status
import React, { useState } from 'react';
import { View, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { useStore } from '../../shared/store.js';
import { ROLE_LABEL } from '../../shared/permissions.js';
import { useTheme, font } from '../components/Theme.js';
import {
  Screen, Header, IconButton, TitleBlock, Section, Avatar, Txt, Field, Button, KV, Notice,
} from '../components/Bits.js';
import { shortDate } from '../components/format.js';

export default function Account({ nav }) {
  const { me, role } = useStore();

  if (!me) {
    return (
      <Screen header={<Header left={<IconButton name="chevL" label="Back" onPress={nav.back} />} />}>
        <TitleBlock title="Account" sub="Please sign in to view account settings." />
      </Screen>
    );
  }

  return (
    <Screen
      header={<Header left={<IconButton name="chevL" label="Back" onPress={nav.back} />} />}
      top={0}
      gap={20}
      refresh={false}
    >
      <TitleBlock title="Account settings" sub="Your profile and sign-in details." />
      <PhotoSection me={me} />
      <ProfileSection me={me} />
      <PasswordSection />
      <DetailsSection me={me} role={role} />
    </Screen>
  );
}

function PhotoSection({ me }) {
  const { updateProfile, notify } = useStore();
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);

  const pickPhoto = async () => {
    if (busy) return;
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1], // client-side square crop
        quality: 0.8,
        base64: true,
      });

      if (!res.canceled && res.assets && res.assets[0]) {
        setBusy(true);
        const asset = res.assets[0];
        const avatar_url = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        const result = await updateProfile({ avatar_url });
        if (result?.ok !== false) {
          notify('Profile photo updated');
        } else {
          Alert.alert('Error', result?.message || 'Could not update photo');
        }
      }
    } catch (err) {
      Alert.alert('Error', 'Could not open image library');
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = () => {
    Alert.alert(
      'Remove profile photo',
      'Remove your profile photo? Your initials will be shown instead.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove photo',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const res = await updateProfile({ avatar_url: null });
              if (res?.ok !== false) {
                notify('Photo removed');
              } else {
                Alert.alert('Error', res?.message || 'Could not remove photo');
              }
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Section title="Profile photo" gap={12}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: 14, backgroundColor: c.bg }}>
        <Avatar name={me.full_name || me.email} uri={me.avatar_url} size={70} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button
              label={busy ? 'Processing…' : me.avatar_url ? 'Change photo' : 'Upload photo'}
              icon="camera"
              kind="secondary"
              height={40}
              size={13}
              disabled={busy}
              onPress={pickPhoto}
            />
            {me.avatar_url && (
              <Button
                label="Remove"
                icon="trash"
                kind="dangerText"
                height={40}
                size={13}
                disabled={busy}
                onPress={removePhoto}
              />
            )}
          </View>
          <Txt v="caption" color={c.ink2}>
            Square JPG or PNG. Cropped to a square automatically. Without a photo, initials are shown.
          </Txt>
        </View>
      </View>
    </Section>
  );
}

function ProfileSection({ me }) {
  const { updateProfile, notify } = useStore();
  const { c } = useTheme();
  const [form, setForm] = useState({
    full_name: me.full_name || '',
    username: me.username || '',
    phone: me.phone || '',
  });
  const [saving, setSaving] = useState(false);

  const dirty =
    form.full_name !== (me.full_name || '') ||
    form.username !== (me.username || '') ||
    form.phone !== (me.phone || '');

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    const res = await updateProfile(form);
    setSaving(false);
    if (!res.ok) {
      return notify(res.message);
    }
    notify('Profile saved');
  };

  const cancel = () => {
    setForm({
      full_name: me.full_name || '',
      username: me.username || '',
      phone: me.phone || '',
    });
  };

  return (
    <Section title="Personal details" gap={12}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, backgroundColor: c.bg }}>
        <Avatar name={form.full_name || me.full_name} uri={me.avatar_url} size={54} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="label" style={{ fontSize: 17 }}>{form.full_name || me.full_name}</Txt>
          <Txt v="small" color={c.ink2} style={{ fontFamily: font('text', 400) }}>
            @{form.username || 'username'} · {ROLE_LABEL[me.role]}
          </Txt>
        </View>
      </View>

      <Field
        label="Full name"
        value={form.full_name}
        onChangeText={(t) => setForm({ ...form, full_name: t })}
        placeholder="Your full name"
      />

      <Field
        label="Username"
        value={form.username}
        onChangeText={(t) => setForm({ ...form, username: t.toLowerCase() })}
        placeholder="username"
        hint="3-20 letters, numbers, dots or underscores"
      />

      <Field
        label="Phone"
        optional
        value={form.phone}
        onChangeText={(t) => setForm({ ...form, phone: t })}
        placeholder="+60 12-345 6789"
        keyboardType="phone-pad"
      />

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <View style={{ flex: 1 }}>
          <Button
            label={saving ? 'Saving…' : 'Save changes'}
            onPress={save}
            disabled={!dirty || saving}
          />
        </View>
        {dirty ? (
          <View style={{ flex: 1 }}>
            <Button
              label="Cancel"
              kind="secondary"
              onPress={cancel}
              disabled={saving}
            />
          </View>
        ) : null}
      </View>
    </Section>
  );
}

function PasswordSection() {
  const { changeMyPassword, notify } = useStore();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    if (!current) return notify('Enter your current password');
    if (next.length < 8) return notify('Use at least 8 characters for the new password');
    if (next !== again) return notify('The new passwords do not match');

    setBusy(true);
    const res = await changeMyPassword(current, next);
    setBusy(false);
    if (!res.ok) return notify(res.message);

    setCurrent('');
    setNext('');
    setAgain('');
    notify('Password changed');
  };

  return (
    <Section title="Security & Password" gap={12}>
      <Field
        label="Current password"
        value={current}
        onChangeText={setCurrent}
        placeholder="••••••••"
        secure
      />
      <Field
        label="New password"
        value={next}
        onChangeText={setNext}
        placeholder="At least 8 characters"
        secure
      />
      <Field
        label="Confirm new password"
        value={again}
        onChangeText={setAgain}
        placeholder="Re-enter new password"
        secure
      />
      <Button
        label={busy ? 'Updating…' : 'Change password'}
        kind="secondary"
        onPress={save}
        disabled={busy || !current || !next || !again}
      />
    </Section>
  );
}

function DetailsSection({ me, role }) {
  return (
    <Section title="Account details" gap={10}>
      <KV
        rows={[
          ['Email', me.email || '-'],
          ['Role', ROLE_LABEL[role] || role],
          ['Status', me.is_active ? 'Active' : 'Turned off'],
          ['Member since', shortDate(me.created_at)],
        ]}
      />
      <Notice
        tone="neutral"
        icon="lock"
        title="Managed account"
        body="Your email and assigned role are managed by an administrator. Contact your system admin if either needs to change."
      />
    </Section>
  );
}
