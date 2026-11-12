// apps/mobile/hooks/useAlertNotifications.js
// Handles phone notifications when receiving IoT sensor alerts or staff notices
// (discussion replies/mentions, review updates, sensor alerts).
// Configures notification channels on Android, requests permissions,
// registers Expo device push tokens for remote delivery when backgrounded,
// schedules local phone notifications on new unread notifications or open alerts,
// and routes tap actions to the right screen.
import { useEffect, useRef } from 'react';
import { Platform, Vibration } from 'react-native';
import Constants from 'expo-constants';
import { registerPushTokenApi } from '../../shared/api.js';

let Notifications = null;
try {
  Notifications = require('expo-notifications');
  if (Notifications && Notifications.setNotificationHandler) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  }
} catch {
  Notifications = null;
}

export function useAlertNotifications(db, me, nav) {
  const seenAlertsRef = useRef(null);
  const seenNotifsRef = useRef(null);

  // Initialize permissions & notification channels, and register push token
  useEffect(() => {
    if (!Notifications) return;

    let sub = null;
    async function setup() {
      try {
        if (Platform.OS === 'android') {
          // Channel for high-priority IoT sensor alerts
          await Notifications.setNotificationChannelAsync('alerts', {
            name: 'IoT Sensor Alerts',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#D9383A',
            sound: 'default',
          });

          // Channel for team discussions, replies, and mentions
          await Notifications.setNotificationChannelAsync('discussions', {
            name: 'Discussions and Activity',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 200, 150, 200],
            lightColor: '#2D6A4F',
            sound: 'default',
          });
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        // Register Expo Remote Push Token if permission granted and user is signed in
        if (finalStatus === 'granted' && me?.id && Notifications.getExpoPushTokenAsync) {
          try {
            const projectId =
              Constants?.expoConfig?.extra?.eas?.projectId ||
              Constants?.easConfig?.projectId ||
              '38d8304d-e84b-4068-a6a1-6a86c1e6657b';

            const tokenData = await Notifications.getExpoPushTokenAsync({
              projectId,
            });

            if (tokenData?.data) {
              console.log('[PUSH] Got push token:', tokenData.data);
              const res = await registerPushTokenApi({
                token: tokenData.data,
                platform: Platform.OS,
                deviceName: Constants.deviceName || `${Platform.OS}-device`,
              });
              console.log('[PUSH] Token register result:', res);
            }
          } catch (tokenErr) {
            console.warn('[PUSH] Push token registration warning:', tokenErr?.message || tokenErr);
          }
        }

        // Handle user tapping the notification
        if (nav && Notifications.addNotificationResponseReceivedListener) {
          sub = Notifications.addNotificationResponseReceivedListener((response) => {
            const data = response?.notification?.request?.content?.data;
            if (!data) return;

            if (data.type === 'discussion' && data.discussionId) {
              nav.go('discussion', { id: data.discussionId });
            } else if (data.alertId) {
              nav.go('alert', { id: data.alertId });
            } else if (data.route) {
              nav.go(data.route, data.params || {});
            }
          });
        }
      } catch (err) {
        console.warn('[PUSH] Setup error:', err?.message || err);
      }
    }

    setup();
    return () => {
      if (sub && sub.remove) sub.remove();
    };
  }, [nav, me?.id]);

  // Monitor incoming alerts in db.alerts
  useEffect(() => {
    if (!db?.alerts) return;

    if (!seenAlertsRef.current) {
      // Record initial alerts so we don't spam on initial app startup
      seenAlertsRef.current = new Set(db.alerts.map((a) => a.id));
      return;
    }

    for (const alert of db.alerts) {
      if (!seenAlertsRef.current.has(alert.id)) {
        seenAlertsRef.current.add(alert.id);

        if (alert.status === 'open') {
          const node = (db.nodes || []).find((n) => n.id === alert.node_id);
          const nodeName = node?.name || 'Protected Node';
          const severity = (alert.severity || 'high').toUpperCase();

          try {
            Vibration.vibrate([0, 300, 200, 300]);
          } catch {}

          if (Notifications && Notifications.scheduleNotificationAsync) {
            Notifications.scheduleNotificationAsync({
              content: {
                title: `Alert: ${alert.type || 'Sensor'} - ${nodeName}`,
                body: `[${severity}] reading breach detected at ${nodeName}. Tap to inspect.`,
                data: { alertId: alert.id, type: 'alert' },
                sound: 'default',
                channelId: 'alerts',
              },
              trigger: null,
            }).catch(() => {});
          }
        }
      }
    }
  }, [db?.alerts, db?.nodes]);

  // Monitor all incoming notifications for me in db.notifications (discussions, mentions, reviews, etc.)
  useEffect(() => {
    if (!db?.notifications || !me?.id) return;

    const myNotifs = db.notifications.filter((n) => n.user_id === me.id);
    if (!seenNotifsRef.current) {
      seenNotifsRef.current = new Set(myNotifs.map((n) => n.id));
      return;
    }

    for (const n of myNotifs) {
      if (!seenNotifsRef.current.has(n.id)) {
        seenNotifsRef.current.add(n.id);

        if (n.is_read) continue;

        try {
          Vibration.vibrate([0, 200, 150, 200]);
        } catch {}

        if (Notifications && Notifications.scheduleNotificationAsync) {
          const isDiscussion =
            n.related_table === 'discussions' ||
            n.type === 'discussion_shared' ||
            n.type === 'discussion_reply' ||
            n.type === 'discussion_mention' ||
            n.type === 'discussion_post' ||
            n.type === 'comment_reply';

          const isAlert = n.related_table === 'alerts' || (n.type && n.type.includes('alert'));

          let notifData = { id: n.id };
          let channelId = 'discussions';
          let title = n.title || 'Notification';
          let body = n.body || n.message || 'You have a new update.';

          if (isDiscussion) {
            notifData = { type: 'discussion', discussionId: n.related_id };
            channelId = 'discussions';
            if (n.type === 'discussion_mention') {
              title = n.title || 'Mentioned in discussion';
            } else if (n.type === 'discussion_shared') {
              title = n.title || 'New discussion shared with you';
            } else {
              title = n.title || 'Discussion update';
            }
          } else if (isAlert) {
            notifData = { alertId: n.related_id, type: 'alert' };
            channelId = 'alerts';
            title = `Alert: ${n.title || 'IoT Sensor Alert'}`;
          } else if (n.related_table === 'observations') {
            notifData = { route: 'record', params: { id: n.related_id } };
            title = n.title || 'Record update';
          }

          Notifications.scheduleNotificationAsync({
            content: {
              title,
              body,
              data: notifData,
              sound: 'default',
              channelId,
            },
            trigger: null,
          }).catch(() => {});
        }
      }
    }
  }, [db?.notifications, me?.id]);
}

