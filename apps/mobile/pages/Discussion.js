// apps/mobile/pages/Discussion.js
// Discussion board: team threads with titles, public/private visibility, audience targeting,
// @mentions, search, mailbox filters, and legacy observation comments.
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, ScrollView, Alert, KeyboardAvoidingView, Platform, Switch } from 'react-native';

import { useStore } from '../../shared/store.js';
import { plantView, nameOf } from '../../shared/selectors.js';
import { ROLE_LABEL } from '../../shared/permissions.js';
import { useTheme, font } from '../components/Theme.js';
import Icon from '../components/Icon.js';
import {
  Screen, Bar, Header, IconButton, TitleBlock, SearchField, Pills, Row, Thumb, Mono, Txt, DotLabel, Avatar,
  Empty, EmptyState, Button, Chip, Field, Segmented,
} from '../components/Bits.js';
import { dateTime, shortDate } from '../components/format.js';
import { usePolling } from '../hooks/usePolling.js';

const ROLE_GROUPS = [
  { role: 'botanist', label: 'All botanists' },
  { role: 'officer', label: 'All conservation officers' },
  { role: 'admin', label: 'All administrators' },
];

export default function Discussion({ nav, params = {} }) {
  if (params.id) {
    return <ThreadDetail nav={nav} id={params.id} />;
  }
  return <DiscussionHome nav={nav} />;
}

function DiscussionHome({ nav }) {
  usePolling(5000);
  const { db, me, role } = useStore();
  const { c } = useTheme();

  const [box, setBox] = useState('all');
  const [q, setQ] = useState('');
  const [composing, setComposing] = useState(false);

  // Profiles directory for audience / names
  const directory = useMemo(() => {
    const list = db.directory?.length
      ? db.directory
      : (db.profiles || []).filter((p) => p.is_active !== false);
    return list.map((p) => ({
      id: p.id,
      name: p.full_name || p.email,
      role: p.role,
    }));
  }, [db.directory, db.profiles]);

  // Modern discussion threads
  const threads = useMemo(() => {
    return (db.discussions || []).map((d) => {
      const posts = (db.discussionPosts || []).filter((p) => p.discussion_id === d.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      const audience = (db.discussionAudience || []).filter((a) => a.discussion_id === d.id);
      return { ...d, posts, audience, count: posts.length };
    });
  }, [db.discussions, db.discussionPosts, db.discussionAudience]);

  // Legacy observation record comments
  const recordComments = useMemo(() => {
    const ids = [...new Set((db.comments || []).map((m) => m.observation_id))];
    return ids
      .map((id) => {
        const o = (db.observations || []).find((x) => x.id === id);
        const plant = o ? plantView(db, (db.plants || []).find((p) => p.id === o.specimen_id)) : null;
        const msgs = (db.comments || []).filter((m) => m.observation_id === id)
          .sort((a, b) => a.created_at.localeCompare(b.created_at));
        return plant && msgs.length ? { id, o, plant, last: msgs[msgs.length - 1], count: msgs.length, msgs } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
  }, [db.comments, db.observations, db.plants]);

  const needle = q.trim().toLowerCase();

  // Filter threads by mailbox
  const filteredThreads = threads.filter((t) => {
    if (box === 'records') return false;
    if (box === 'inbox') {
      const sentToMe = t.owner_id !== me?.id && t.audience.some((a) => a.user_id === me?.id || a.role === role);
      const mentionsMe = t.posts.some((p) => (p.mentions || []).includes(me?.id));
      if (!sentToMe && !mentionsMe) return false;
    }
    if (box === 'mine' && t.owner_id !== me?.id) return false;
    if (box === 'public' && t.visibility !== 'public') return false;

    if (!needle) return true;
    const bodyText = t.posts.map((p) => p.body).join(' ');
    return `${t.title} ${bodyText}`.toLowerCase().includes(needle);
  }).sort((a, b) => String(b.last_post_at || b.created_at || '').localeCompare(String(a.last_post_at || a.created_at || '')));

  // Filter record comments
  const filteredRecords = recordComments.filter((t) => {
    if (box !== 'records' && box !== 'all') return false;
    if (!needle) return true;
    const bodyText = t.msgs.map((m) => m.body).join(' ');
    return `${t.plant.name} ${t.plant.qr_id} ${bodyText}`.toLowerCase().includes(needle);
  });

  const mailboxes = [
    { key: 'all', label: `All (${threads.length + recordComments.length})` },
    { key: 'inbox', label: `Sent to me (${threads.filter((t) => (t.owner_id !== me?.id && t.audience.some((a) => a.user_id === me?.id || a.role === role)) || t.posts.some((p) => (p.mentions || []).includes(me?.id))).length})` },
    { key: 'mine', label: `Started by me (${threads.filter((t) => t.owner_id === me?.id).length})` },
    { key: 'public', label: `Public (${threads.filter((t) => t.visibility === 'public').length})` },
    { key: 'records', label: `Record comments (${recordComments.length})` },
  ];

  return (
    <Screen
      header={nav.canGoBack ? <Header left={<IconButton name="chevL" label="Back" onPress={nav.back} />} /> : null}
      top={nav.canGoBack ? 0 : 16}
      gap={14}
    >
      <TitleBlock
        title="Discussion"
        right={
          <Button
            label="New discussion"
            icon="plus"
            height={38}
            size={13}
            onPress={() => setComposing(true)}
          />
        }
      />

      <Pills value={box} onChange={setBox} items={mailboxes} />
      <SearchField value={q} onChangeText={setQ} placeholder="Search discussions or messages" />

      {box !== 'records' && (
        <View style={{ gap: 4 }}>
          {filteredThreads.map((t, i) => {
            const author = nameOf(db, t.owner_id);
            const isPublic = t.visibility === 'public';
            return (
              <Row
                key={t.id}
                serif={false}
                left={
                  <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: isPublic ? c.accentSoft : c.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={isPublic ? 'globe' : 'lock'} size={20} color={isPublic ? c.accent : c.ink2} />
                  </View>
                }
                title={t.title}
                sub={
                  <View style={{ gap: 2 }}>
                    <Txt v="small" color={c.ink2} style={{ fontSize: 13 }}>
                      {author} · {t.count} post{t.count === 1 ? '' : 's'} · {shortDate(t.last_post_at || t.created_at)}
                    </Txt>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                      <Chip value={isPublic ? 'Public' : 'Private'} tone={isPublic ? 'success' : 'neutral'} />
                      {t.posts.some((p) => (p.mentions || []).includes(me?.id)) && <Chip value="@Mentioned" tone="info" />}
                    </View>
                  </View>
                }
                onPress={() => nav.go('discussion', { id: t.id })}
                last={i === filteredThreads.length - 1 && box !== 'all'}
              />
            );
          })}
          {filteredThreads.length === 0 && box !== 'all' && (
            <EmptyState count={0} icon="chat" filtered={!!needle}>
              {needle ? 'No discussions match your search.' : 'No discussions in this view.'}
            </EmptyState>
          )}
        </View>
      )}

      {(box === 'records' || (box === 'all' && filteredRecords.length > 0)) && (
        <View style={{ gap: 6, marginTop: box === 'all' ? 10 : 0 }}>
          {box === 'all' && (
            <Txt v="label" color={c.ink2} style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Record comments
            </Txt>
          )}
          {filteredRecords.map((t, i) => (
            <Row
              key={t.id}
              serif={false}
              left={<Thumb uri={t.plant.photos?.[0]?.url} />}
              title={t.plant.name}
              sub={
                <>
                  <Mono size={13}>{t.plant.qr_id}</Mono>
                  <Txt v="small" color={c.ink2} style={{ fontSize: 13 }}>
                    · {t.count} comment{t.count === 1 ? '' : 's'} · {shortDate(t.last.created_at)}
                  </Txt>
                </>
              }
              onPress={() => nav.go('discussion', { id: t.id })}
              last={i === filteredRecords.length - 1}
            />
          ))}
          {filteredRecords.length === 0 && box === 'records' && (
            <EmptyState count={0} icon="chat" filtered={!!needle}>
              {needle ? 'No record comments match.' : 'No record comments yet.'}
            </EmptyState>
          )}
        </View>
      )}

      {box === 'all' && filteredThreads.length === 0 && filteredRecords.length === 0 && (
        <EmptyState count={0} icon="chat" filtered={!!needle}>
          {needle ? 'No discussions or comments match your search.' : 'No discussions yet. Tap "New discussion" above to start one.'}
        </EmptyState>
      )}

      {/* New Discussion Composer Modal */}
      {composing && (
        <NewDiscussionModal
          directory={directory}
          onClose={() => setComposing(false)}
          onCreated={(newId) => {
            setComposing(false);
            if (newId) nav.go('discussion', { id: newId });
          }}
        />
      )}
    </Screen>
  );
}

function NewDiscussionModal({ directory, onClose, onCreated }) {
  const { startDiscussion, notify } = useStore();
  const { c } = useTheme();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState('public'); // public | private
  const [selectedRoles, setSelectedRoles] = useState(new Set(['botanist', 'officer']));
  const [selectedUsers, setSelectedUsers] = useState(new Set());
  const [busy, setBusy] = useState(false);

  const toggleRole = (r) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  };

  const toggleUser = (id) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStart = async () => {
    if (!title.trim()) return Alert.alert('Title required', 'Please enter a title for the discussion.');
    if (!body.trim()) return Alert.alert('Message required', 'Please enter your opening message.');

    setBusy(true);
    try {
      const mentions = [];
      for (const u of directory) {
        if (body.includes(`@${u.name}`)) mentions.push(u.id);
      }

      const thread = {
        title: title.trim(),
        body: body.trim(),
        visibility,
        share_roles: visibility === 'private' ? [...selectedRoles] : [],
        share_users: visibility === 'private' ? [...selectedUsers] : [],
        mentions,
      };

      const id = await startDiscussion(thread);
      if (id) {
        onCreated(id);
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not start discussion');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal animationType="slide" visible onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.surface }}>
        <Header
          left={<IconButton name="chevL" label="Back" onPress={onClose} />}
          title="New discussion"
          right={<IconButton name="x" label="Close" onPress={onClose} />}
        />
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
          <TitleBlock title="Start a discussion" sub="Collaborate with team members" />

          <Field label="Discussion title" value={title} onChangeText={setTitle} placeholder="e.g. Unusual spathe shape on NIAH-0032" />

          <View style={{ gap: 8 }}>
            <Txt v="label" style={{ fontSize: 15 }}>Visibility</Txt>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[
                { key: 'public', label: 'Public', sub: 'All staff can view & reply', icon: 'globe' },
                { key: 'private', label: 'Private', sub: 'Restricted to selected audience', icon: 'lock' },
              ].map((opt) => {
                const active = visibility === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => setVisibility(opt.key)}
                    style={({ pressed }) => ({
                      flex: 1,
                      padding: 12,
                      borderRadius: 12,
                      backgroundColor: active ? (c.accentSoft || c.surface) : c.surface,
                      borderWidth: 2,
                      borderColor: active ? c.accent : c.line,
                      gap: 6,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Icon name={opt.icon} size={20} color={active ? c.accent : c.ink2} />
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          borderWidth: 2,
                          borderColor: active ? c.accent : c.ink3,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: active ? c.accent : 'transparent',
                        }}
                      >
                        {active ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.onAccent }} /> : null}
                      </View>
                    </View>
                    <Text style={{ fontFamily: font('text', 700), fontSize: 15, color: active ? c.accent : c.ink }}>{opt.label}</Text>
                    <Text style={{ fontFamily: font('text', 400), fontSize: 12, color: c.ink2 }}>{opt.sub}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {visibility === 'private' && (
            <View style={{ padding: 14, borderRadius: 14, backgroundColor: c.bg, borderWidth: 1, borderColor: c.line, gap: 14 }}>
              <Txt v="label" style={{ fontSize: 15 }}>Who can read this thread?</Txt>

              <Txt v="caption" color={c.ink2} style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' }}>
                Share with roles:
              </Txt>
              <View style={{ gap: 8 }}>
                {ROLE_GROUPS.map((g) => {
                  const on = selectedRoles.has(g.role);
                  return (
                    <Pressable
                      key={g.role}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: on }}
                      onPress={() => toggleRole(g.role)}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 10,
                        backgroundColor: on ? (c.accentSoft || c.surface) : c.surface,
                        borderWidth: 1.5,
                        borderColor: on ? c.accent : c.line,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontFamily: font('text', 700), fontSize: 15, color: on ? c.accent : c.ink }}>{g.label}</Text>
                        <Txt v="caption" color={c.ink2}>All members with the {g.role} role</Txt>
                      </View>
                      <Switch
                        value={on}
                        onValueChange={() => toggleRole(g.role)}
                        trackColor={{ false: c.line, true: c.accent }}
                        thumbColor={Platform.OS === 'android' ? (on ? c.onAccent : '#f4f3f4') : undefined}
                      />
                    </Pressable>
                  );
                })}
              </View>

              <Txt v="caption" color={c.ink2} style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700', marginTop: 4 }}>
                Share with individual members:
              </Txt>
              <View style={{ maxHeight: 180 }}>
                <ScrollView nestedScrollEnabled contentContainerStyle={{ gap: 6 }}>
                  {directory.map((u) => {
                    const on = selectedUsers.has(u.id);
                    return (
                      <Pressable
                        key={u.id}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: on }}
                        onPress={() => toggleUser(u.id)}
                        style={({ pressed }) => ({
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 10,
                          backgroundColor: on ? (c.accentSoft || c.surface) : c.surface,
                          borderWidth: 1.5,
                          borderColor: on ? c.accent : c.line,
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                          <Avatar name={u.name} size={30} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: font('text', 700), fontSize: 14, color: on ? c.accent : c.ink }}>{u.name}</Text>
                            <Txt v="caption" color={c.ink2}>{ROLE_LABEL[u.role] || u.role}</Txt>
                          </View>
                        </View>
                        <Switch
                          value={on}
                          onValueChange={() => toggleUser(u.id)}
                          trackColor={{ false: c.line, true: c.accent }}
                          thumbColor={Platform.OS === 'android' ? (on ? c.onAccent : '#f4f3f4') : undefined}
                        />
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          )}

          <View style={{ gap: 6 }}>
            <Txt v="label" style={{ fontSize: 15 }}>Opening message</Txt>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Type your message. Tip: type @Name to mention someone..."
              placeholderTextColor={c.ink3}
              multiline
              style={{
                minHeight: 120,
                padding: 14,
                borderRadius: 10,
                backgroundColor: c.surface,
                borderWidth: 1,
                borderColor: c.line,
                color: c.ink,
                fontFamily: font('text', 400),
                fontSize: 15,
                lineHeight: 22,
                textAlignVertical: 'top',
              }}
            />
          </View>

          <Button label={busy ? 'Starting…' : 'Start discussion'} height={48} disabled={busy || !title.trim() || !body.trim()} onPress={handleStart} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ThreadDetail({ nav, id }) {
  usePolling(5000);
  const { db, me, replyToDiscussion, addComment, notify } = useStore();
  const { c } = useTheme();

  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [showMentionPicker, setShowMentionPicker] = useState(false);

  // Check if this id matches a modern discussion thread
  const thread = (db.discussions || []).find((t) => t.id === id);

  // If not, check if it matches an observation for legacy comments
  const obs = !thread ? (db.observations || []).find((x) => x.id === id) : null;
  const plant = obs ? plantView(db, (db.plants || []).find((p) => p.id === obs.specimen_id)) : null;

  const directory = (db.directory?.length ? db.directory : db.profiles || []).map((p) => ({
    id: p.id,
    name: p.full_name || p.email,
    role: p.role,
  }));

  if (!thread && !plant) {
    return (
      <Screen header={<Bar title="Discussion" onBack={nav.back} />}>
        <Empty icon="chat">This discussion could not be found.</Empty>
      </Screen>
    );
  }

  // Handle modern thread posts
  const posts = thread
    ? (db.discussionPosts || []).filter((p) => p.discussion_id === thread.id).sort((a, b) => a.created_at.localeCompare(b.created_at))
    : [];

  // Handle legacy comments
  const legacyMsgs = obs
    ? (db.comments || []).filter((m) => m.observation_id === obs.id).sort((a, b) => a.created_at.localeCompare(b.created_at))
    : [];

  const handleSend = async () => {
    if (!replyText.trim() || sending) return;
    setSending(true);
    try {
      if (thread) {
        const mentions = [];
        for (const u of directory) {
          if (replyText.includes(`@${u.name}`)) mentions.push(u.id);
        }
        const ok = await replyToDiscussion(thread.id, replyText.trim(), mentions);
        if (ok) setReplyText('');
      } else if (obs) {
        const ok = await addComment(obs.id, replyText.trim());
        if (ok) setReplyText('');
      }
    } finally {
      setSending(false);
    }
  };

  const insertMention = (name) => {
    setReplyText((prev) => `${prev}@${name} `);
    setShowMentionPicker(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <Screen
        stickToEnd
        header={
          <Bar
            title={thread ? thread.title : plant.name}
            sub={thread ? `${posts.length} messages · ${thread.visibility}` : `${plant.qr_id} · Observation`}
            onBack={nav.back}
          />
        }
        gap={16}
      >
        {thread ? (
          <View style={{ padding: 14, borderRadius: 14, backgroundColor: c.bg, gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Txt v="caption" color={c.ink2}>Started by {nameOf(db, thread.owner_id)}</Txt>
              <Chip value={thread.visibility === 'public' ? 'Public' : 'Private'} tone={thread.visibility === 'public' ? 'success' : 'neutral'} />
            </View>
            <Txt v="title3">{thread.title}</Txt>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => nav.go('tag', { qr: plant.qr_id })}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 12,
              borderRadius: 14,
              backgroundColor: c.bg,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Thumb uri={plant.photos?.[0]?.url} size={48} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: font('display', 600), fontSize: 16, color: c.ink }}>{plant.name}</Text>
              <Txt v="caption" color={c.ink2} numberOfLines={2}>{obs.morphology || 'Plant observation'}</Txt>
            </View>
            <DotLabel status={obs.status} />
          </Pressable>
        )}

        {/* Post stream */}
        {(thread ? posts : legacyMsgs).map((m) => {
          const authorId = m.author_id;
          const authorName = nameOf(db, authorId);
          const authorRole = ROLE_LABEL[db.profiles?.find((p) => p.id === authorId)?.role] || '';
          const mine = authorId === me?.id;
          return (
            <View key={m.id} style={{ flexDirection: 'row', gap: 10 }}>
              <Avatar name={authorName} size={34} muted={!mine} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontFamily: font('text', 700), fontSize: 13, color: c.ink }}>
                  {mine ? 'You' : authorName}{' '}
                  <Text style={{ fontFamily: font('text', 400), color: c.ink2 }}>
                    · {authorRole} · {dateTime(m.created_at)}
                  </Text>
                </Text>
                <View
                  style={{
                    padding: 12,
                    paddingHorizontal: 14,
                    borderRadius: 14,
                    borderTopLeftRadius: 4,
                    backgroundColor: mine ? c.accentSoft : c.bg,
                  }}
                >
                  <Txt v="body" style={{ fontSize: 15, lineHeight: 22 }}>
                    {m.body}
                  </Txt>
                </View>
              </View>
            </View>
          );
        })}

        {(thread ? posts : legacyMsgs).length === 0 && (
          <Empty icon="chat">No messages yet. Send a message to start the conversation.</Empty>
        )}
      </Screen>

      {/* Mention helper bar if open */}
      {showMentionPicker && (
        <View style={{ maxHeight: 120, backgroundColor: c.bg, borderTopWidth: 1, borderTopColor: c.line }}>
          <ScrollView horizontal contentContainerStyle={{ padding: 10, gap: 8 }}>
            {directory.map((u) => (
              <Pressable
                key={u.id}
                onPress={() => insertMention(u.name)}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: c.surface }}
              >
                <Txt v="caption" color={c.accent} style={{ fontWeight: '600' }}>@{u.name}</Txt>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Bottom Reply Bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingLeft: 12,
          paddingRight: 12,
          paddingTop: 10,
          paddingBottom: 10,
          borderTopWidth: 1,
          borderTopColor: c.line,
          backgroundColor: c.surface,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mention a colleague"
          onPress={() => setShowMentionPicker(!showMentionPicker)}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: showMentionPicker ? c.accent : c.bg,
            borderWidth: 1,
            borderColor: showMentionPicker ? c.accent : c.line,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: font('mono', 700), fontSize: 16, color: showMentionPicker ? c.onAccent : c.accent }}>@</Text>
        </Pressable>
        <TextInput
          value={replyText}
          onChangeText={setReplyText}
          placeholder="Write a reply..."
          placeholderTextColor={c.ink3}
          multiline
          style={{
            flex: 1,
            maxHeight: 100,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 20,
            backgroundColor: c.bg,
            color: c.ink,
            fontFamily: font('text', 400),
            fontSize: 15,
          }}
        />
        <IconButton
          name="send"
          label="Send reply"
          disabled={!replyText.trim() || sending}
          onPress={handleSend}
        />
      </View>
    </View>
  );
}
