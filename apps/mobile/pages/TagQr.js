// apps/mobile/pages/TagQr.js
// A tag's QR code on the phone (CTIP-27), for when no pre-printed tag is to hand.
// The code holds a link to the plant's page (tagUrl), never the plant's details, so
// scanning it in the app opens the record and a phone camera opens the website.
// "Share or save image" turns the card into a PNG for printing.
// Add plant and QR tags show TagQrView in place of their own content (not as a new
// screen), so the tag just made or picked stays with the screen that holds it.
import React, { useRef, useState } from 'react';
import { View, Alert } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

import { tagUrl } from '../../shared/selectors.js';
import { SITE } from '../../shared/site.js';
import { palettes } from '../../shared/tokens.js';
import { useStore } from '../../shared/store.js';
import { can } from '../../shared/permissions.js';
import { RESERVED_LABEL } from '../../shared/offline/tags.js';
import { useTheme, statusText } from '../components/Theme.js';
import { useBackHandler } from '../navigation/focus.js';
import { Screen, Header, IconButton, TitleBlock, Mono, Txt, Button, Notice, Empty, DotLabel } from '../components/Bits.js';

// A QR code must stay dark on light to scan reliably, so the card always uses the
// light theme's colours, even in dark mode.
const PRINT = { paper: palettes.light.surface, ink: palettes.light.ink };

export default function TagQr({ nav, params = {} }) {
  return <TagQrView qr={params.qr} onBack={nav.back} />;
}

export function TagQrView({ qr, onBack }) {
  const { c } = useTheme();
  const { db, role, retireTag, deleteTag, notify } = useStore();
  const card = useRef(null);
  const [sharing, setSharing] = useState(false);

  const tag = (db?.tags || []).find((t) => t.qr_id === qr);
  const plant = (db?.plants || []).find((p) => p.qr_id === qr);
  const status = tag?.status || (plant ? 'assigned' : 'unused');
  const isKept = tag?.status === 'unused' && tag?.batch_label === RESERVED_LABEL;

  // Android's back button closes this view first, wherever it is shown.
  useBackHandler(() => {
    onBack();
    return true;
  });

  const back = <Header left={<IconButton name="chevL" label="Back" onPress={onBack} />} />;
  if (!qr) {
    return <Screen header={back}><Empty icon="qr">No tag selected.</Empty></Screen>;
  }

  const handleRetire = () => {
    const keptWarning = isKept ? "This tag is kept on a botanist's phone for making a tag offline.\n\n" : '';
    Alert.alert(
      'Retire QR tag',
      `${keptWarning}Retire ${qr}? A retired tag can no longer be put on a plant or printed, and this cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Retire',
          style: 'destructive',
          onPress: async () => {
            await retireTag(qr);
            notify(`Tag ${qr} retired`);
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    const keptWarning = isKept ? "This tag is kept on a botanist's phone for making a tag offline.\n\n" : '';
    Alert.alert(
      'Delete unused tag',
      `${keptWarning}Delete ${qr}? This permanently removes this unused tag from the system.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const ok = await deleteTag(qr);
            if (ok && onBack) onBack();
          },
        },
      ]
    );
  };

  const share = async () => {
    setSharing(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'Sharing is not available on this device.');
        return;
      }
      const uri = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `QR tag ${qr}` });
    } catch (err) {
      Alert.alert('Could not share the QR code', err?.message || 'Please try again.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <Screen header={back} top={0} gap={20}>
      <TitleBlock
        title="QR tag"
        sub={qr}
        right={<DotLabel status={status} label={statusText(status)} />}
      />
      {tag?.batch_label ? (
        <Txt v="caption" color={c.ink2} style={{ textAlign: 'center', marginTop: -12 }}>
          {isKept ? 'Kept on phone for offline tagging' : `Batch: ${tag.batch_label}`}
        </Txt>
      ) : null}
      {/* collapsable={false} keeps this View on Android, so captureRef can find it. */}
      <View ref={card} collapsable={false}
        style={{ alignSelf: 'center', alignItems: 'center', gap: 12, padding: 20, borderRadius: 16, backgroundColor: PRINT.paper }}>
        <QRCode value={tagUrl(qr)} size={240} ecl="M" quietZone={16} color={PRINT.ink} backgroundColor={PRINT.paper} />
        <Mono size={22} color={PRINT.ink}>{qr}</Mono>
        <Txt v="caption" color={PRINT.ink}>{SITE}</Txt>
      </View>
      <View style={{ gap: 10 }}>
        <Button label={sharing ? 'Preparing image…' : 'Share or save image'} icon="share" disabled={sharing} onPress={share} />
        {can(role, 'tags') && (
          <View style={{ gap: 10 }}>
            {status !== 'retired' && (
              <Button
                label="Retire tag"
                icon="x"
                kind="secondary"
                onPress={handleRetire}
              />
            )}
            {status === 'unused' && (
              <Button
                label="Delete tag"
                icon="trash"
                kind="danger"
                onPress={handleDelete}
              />
            )}
          </View>
        )}
      </View>
      <Notice tone="info" title="Print it and fix it to the plant"
        body="Put the printed code in a plastic cover. Scanning it opens this record in the app, and the public plant page for visitors." />
      <Txt v="caption" color={c.ink3} style={{ textAlign: 'center' }}>{tagUrl(qr)}</Txt>
    </Screen>
  );
}
