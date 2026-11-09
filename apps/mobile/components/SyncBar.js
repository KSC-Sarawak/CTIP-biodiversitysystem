// apps/mobile/components/SyncBar.js
// The line above "On this phone" in My records (CTIP-68, UI C): how many records
// wait and when the phone last sent one, with "Sync now". Design:
// docs/architecture/offline-sync.md, section 6. The words come from
// apps/shared/offline/syncStatus.js, where the node tests check them.
import React from 'react';
import { View } from 'react-native';

import { useStore } from '../../shared/store.js';
import { syncBarText, syncToast } from '../../shared/offline/syncStatus.js';
import { useTheme } from './Theme.js';
import { Txt, Button } from './Bits.js';
import { dateTime } from './format.js';

export default function SyncBar() {
  const { outboxItems, syncState, syncNow, apiStatus, notify } = useStore();
  const { c } = useTheme();
  const running = syncState.running;
  const text = syncBarText({ outboxItems, running, lastSyncedAt: syncState.lastSyncedAt }, dateTime);

  // A tap always tries, even when the store thinks it is offline: the signal may
  // be back before the next check. The toast says "offline" only when the store
  // does (syncToast); a run stopped by a server error says so in other words.
  const syncTap = async () => {
    const summary = await syncNow({ manual: true });
    const message = syncToast(summary, { offline: apiStatus === 'offline' });
    if (message) notify(message);
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Txt v="small" color={c.ink2} style={{ flex: 1 }} accessibilityLiveRegion="polite">{text}</Txt>
      <Button
        label={running ? 'Sending…' : 'Sync now'}
        kind="secondary"
        icon="refresh"
        height={48}
        size={14}
        disabled={running}
        onPress={syncTap}
        accessibilityLabel={running ? 'Sending records saved on this phone' : 'Sync now: send the records saved on this phone'}
      />
    </View>
  );
}
