// services/api/src/alertWatch.js
// Automated IoT alerts, the API's part (CTIP-76, CTIP-77).
//
// The database raises the alerts: a reading outside the stable range, a node
// that moved (telemetry triggers), or a node gone silent
// (raise_silent_node_alerts). Its trigger also writes each person's in-app
// notification, following the alert routing an admin set (CTIP-48). Here the
// API sends the same title and body as a phone push, and runs the silent check.
// Texts come from the database and never hold a coordinate.
import { supabaseService } from './supabase.js';
import { isExpoPushToken, sendExpoMessages } from './pushNotifications.js';

export const SILENT_CHECK_EVERY_MS = 60 * 1000;
export const DEFAULT_SILENT_MINUTES = 15;

// How long a node may stay quiet before it counts as silent: NODE_SILENT_MINUTES
// (1 to 1440), else 15.
export function silentMinutes(env = process.env) {
  const n = Number(env.NODE_SILENT_MINUTES);
  return Number.isInteger(n) && n >= 1 && n <= 1440 ? n : DEFAULT_SILENT_MINUTES;
}

// A phone push for each alert just raised, to the people the database told in
// the app (so the routing is followed), with that notification's words.
// Returns how many messages went to Expo. Never throws.
export async function pushAlerts(db, alertIds) {
  const ids = [...new Set((alertIds ?? []).filter(Boolean).map(String))];
  if (!db || !ids.length) return 0;
  try {
    const notes = await db.from('notifications').select('user_id, title, body, related_id')
      .eq('type', 'alert_created').eq('related_table', 'alerts').in('related_id', ids);
    if (notes.error || !notes.data?.length) return 0;
    const people = [...new Set(notes.data.map((n) => n.user_id))];
    const tokens = await db.from('user_push_tokens').select('token, user_id').in('user_id', people);
    if (tokens.error || !tokens.data?.length) return 0;

    const messages = [];
    for (const n of notes.data) {
      for (const t of tokens.data) {
        if (t.user_id !== n.user_id || !isExpoPushToken(t.token)) continue;
        messages.push({
          to: t.token,
          title: n.title || 'New sensor alert',
          body: n.body || '',
          data: { type: 'alert', alertId: n.related_id },
          channelId: 'alerts',
          sound: 'default',
          priority: 'high',
        });
      }
    }
    if (messages.length) await sendExpoMessages(messages);
    return messages.length;
  } catch (err) {
    console.warn('alert push failed:', err?.message || err);
    return 0;
  }
}

// Alerts the telemetry triggers raised for this node since `since` (an ISO time).
export async function alertsRaisedSince(db, nodeId, since) {
  try {
    const { data, error } = await db.from('alerts').select('id')
      .eq('node_id', nodeId).gte('created_at', since);
    if (error) return [];
    return (data ?? []).map((a) => a.id);
  } catch {
    return [];
  }
}

// The silent check, at most once a minute per API (pg_cron, when switched on,
// also runs it every 5 minutes). Returns the new alerts' ids. Never throws.
let lastCheck = 0;
export async function checkSilentNodesSoon({ db = supabaseService(), now = Date.now() } = {}) {
  if (!db || now - lastCheck < SILENT_CHECK_EVERY_MS) return [];
  lastCheck = now;
  try {
    const { data, error } = await db.rpc('raise_silent_node_alerts', { p_minutes: silentMinutes() });
    if (error) {
      console.warn('raise_silent_node_alerts:', error.message);
      return [];
    }
    const ids = (data ?? []).map((r) => r.alert_id).filter(Boolean);
    if (ids.length) {
      console.log(`silent check: ${ids.length} node(s) went quiet`);
      await pushAlerts(db, ids);
    }
    return ids;
  } catch (err) {
    console.warn('silent check failed:', err?.message || err);
    return [];
  }
}
export const resetSilentClock = () => { lastCheck = 0; };

// While the API runs: check now, then every minute. server.js starts it; the
// tests do not. Returns a stop function.
export function startSilentWatch() {
  if (!supabaseService()) return () => {};
  const run = () => { checkSilentNodesSoon(); };
  run();
  const timer = setInterval(run, SILENT_CHECK_EVERY_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
