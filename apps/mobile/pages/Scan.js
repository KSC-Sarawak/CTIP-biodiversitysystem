// apps/mobile/pages/Scan.js
// Scan a pre-printed QR tag (CTIP-15). Tags are printed in batches beforehand and fixed
// to the plant in the field. What happens next depends on the tag and who is scanning:
//   unused tag + botanist   -> "Start a new plant record?"  -> Add plant
//   tag already on a plant  -> botanist: "Record a revisit" / everyone else: plant page
//   retired or unknown      -> explain, scan again
//   kept for another botanist -> explain, scan again (CTIP-116)
//   not known, offline      -> botanist: "Start record" anyway; checked when back online
// A botanist with no tag to hand can make one instead (CTIP-27): "No tag? Make a new
// one" opens Add plant with no tag, which offers "Generate new QR tag".
// Without signal the tag is looked up in this phone's unsent records, the last
// loaded workspace and the tag list saved on the phone (lookupTagOffline, CTIP-83).
// Pick mode (params.pickFor = a record on this phone, CTIP-68): the record's tag
// was already on another plant, so the scanned tag replaces it (changeRecordTag)
// and the scanner goes back to that record.
import React, { useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, scanFromURLAsync } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';

import { useStore } from '../../shared/store.js';
import { extractTag } from '../../shared/selectors.js';
import { lookupTagOffline, outboxTagsFrom } from '../../shared/offline/tags.js';
import { useTheme, font } from '../components/Theme.js';
import Icon from '../components/Icon.js';
import { Sheet, Button, Txt, Mono, Sci, DotLabel, Thumb, IconButton } from '../components/Bits.js';
import { shortDate } from '../components/format.js';

const CAMERA_TEXT = '#eef4e4';
const CAMERA_MUTED = '#b4c9ab';

export default function Scan({ nav, params = {} }) {
  const { db, me, role, apiStatus, outboxItems = [], cachedTags = [], changeRecordTag } = useStore();
  const pickFor = params.pickFor || null;
  const picking = useRef(false); // one tag change per scan, however many times the camera reads it
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  // "checking" counts as offline too: at start-up without signal the API has not answered yet.
  const lookup = (raw) => lookupTagOffline(db, extractTag(raw), {
    cached: cachedTags,
    outboxTags: outboxTagsFrom(outboxItems),
    offline: apiStatus !== 'connected',
    meId: me?.id,
  });
  const [result, setResult] = useState(params.code ? lookup(params.code) : null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');

  const close = () => (nav.canGoBack ? nav.back() : nav.home());

  // Pick mode: an unused tag (or one that can't be checked offline; the API
  // checks it when the record is sent) goes onto the record. Any other tag
  // shows why it can't be used.
  const pick = async (r) => {
    if (r.kind !== 'unused' && r.kind !== 'unchecked') return setResult({ ...r, picking: true });
    if (picking.current) return;
    picking.current = true;
    const res = await changeRecordTag(pickFor, r.id); // shows "Tag changed to …"
    if (res?.ok) return nav.back();
    picking.current = false;
    Alert.alert('Tag not changed', res?.message || 'Try again.');
  };

  const handle = (raw) => {
    if (result) return; // ignore repeat reads while a result is showing
    const r = lookup(raw);
    if (pickFor) {
      setTyping(false);
      return pick(r);
    }
    // A visitor who scans a published plant goes straight to its page.
    if (r.kind === 'used' && role !== 'botanist') return nav.replace('tag', { qr: r.id });
    setTyping(false);
    setResult(r);
  };

  const pickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (!result.canceled && result.assets?.length) {
        const asset = result.assets[0];
        let foundData = null;
        try {
          if (typeof scanFromURLAsync === 'function') {
            const barcodes = await scanFromURLAsync(asset.uri, ['qr']);
            if (barcodes && barcodes.length > 0) foundData = barcodes[0].data;
          }
        } catch (e) {
          console.warn('scanFromURLAsync error in Scan:', e);
        }
        const tag = extractTag(foundData || asset.fileName || asset.uri);
        if (tag && /NIAH-\d{4}/.test(tag)) {
          handle(tag);
        } else {
          Alert.alert('No QR detected', 'Could not detect a valid plant QR tag in this photo.');
        }
      }
    } catch (err) {
      console.warn('Gallery pick error in Scan:', err);
    }
  };

  const granted = permission?.granted;

  return (
    <View style={{ flex: 1, backgroundColor: '#06110b' }}>
      {granted && !result ? (
        <CameraView
          style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => handle(data)}
        />
      ) : null}

      <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={{ height: 56, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 }}>
          <IconButton name="x" label="Close scanner" color={CAMERA_TEXT} onPress={close} />
          {granted && !result ? <IconButton name="torch" label={torch ? 'Turn off torch' : 'Turn on torch'} color={torch ? '#e8bd5c' : CAMERA_TEXT} size={22} onPress={() => setTorch(!torch)} /> : null}
        </View>

        {result ? (
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <Result result={result} role={role} nav={nav} onAgain={() => setResult(null)} />
          </View>
        ) : typing ? (
          <ManualEntry value={typed} onChange={setTyped} onSubmit={() => handle(typed)} onCancel={() => setTyping(false)} />
        ) : (
          <>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28 }}>
              {granted ? <Viewfinder /> : <PermissionAsk onAsk={requestPermission} canAsk={permission?.canAskAgain !== false} />}
              <View style={{ alignItems: 'center', gap: 6, paddingHorizontal: 32 }}>
                <Text style={{ fontFamily: font('display', 700), fontSize: 22, color: CAMERA_TEXT, textAlign: 'center' }}>{pickFor ? 'Scan the new tag' : "Point at the plant's tag"}</Text>
                <Text style={{ fontFamily: font('text', 400), fontSize: 15, lineHeight: 22, color: CAMERA_MUTED, textAlign: 'center' }}>
                  Hold steady about a hand's length away. It scans by itself.
                </Text>
              </View>
            </View>
            <View style={{ alignItems: 'center', paddingBottom: 20, gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable accessibilityRole="button" onPress={pickFromGallery}
                  style={{ height: 46, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, borderRadius: 999, backgroundColor: 'rgba(238, 244, 228, 0.12)' }}>
                  <Icon name="plus" size={18} color={CAMERA_TEXT} />
                  <Text style={{ fontFamily: font('text', 700), fontSize: 14, color: CAMERA_TEXT }}>From gallery</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setTyping(true)}
                  style={{ height: 46, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, borderRadius: 999, backgroundColor: 'rgba(238, 244, 228, 0.12)' }}>
                  <Icon name="keyboard" size={18} color={CAMERA_TEXT} />
                  <Text style={{ fontFamily: font('text', 700), fontSize: 14, color: CAMERA_TEXT }}>Type ID</Text>
                </Pressable>
              </View>
              {role === 'botanist' && !pickFor ? (
                <Pressable accessibilityRole="button" onPress={() => nav.replace('add', { make: true })} hitSlop={8}
                  style={{ height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
                  <Icon name="qr" size={18} color={CAMERA_TEXT} />
                  <Text style={{ fontFamily: font('text', 700), fontSize: 14, color: CAMERA_TEXT, textDecorationLine: 'underline' }}>No tag? Make a new one</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

function Viewfinder() {
  const corner = { position: 'absolute', width: 44, height: 44, borderColor: '#9bcf6a' };
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 250, height: 250 }}>
      <View style={[corner, { left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 20 }]} />
      <View style={[corner, { right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 20 }]} />
      <View style={[corner, { left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 20 }]} />
      <View style={[corner, { right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 20 }]} />
    </View>
  );
}

function PermissionAsk({ onAsk, canAsk }) {
  return (
    <View style={{ width: 280, alignItems: 'center', gap: 14 }}>
      <Icon name="camera" size={40} color={CAMERA_MUTED} />
      <Text style={{ fontFamily: font('text', 400), fontSize: 15, lineHeight: 22, color: CAMERA_MUTED, textAlign: 'center' }}>
        {canAsk ? 'The camera is needed to read plant tags.' : 'Camera access is off. Turn it on in the phone settings, or type the tag ID.'}
      </Text>
      {canAsk ? <View style={{ width: '100%' }}><Button label="Allow camera" onPress={onAsk} /></View> : null}
    </View>
  );
}

function ManualEntry({ value, onChange, onSubmit, onCancel }) {
  const { c } = useTheme();
  return (
    // App.js lifts the screen above the keyboard, so the sheet stays visible while typing.
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Sheet>
        <Txt v="title2">Type the tag ID</Txt>
        <TextInput
          autoFocus
          accessibilityLabel="Tag ID"
          value={value}
          onChangeText={(t) => onChange(t.toUpperCase())}
          placeholder="NIAH-0001"
          placeholderTextColor={c.ink3}
          autoCapitalize="characters"
          onSubmitEditing={onSubmit}
          style={{ height: 52, paddingHorizontal: 14, borderRadius: 10, backgroundColor: c.bg, fontFamily: font('mono', 500), fontSize: 18, color: c.ink }}
        />
        <View style={{ gap: 4 }}>
          <Button label="Look up tag" disabled={!/NIAH-\d{4}/.test(value)} onPress={onSubmit} />
          <Button label="Back to camera" kind="text" height={48} size={15} onPress={onCancel} />
        </View>
      </Sheet>
    </View>
  );
}

function Result({ result, role, nav, onAgain }) {
  const { c } = useTheme();
  const { db } = useStore();

  // Pick mode, and this tag is not free: say why, and scan another.
  if (result.picking) {
    const why = result.kind === 'used' || result.kind === 'unfinished'
      ? 'It is already on a plant.'
      : result.kind === 'retired' ? 'It was taken out of use.'
      : result.kind === 'kept' ? 'It is kept for another botanist.' : 'It is not a Daun Sense tag for Niah National Park.';
    return (
      <Sheet>
        <Mono size={15} color={c.ink2}>{result.id || 'No tag ID'}</Mono>
        <View style={{ gap: 6 }}>
          <Txt v="title2" accessibilityRole="header" style={{ fontSize: 26, lineHeight: 32 }}>This tag can't be used</Txt>
          <Txt v="body" color={c.ink2}>{why} Scan an unused tag for this record.</Txt>
        </View>
        <View style={{ gap: 4 }}>
          <Button label="Scan again" onPress={onAgain} />
          <Button label="Back to the record" kind="text" height={48} size={15} onPress={nav.back} />
        </View>
      </Sheet>
    );
  }

  if (result.kind === 'unfinished') {
    return (
      <Sheet>
        <Mono size={20}>{result.id}</Mono>
        <View style={{ gap: 6 }}>
          <Txt v="title2" style={{ fontSize: 26, lineHeight: 32 }}>Finish this plant record?</Txt>
          <Txt v="body" color={c.ink2}>You saved this plant, but its record did not reach the server. Send it again to put it in the review queue.</Txt>
        </View>
        <View style={{ gap: 4 }}>
          <Button label="Finish and send" onPress={() => nav.replace('add', { qr: result.id })} />
          <Button label="Scan a different tag" kind="text" height={48} size={15} onPress={onAgain} />
        </View>
      </Sheet>
    );
  }

  // Offline, and the tag is in none of the lists on this phone (UI J). The API
  // checks it when the record is sent; a clash then asks for another tag.
  if (result.kind === 'unchecked' && role === 'botanist') {
    return (
      <Sheet>
        <View style={{ gap: 6 }}>
          <Txt v="title2" accessibilityRole="header" style={{ fontSize: 26, lineHeight: 32 }}>Can't check this tag offline</Txt>
          <Txt v="body" color={c.ink2}>
            <Mono size={16} color={c.ink}>{result.id}</Mono> isn't in the tag list saved on this phone. Start a record anyway? It's checked when you're back online.
          </Txt>
        </View>
        <View style={{ gap: 4 }}>
          <Button label="Start record" onPress={() => nav.replace('add', { qr: result.id })} />
          <Button label="Scan again" kind="text" height={48} size={15} onPress={onAgain} />
        </View>
      </Sheet>
    );
  }

  if (result.kind === 'unused') {
    const botanist = role === 'botanist';
    return (
      <Sheet>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: c.successSoft }}>
            <Icon name="check" size={26} color={c.success} strokeWidth={2} />
          </View>
          <View style={{ gap: 2 }}>
            <Mono size={20}>{result.id}</Mono>
            {/* The tag list saved for offline use keeps no batch. */}
            <DotLabel tone="neutral" label={result.tag?.batch_label ? `Unused tag · batch ${result.tag.batch_label}` : 'Unused tag'} />
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Txt v="title2" style={{ fontSize: 26, lineHeight: 32 }}>{botanist ? 'Start a new plant record?' : 'This tag is not on a plant yet'}</Txt>
          <Txt v="body" color={c.ink2}>
            {botanist
              ? "This tag isn't linked to a plant yet. Once you save, it belongs to this plant for good."
              : 'Park botanists have not recorded a plant with this tag yet.'}
          </Txt>
        </View>
        {botanist ? (
          <View style={{ flexDirection: 'row', gap: 12, padding: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: c.bg }}>
            <Icon name="info" size={20} color={c.ink2} />
            <Txt v="small" style={{ flex: 1, fontFamily: font('text', 400) }}>Check the tag is fixed to the plant and its plastic cover is sealed before you continue.</Txt>
          </View>
        ) : null}
        <View style={{ gap: 4 }}>
          {botanist ? <Button label="Start plant record" onPress={() => nav.replace('add', { qr: result.id })} /> : null}
          <Button label="Scan a different tag" kind={botanist ? 'text' : 'primary'} height={botanist ? 48 : 52} size={botanist ? 15 : 16} onPress={onAgain} />
        </View>
      </Sheet>
    );
  }

  if (result.kind === 'used') {
    const p = result.plant;
    const last = db.observations.filter((o) => o.specimen_id === p.id).map((o) => o.observed_at).sort().pop();
    // A plant saved only on this phone has no plant page yet, and one known only
    // from the tag list saved on the phone can't be opened without signal.
    const canOpen = !p.on_phone && !result.cached;
    const summary = (
      <>
        <Thumb uri={p.photos?.[0]?.url} size={64} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontFamily: font('display', 600), fontSize: 18, color: c.ink }}>{p.name}</Text>
          {p.scientific ? <Sci size={14}>{p.scientific}</Sci> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {p.status ? <DotLabel status={p.status} /> : null}
            {last ? <Txt v="caption" color={c.ink2} style={{ fontFamily: font('text', 600) }}>{p.status ? '· ' : ''}last visit {shortDate(last)}</Txt> : null}
          </View>
        </View>
      </>
    );
    const rowStyle = { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, backgroundColor: c.bg };
    return (
      <Sheet>
        <View style={{ gap: 6 }}>
          <Mono size={15} color={c.ink2}>{result.id}</Mono>
          <Txt v="title2" style={{ fontSize: 26, lineHeight: 32 }}>This tag is already on a plant</Txt>
        </View>
        {canOpen ? (
          <Pressable accessibilityRole="button" onPress={() => nav.replace('tag', { qr: result.id })} style={rowStyle}>
            {summary}
            <Icon name="chevR" size={20} color={c.ink3} />
          </Pressable>
        ) : (
          <View style={rowStyle}>{summary}</View>
        )}
        <View style={{ gap: 4 }}>
          <Button label="Record a revisit" icon="plus" onPress={() => nav.replace('revisit', { qr: result.id })} />
          {canOpen ? <Button label="Open plant page" kind="text" height={48} size={15} onPress={() => nav.replace('tag', { qr: result.id })} /> : null}
        </View>
        <Txt v="caption" color={c.ink2} style={{ textAlign: 'center', fontFamily: font('text', 600) }}>Each tag holds one plant. To tag a different plant, use an unused tag.</Txt>
      </Sheet>
    );
  }

  // A tag saved for another botanist's offline use (CTIP-116): not free for this plant.
  if (result.kind === 'kept') {
    return (
      <Sheet>
        <View style={{ gap: 6 }}>
          <Mono size={15} color={c.ink2}>{result.id}</Mono>
          <Txt v="title2" accessibilityRole="header" style={{ fontSize: 26, lineHeight: 32 }}>This tag is kept for another botanist</Txt>
          <Txt v="body" color={c.ink2}>It's saved for their offline use. Use an unused tag for this plant.</Txt>
        </View>
        <Button label="Scan again" onPress={onAgain} />
      </Sheet>
    );
  }

  return (
    <Sheet>
      <View style={{ gap: 6 }}>
        <Mono size={15} color={c.ink2}>{result.id || 'No tag ID'}</Mono>
        <Txt v="title2" style={{ fontSize: 26, lineHeight: 32 }}>{result.kind === 'retired' ? 'This tag was retired' : "We don't know this tag"}</Txt>
        <Txt v="body" color={c.ink2}>
          {result.kind === 'retired'
            ? 'It was taken out of use. Use a new unused tag for this plant.'
            : 'It is not a Daun Sense tag for Niah National Park. Check the code and try again.'}
        </Txt>
      </View>
      <View style={{ gap: 4 }}>
        <Button label="Scan again" onPress={onAgain} />
        {role === 'botanist' ? <Button label="Make a new tag instead" kind="text" height={48} size={15} onPress={() => nav.replace('add', { make: true })} /> : null}
      </View>
    </Sheet>
  );
}
