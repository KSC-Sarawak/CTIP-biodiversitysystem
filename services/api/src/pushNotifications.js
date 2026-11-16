// services/api/src/pushNotifications.js
// Dispatches remote push notifications via the Expo Push API (https://exp.host/--/api/v2/push/send)
// Sends notifications to target user IDs in the background without blocking request responses.
import { supabaseService } from './supabase.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Validates whether a token string is a valid Expo push token format
 * e.g., ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx] or ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]
 */
export function isExpoPushToken(token) {
  if (typeof token !== 'string') return false;
  const t = token.trim();
  return (
    /^(ExponentPushToken|ExpoPushToken)\[.+\]$/.test(t) ||
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(t)
  );
}

/**
 * Dispatch remote push notifications to one or more user IDs.
 *
 * @param {Object} options
 * @param {Object} [options.db] - Not used any more: tokens are read with the secret key
 * @param {string|string[]} options.userIds - Recipient user UUID(s)
 * @param {string} options.title - Notification title (no emojis)
 * @param {string} options.body - Notification message body
 * @param {Object} [options.data] - Extra payload passed to app on tap
 * @param {string} [options.channelId] - Android notification channel (default 'discussions')
 * @param {string} [options.sound] - Notification sound (default 'default')
 */
export async function sendPushToUsers({ userIds, title, body, data = {}, channelId = 'discussions', sound = 'default' }) {
  if (!userIds) return;
  const targetIds = Array.isArray(userIds) ? [...new Set(userIds.filter(Boolean))] : [userIds];
  if (!targetIds.length) return;

  try {
    // Other people's push tokens are read only with the server's secret key:
    // a staff token cannot read them (anyone holding a token could send that
    // phone fake notifications). Without the secret key (local runs) no push is sent.
    const db = supabaseService();
    if (!db) return;
    const rpcRes = await db.rpc('get_user_push_tokens', { p_user_ids: targetIds });

    const rows = rpcRes.data;
    if (rpcRes.error || !rows?.length) return;

    const messages = [];
    for (const row of rows) {
      if (isExpoPushToken(row.token)) {
        messages.push({
          to: row.token,
          sound,
          title: title || 'Biodiversity Field App',
          body: body || '',
          data: { ...data, userId: row.user_id },
          channelId,
          priority: 'high',
        });
      }
    }

    if (!messages.length) return;

    await sendExpoMessages(messages);
  } catch (err) {
    console.warn('sendPushToUsers failure:', err?.message || err);
  }
}

// Send ready-made Expo messages, 100 per request (Expo's limit). Never throws.
export async function sendExpoMessages(messages) {
  const chunkSize = 100;
  for (let i = 0; i < messages.length; i += chunkSize) {
    const chunk = messages.slice(i, i + chunkSize);
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chunk),
    }).catch((err) => {
      console.warn('Expo push send error:', err?.message || err);
    });
  }
}
