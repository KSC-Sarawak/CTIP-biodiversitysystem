// apps/mobile/pages/Login.js
// Staff sign in through the API:
// 1. Password sign-in with 2-step MFA (Google/MS Authenticator)
// 2. On-screen MFA QR code display + secret key + authenticator app link
// 3. First-time password change prompt
// 4. "Forgot password" reset email link flow
import React, { useRef, useState } from 'react';
import { View, Linking, Pressable, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';

import { useStore } from '../../shared/store.js';
import { getStaffPageContent } from '../../shared/publicContent.js';
import { PARK } from '../../shared/site.js';
import { useTheme } from '../components/Theme.js';
import { Screen, Header, IconButton, TitleBlock, Field, Button, Txt } from '../components/Bits.js';
import { LogoMark } from '../components/Chrome.js';

export default function SignIn({ nav }) {
  const { login, signIn, mfaEnroll, mfaVerify, mfaCancel, changePassword, notify } = useStore();
  const { c } = useTheme();

  // Mode: 'credentials' | 'forgot' | 'first' | 'code' | 'setup'
  const [mode, setMode] = useState('credentials');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pendingUserId, setPendingUserId] = useState(null);

  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState(null); // { secret, uri, qr } while setting up
  const [busy, setBusy] = useState(false);

  const staff = getStaffPageContent(PARK);
  const passwordInput = useRef(null);

  // Password submission
  const submitCredentials = async () => {
    if (busy || !email || !password) return;
    setBusy(true);
    setError('');
    try {
      const res = await login(email, password);
      if (!res.ok) return setError(res.message);

      if (res.mfa === 'setup') {
        const en = await mfaEnroll();
        if (!en.ok) {
          await mfaCancel();
          return setError(en.message);
        }
        setSetup({ secret: en.secret, uri: en.uri, qr: en.qr });
        setCode('');
        return setMode('setup');
      }

      if (res.mfa === 'verify') {
        setCode('');
        return setMode('code');
      }

      if (res.first) {
        setPendingUserId(res.id);
        return setMode('first');
      }

      signIn(res.id);
    } catch {
      setError('Sign in failed. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  // MFA 6-digit code check
  const submitCode = async () => {
    if (busy || code.length !== 6) return;
    setBusy(true);
    setError('');
    try {
      const res = await mfaVerify(code);
      if (!res.ok) return setError(res.message);
      if (mode === 'setup') notify('Two-step sign-in is set up');
      setSetup(null);
      signIn(res.id);
    } catch {
      setError('The code could not be checked. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  // First-time password change
  const submitFirstTimePassword = async () => {
    if (newPassword.length < 8) {
      return setError('New password must be at least 8 characters.');
    }
    setBusy(true);
    try {
      const res = await changePassword(null, newPassword);
      if (!res.ok) return setError(res.message || 'Could not change password');
      notify('Password updated');
      signIn(pendingUserId);
    } catch {
      setError('Password change failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  // Forgot password reset link request
  const submitForgotPassword = async () => {
    if (!email.trim() || !email.includes('@')) {
      return setError('Please enter a valid staff email address.');
    }
    setBusy(true);
    try {
      const res = await changePassword(email.trim(), null);
      Alert.alert(
        'Password Reset Email',
        res.message || 'If an account exists with this email, a password reset link has been sent.',
        [{ text: 'OK', onPress: () => setMode('credentials') }]
      );
    } catch {
      setError('Could not send reset link. Try again shortly.');
    } finally {
      setBusy(false);
    }
  };

  const openAuthenticator = async () => {
    try {
      await Linking.openURL(setup.uri);
    } catch {
      setError('No authenticator app found. Install one (for example Google Authenticator), or scan the QR code.');
    }
  };

  const copyKey = async () => {
    await Clipboard.setStringAsync(setup.secret);
    notify('Set-up key copied');
  };

  const cancelMfa = async () => {
    await mfaCancel();
    setMode('credentials');
    setCode('');
    setSetup(null);
    setError('');
  };

  // 1. MFA Setup Screen (with on-screen QR code)
  if (mode === 'setup' && setup) {
    return (
      <Screen refresh={false} header={<Header left={<IconButton name="x" label="Back to sign in" onPress={cancelMfa} />} />} top={0} gap={16}>
        <TitleBlock title="Set up two-step sign-in" sub="Scan the QR code or enter secret in your authenticator" />
        <Txt v="body" color={c.ink2}>
          Every staff account requires a 6-digit code. Install Google Authenticator or Microsoft Authenticator, then scan this code.
        </Txt>

        {/* On-Screen QR Code Display */}
        <View style={{ alignItems: 'center', padding: 16, borderRadius: 16, backgroundColor: '#ffffff', gap: 10 }}>
          <QRCode value={setup.uri} size={180} backgroundColor="#ffffff" color="#000000" />
          <Txt v="caption" color="#444444">Scan with your authenticator camera</Txt>
        </View>

        <Button label="Open authenticator app directly" kind="secondary" onPress={openAuthenticator} />

        <View style={{ padding: 14, borderRadius: 14, backgroundColor: c.bg, gap: 8 }}>
          <Txt v="caption" color={c.ink2}>Or enter this set-up key by hand:</Txt>
          <Txt v="mono" selectable style={{ fontSize: 16, lineHeight: 22 }}>
            {setup.secret.replace(/(.{4})/g, '$1 ').trim()}
          </Txt>
          <Button label="Copy set-up key" kind="quiet" height={36} size={13} onPress={copyKey} />
        </View>

        <Field
          label="Enter 6-digit verification code"
          value={code}
          onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setError(''); }}
          placeholder="123456"
          keyboardType="number-pad"
          autoComplete="one-time-code"
          returnKeyType="done"
          onSubmitEditing={submitCode}
          maxLength={6}
          error={error || undefined}
        />

        <Button label={busy ? 'Checking…' : 'Finish set-up'} disabled={busy || code.length !== 6} onPress={submitCode} />
      </Screen>
    );
  }

  // 2. MFA Verify Code Screen
  if (mode === 'code') {
    return (
      <Screen refresh={false} header={<Header left={<IconButton name="x" label="Back to sign in" onPress={cancelMfa} />} />} top={0} gap={18}>
        <TitleBlock title="Enter your code" sub="Two-factor authentication" />
        <Txt v="body" color={c.ink2}>Open your authenticator app and type the 6-digit code for Daun Sense.</Txt>
        <Field
          label="6-digit code"
          value={code}
          onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setError(''); }}
          placeholder="123456"
          keyboardType="number-pad"
          autoFocus
          autoComplete="one-time-code"
          returnKeyType="done"
          onSubmitEditing={submitCode}
          maxLength={6}
          error={error || undefined}
        />
        <Button label={busy ? 'Checking…' : 'Verify'} disabled={busy || code.length !== 6} onPress={submitCode} />
        <Txt v="small" color={c.ink2}>Lost your phone? Ask an admin to reset your two-step sign-in.</Txt>
      </Screen>
    );
  }

  // 3. First-time Password Change Screen
  if (mode === 'first') {
    return (
      <Screen refresh={false} header={<Header left={<IconButton name="x" label="Cancel" onPress={() => setMode('credentials')} />} />} top={0} gap={16}>
        <TitleBlock title="Create new password" sub="First-time login setup" />
        <Txt v="body" color={c.ink2}>Please choose a new personal password before continuing to your staff dashboard.</Txt>
        <Field
          label="New password (at least 8 characters)"
          value={newPassword}
          onChangeText={(t) => { setNewPassword(t); setError(''); }}
          secure
          placeholder="••••••••"
          error={error || undefined}
        />
        <Button label={busy ? 'Saving…' : 'Save and continue'} disabled={busy || newPassword.length < 8} onPress={submitFirstTimePassword} />
      </Screen>
    );
  }

  // 4. Forgot Password Screen
  if (mode === 'forgot') {
    return (
      <Screen refresh={false} header={<Header left={<IconButton name="chevL" label="Back" onPress={() => setMode('credentials')} />} />} top={0} gap={16}>
        <TitleBlock title="Forgot password" sub="Reset via email link" />
        <Txt v="body" color={c.ink2}>Enter your staff email address and we'll send you a link to reset your password.</Txt>
        <Field
          label="Staff email"
          value={email}
          onChangeText={(v) => { setEmail(v); setError(''); }}
          placeholder="name@sfc.my"
          keyboardType="email-address"
          autoComplete="email"
          error={error || undefined}
        />
        <Button label={busy ? 'Sending link…' : 'Send reset link'} disabled={busy || !email.trim()} onPress={submitForgotPassword} />
        <Button label="Back to sign in" kind="quiet" onPress={() => { setMode('credentials'); setError(''); }} />
      </Screen>
    );
  }

  // 5. Main Sign In Screen (Credentials)
  return (
    <Screen refresh={false} header={<Header left={<IconButton name="x" label="Close" onPress={nav.back} />} />} top={0} gap={16}>
      <View style={{ alignItems: 'flex-start', paddingTop: 8 }}>
        <LogoMark size={48} />
      </View>
      <TitleBlock title="Staff sign in" sub="Sarawak Forestry Corporation" />

      <View style={{ gap: 14 }}>
        <Field
          label="Email"
          value={email}
          onChangeText={(v) => { setEmail(v); setError(''); }}
          placeholder="name@sfc.my"
          keyboardType="email-address"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordInput.current?.focus()}
        />
        <Field
          label="Password"
          value={password}
          onChangeText={(v) => { setPassword(v); setError(''); }}
          secure={!show}
          inputRef={passwordInput}
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={submitCredentials}
          rightIcon={show ? 'eyeOff' : 'eye'}
          rightLabel={show ? 'Hide password' : 'Show password'}
          onRightPress={() => setShow(!show)}
          error={error || undefined}
        />

        <View style={{ alignItems: 'flex-end', marginTop: -4 }}>
          <Pressable onPress={() => { setMode('forgot'); setError(''); }}>
            <Txt v="caption" color={c.accent} style={{ fontWeight: '700' }}>Forgot password?</Txt>
          </Pressable>
        </View>

        <Button label={busy ? 'Signing in…' : 'Sign in'} disabled={busy || !email || !password} onPress={submitCredentials} />
      </View>

      <Txt v="small" color={c.ink2} style={{ fontSize: 14 }}>
        {staff.description.split('. ').pop()} {staff.visitorHint}
      </Txt>
    </Screen>
  );
}
