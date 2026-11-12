// services/api/src/pushNotifications.js
// Dispatches remote push notifications via the Expo Push API (https://exp.host/--/api/v2/push/send)
// Sends notifications to target user IDs in the background without blocking request responses.
import { supabaseAs, supabaseFresh } from './supabase.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Validates whether a token string is a valid Expo push token format
 * e.g., ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx] or ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]
 */
export function isExpoPushToken(token) {
  return typeof token === 'string' && /^(ExponentPushToken|ExpoPushToken)\[[a-zA-Z0-9\-_]+\]$/.test(token.trim());
}

/**
 * Dispatch remote push notifications to one or more user IDs.
 *
 * @param {Object} options
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
    // Query tokens using SECURITY DEFINER RPC so we can reach target users' registered tokens
    // without hitting RLS cross-user select restrictions or anon table grant limits.
    const db = supabaseFresh();
    const rpcRes = await db.rpc('get_user_push_tokens', { p_user_ids: targetIds });

    let rows = rpcRes.data;
    if (rpcRes.error || !rows) {
      // Fallback direct query in case RPC has not been applied yet
      const direct = await db
        .from('user_push_tokens')
        .select('token, user_id')
        .in('user_id', targetIds);
      rows = direct.data;
    }

    if (!rows?.length) return;

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

    // Send chunks to Expo Push API in batches of 100
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
  } catch (err) {
    console.warn('sendPushToUsers failure:', err?.message || err);
  }
}
