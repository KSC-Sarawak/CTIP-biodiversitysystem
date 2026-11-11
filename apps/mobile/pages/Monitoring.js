// apps/mobile/pages/Monitoring.js
// Sensor nodes near protected plants:
// - Open alerts and alert history (filters: open, acknowledged, resolved, all)
// - Dual sparklines (Temperature with temp_max limit, Soil moisture with moisture_min limit)
// - Admin threshold limits editing (temp_max, moisture_min)
// - Alert detail with 3-step progress pipeline (Assign -> Acknowledge -> Resolve),
//   conservation officer assignment, investigation notes, and resolution outcome.
import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, Alert, TextInput } from 'react-native';

import { useStore } from '../../shared/store.js';
import { plantView, nameOf } from '../../shared/selectors.js';
import { useTheme, font, statusText } from '../components/Theme.js';
import Icon from '../components/Icon.js';
import {
  Screen, Bar, TitleBlock, Section, Row, Thumb, Mono, Txt, DotLabel, Chip, Spark, Button, Area,
  Empty, EmptyState, Pills, Field,
} from '../components/Bits.js';
import { dateTime, shortDate } from '../components/format.js';
import { usePolling } from '../hooks/usePolling.js';

const latest = (readings = []) => readings[readings.length - 1];

function AlertCard({ a, node, onPress }) {
  const { c } = useTheme();
  const tone = a.status === 'open' ? 'danger' : a.status === 'acknowledged' ? 'warning' : 'accent';
  const r = a.reading || {};
  const limit = node?.thresholds?.temp_max;
  const what = r.temperature != null
    ? `${r.temperature}°C${limit != null ? `, limit ${limit}°C` : ''}`
    : r.motion
    ? 'Movement detected near the plant'
    : 'Unusual reading';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: 14,
        padding: 16,
        borderRadius: 14,
        backgroundColor: c[tone + 'Soft'] || c.bg,
        borderWidth: 1,
        borderColor: c[tone + 'Line'] || c.line,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon name={r.temperature != null ? 'thermo' : 'activity'} size={24} color={c[tone] || c.accent} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Txt v="label" style={{ fontSize: 16, flex: 1 }}>{a.type}</Txt>
          <DotLabel status={a.severity} label={statusText(a.severity || 'unknown')} />
        </View>
        <Txt v="body" style={{ fontSize: 15 }}>{node?.name || 'Unknown node'} · {what}</Txt>
        <Txt v="caption" color={c.ink2} style={{ fontFamily: font('text', 600) }}>
          {dateTime(a.created_at)} · {a.status}
        </Txt>
      </View>
      <Icon name="chevR" size={20} color={c.ink3} />
    </Pressable>
  );
}

export function Monitor({ nav }) {
  usePolling(5000);
  const { db, role, setThresholds, notify } = useStore();
  const { c } = useTheme();

  const [picked, setPicked] = useState(null);
  const [historyTab, setHistoryTab] = useState('open'); // open | acknowledged | resolved | all
  const [editingLimits, setEditingLimits] = useState(false);
  const [newTempMax, setNewTempMax] = useState('32');
  const [newMoistureMin, setNewMoistureMin] = useState('25');
  const [savingLimits, setSavingLimits] = useState(false);

  const nodeId = (db.nodes || []).some((n) => n.id === picked)
    ? picked
    : (db.nodes || []).find((n) => n.status === 'active')?.id || db.nodes?.[0]?.id;

  const node = (db.nodes || []).find((n) => n.id === nodeId);
  const readings = (db.telemetry || {})[nodeId] || [];
  const now = latest(readings);
  const limits = node?.thresholds || {};

  const openCount = (db.alerts || []).filter((a) => a.status === 'open').length;
  const offline = (db.nodes || []).filter((n) => n.status !== 'active').length;

  // Filter alerts by history tab
  const displayedAlerts = (db.alerts || []).filter((a) => {
    if (historyTab === 'open') return a.status === 'open';
    if (historyTab === 'acknowledged') return a.status === 'acknowledged';
    if (historyTab === 'resolved') return a.status === 'resolved';
    return true;
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));

  const openLimitsModal = () => {
    setNewTempMax(String(limits.temp_max ?? 32));
    setNewMoistureMin(String(limits.moisture_min ?? 25));
    setEditingLimits(true);
  };

  const handleSaveLimits = async () => {
    const tMax = parseFloat(newTempMax);
    const mMin = parseFloat(newMoistureMin);
    if (isNaN(tMax) || isNaN(mMin)) {
      return Alert.alert('Invalid values', 'Please enter valid numerical thresholds.');
    }
    setSavingLimits(true);
    try {
      const res = await setThresholds(node.id, { temp_max: tMax, moisture_min: mMin });
      if (res?.ok !== false) {
        notify('Thresholds updated');
        setEditingLimits(false);
      } else {
        Alert.alert('Error', res?.message || 'Could not update limits');
      }
    } finally {
      setSavingLimits(false);
    }
  };

  return (
    <Screen gap={20}>
      <TitleBlock
        title="IoT Monitoring"
        sub={`${openCount} open alert${openCount === 1 ? '' : 's'} · ${offline} node${offline === 1 ? '' : 's'} offline`}
      />

      {/* Node Telemetry & Dual Sparklines Section */}
      <Section
        title="Last 24 hours readings"
        gap={12}
        right={
          role === 'admin' && node ? (
            <Pressable onPress={openLimitsModal} hitSlop={8}>
              <Txt v="caption" color={c.accent} style={{ fontWeight: '700' }}>Edit limits</Txt>
            </Pressable>
          ) : null
        }
      >
        <Pills
          value={nodeId}
          onChange={setPicked}
          items={(db.nodes || []).map((n) => ({ key: n.id, label: n.name }))}
        />

        {node && (
          <View style={{ padding: 14, borderRadius: 14, backgroundColor: c.bg, gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Txt v="label" style={{ fontSize: 16 }}>{node.name}</Txt>
              <DotLabel status={node.status} />
            </View>
            <Txt v="caption" color={c.ink2}>
              Alert limits: {limits.temp_max != null ? `${limits.temp_max}°C max` : 'no max temp'}, {limits.moisture_min != null ? `${limits.moisture_min}% soil min` : 'no min soil'}
            </Txt>
          </View>
        )}

        {now ? (
          <View style={{ gap: 14 }}>
            {/* Temperature Sparkline */}
            <View style={{ padding: 14, borderRadius: 14, backgroundColor: c.bg, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="thermo" size={18} color={c.ink} />
                  <Txt v="label">Air Temperature</Txt>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                  <Text style={{ fontFamily: font('display', 700), fontSize: 24, color: limits.temp_max != null && now.temperature > limits.temp_max ? c.danger : c.ink }}>
                    {now.temperature}°C
                  </Text>
                  {limits.temp_max != null && <Txt v="caption" color={c.ink2}>limit {limits.temp_max}°C</Txt>}
                </View>
              </View>
              <Spark values={readings.map((r) => r.temperature).filter((v) => v != null)} limit={limits.temp_max} height={70} />
            </View>

            {/* Soil Moisture Sparkline */}
            <View style={{ padding: 14, borderRadius: 14, backgroundColor: c.bg, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="drop" size={18} color={c.ink} />
                  <Txt v="label">Soil Moisture</Txt>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                  <Text style={{ fontFamily: font('display', 700), fontSize: 24, color: limits.moisture_min != null && now.soil_moisture < limits.moisture_min ? c.danger : c.ink }}>
                    {now.soil_moisture}%
                  </Text>
                  {limits.moisture_min != null && <Txt v="caption" color={c.ink2}>min {limits.moisture_min}%</Txt>}
                </View>
              </View>
              <Spark values={readings.map((r) => r.soil_moisture).filter((v) => v != null)} limit={limits.moisture_min} height={70} />
            </View>
          </View>
        ) : (
          <EmptyState count={0} icon="activity" rows={2}>No readings available for this node.</EmptyState>
        )}
      </Section>

      {/* Alert Feed with History Filter */}
      <Section title="Alerts & Pipeline" gap={10}>
        <Pills
          value={historyTab}
          onChange={setHistoryTab}
          items={[
            { key: 'open', label: `Open (${(db.alerts || []).filter((a) => a.status === 'open').length})` },
            { key: 'acknowledged', label: 'Acknowledged' },
            { key: 'resolved', label: 'Resolved' },
            { key: 'all', label: 'All history' },
          ]}
        />

        {displayedAlerts.map((a) => (
          <AlertCard
            key={a.id}
            a={a}
            node={(db.nodes || []).find((n) => n.id === a.node_id)}
            onPress={() => nav.go('alert', { id: a.id })}
          />
        ))}

        {displayedAlerts.length === 0 && (
          <EmptyState count={0} icon="shield">No {historyTab === 'all' ? '' : historyTab} alerts.</EmptyState>
        )}
      </Section>

      {/* Node list summary */}
      <Section title="All sensor nodes" gap={0}>
        {(db.nodes || []).map((n, i) => {
          const r = latest((db.telemetry || {})[n.id]);
          const plant = plantView(db, (db.plants || []).find((p) => p.id === n.specimen_id));
          return (
            <View
              key={n.id}
              style={{
                gap: 6,
                paddingVertical: 14,
                borderBottomWidth: i === (db.nodes || []).length - 1 ? 0 : 1,
                borderBottomColor: c.line,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt v="label" style={{ fontSize: 16 }}>{n.name}</Txt>
                <DotLabel status={n.status} />
              </View>
              {plant ? (
                <Txt v="small" color={c.ink2} style={{ fontFamily: font('text', 400) }}>
                  {plant.name} · <Mono size={13} color={c.ink2}>{plant.qr_id}</Mono>
                </Txt>
              ) : null}
              {n.status === 'active' && r ? (
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Icon name="thermo" size={16} color={c.ink2} />
                    <Txt v="label" style={{ fontSize: 14 }}>{r.temperature}°C</Txt>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Icon name="drop" size={16} color={c.ink2} />
                    <Txt v="label" style={{ fontSize: 14 }}>{r.soil_moisture}%</Txt>
                  </View>
                </View>
              ) : (
                <Txt v="small" color={c.ink2} style={{ fontFamily: font('text', 400) }}>
                  No readings since {dateTime(n.last_seen)}
                </Txt>
              )}
            </View>
          );
        })}
      </Section>

      {/* Admin Threshold Limits Modal */}
      {editingLimits && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setEditingLimits(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }} onPress={() => setEditingLimits(false)}>
            <Pressable style={{ backgroundColor: c.surface, borderRadius: 16, padding: 20, gap: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt v="title2">Edit alert limits for {node?.name}</Txt>
                <IconButton name="x" label="Close" onPress={() => setEditingLimits(false)} />
              </View>
              <Txt v="caption" color={c.ink2}>Alerts trigger when telemetry crosses these limits.</Txt>
              <Field
                label="Maximum temperature (°C)"
                value={newTempMax}
                onChangeText={setNewTempMax}
                keyboardType="numeric"
                placeholder="32"
              />
              <Field
                label="Minimum soil moisture (%)"
                value={newMoistureMin}
                onChangeText={setNewMoistureMin}
                keyboardType="numeric"
                placeholder="25"
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <Button label="Cancel" kind="secondary" flex={1} onPress={() => setEditingLimits(false)} />
                <Button label={savingLimits ? 'Saving…' : 'Save limits'} flex={1.4} disabled={savingLimits} onPress={handleSaveLimits} />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </Screen>
  );
}

// 3-step progress pipeline helper:
// 1. Assign -> 2. Acknowledge -> 3. Resolve
const PIPELINE_STEPS = ['Assign', 'Acknowledge', 'Resolve'];
function stepIndexOf(alert) {
  if (alert.status === 'resolved') return 3;
  if (alert.status === 'acknowledged') return 2;
  return alert.assigned_to ? 1 : 0;
}

export function AlertDetail({ nav, params = {} }) {
  usePolling(5000);
  const { db, ackAlert, resolveAlert, assignAlert, addAlertNote, notify } = useStore();
  const { c } = useTheme();

  const [investigationNote, setInvestigationNote] = useState('');
  const [resolutionOutcome, setResolutionOutcome] = useState('');
  const [assignPicker, setAssignPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  const a = (db.alerts || []).find((x) => x.id === params.id);
  if (!a) {
    return (
      <Screen header={<Bar title="Alert" onBack={nav.back} />}>
        <Empty icon="shield">This alert no longer exists.</Empty>
      </Screen>
    );
  }

  const node = (db.nodes || []).find((n) => n.id === a.node_id);
  const plant = plantView(db, (db.plants || []).find((p) => p.id === node?.specimen_id));
  const readings = (db.telemetry || {})[a.node_id] || [];
  const r = a.reading || {};
  const notes = (db.alertNotes || []).filter((n) => n.alert_id === a.id);
  const limits = node?.thresholds || {};

  const officers = (db.profiles || []).filter((p) => p.role === 'officer' && p.is_active);
  const currentStep = stepIndexOf(a);

  const handleAddNote = async () => {
    if (!investigationNote.trim() || busy) return;
    setBusy(true);
    try {
      await addAlertNote(a.id, investigationNote.trim());
      setInvestigationNote('');
      notify('Investigation note added');
    } finally {
      setBusy(false);
    }
  };

  const handleAcknowledge = async () => {
    setBusy(true);
    try {
      await ackAlert(a.id);
      notify('Alert acknowledged');
    } finally {
      setBusy(false);
    }
  };

  const handleResolve = async () => {
    if (!resolutionOutcome.trim()) {
      return Alert.alert('Outcome required', 'Please describe the findings and resolution outcome before resolving this alert.');
    }
    setBusy(true);
    try {
      await resolveAlert(a.id, resolutionOutcome.trim());
      notify('Alert resolved');
      nav.back();
    } finally {
      setBusy(false);
    }
  };

  const handleAssign = async (officerId) => {
    setAssignPicker(false);
    setBusy(true);
    try {
      await assignAlert(a.id, officerId);
      notify(`Assigned to ${nameOf(db, officerId)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={<Bar title={a.type} sub={`${node?.name} · ${dateTime(a.created_at)}`} onBack={nav.back} />}
      top={16}
      gap={18}
      footer={
        a.status !== 'resolved' ? (
          <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
            {a.status === 'open' && (
              <Button label="Acknowledge" icon="check" kind="secondary" flex={1} disabled={busy} onPress={handleAcknowledge} />
            )}
            <Button
              label={busy ? 'Resolving…' : 'Resolve alert'}
              flex={1.3}
              disabled={busy}
              onPress={handleResolve}
            />
          </View>
        ) : null
      }
    >
      {/* 3-Step Progress Pipeline */}
      <View style={{ padding: 14, borderRadius: 14, backgroundColor: c.bg, gap: 8 }}>
        <Txt v="caption" color={c.ink2} style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Progress Pipeline
        </Txt>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          {PIPELINE_STEPS.map((stepName, i) => {
            const isCompleted = i < currentStep;
            const isCurrent = i === currentStep;
            return (
              <View key={stepName} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: isCompleted ? c.accent : isCurrent ? c.warning : c.line,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontFamily: font('text', 700), fontSize: 12, color: isCompleted || isCurrent ? '#ffffff' : c.ink2 }}>
                    {i + 1}
                  </Text>
                </View>
                <Txt
                  v="caption"
                  color={isCompleted ? c.accent : isCurrent ? c.ink : c.ink3}
                  style={{ fontWeight: isCurrent || isCompleted ? '700' : '400', marginLeft: 6 }}
                >
                  {stepName}
                </Txt>
              </View>
            );
          })}
        </View>
      </View>

      {/* Badges & Officer Assignment */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip status={a.severity} label={statusText(a.severity || 'unknown')} />
          <Chip status={a.status} />
        </View>
        <Button
          label={a.assigned_to ? `Assigned: ${nameOf(db, a.assigned_to)}` : 'Assign officer'}
          kind={a.assigned_to ? 'quiet' : 'secondary'}
          height={38}
          size={13}
          onPress={() => setAssignPicker(true)}
        />
      </View>

      {/* Sensor Readings & Dual Sparklines */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {r.temperature != null ? (
          <Reading
            label="Temperature"
            value={`${r.temperature}°C`}
            sub={limits.temp_max != null ? `limit ${limits.temp_max}°C` : 'no limit'}
            bad={limits.temp_max != null && r.temperature > limits.temp_max}
          />
        ) : null}
        {r.soil_moisture != null ? (
          <Reading
            label="Soil moisture"
            value={`${r.soil_moisture}%`}
            sub={limits.moisture_min != null ? `minimum ${limits.moisture_min}%` : 'no limit'}
            bad={limits.moisture_min != null && r.soil_moisture < limits.moisture_min}
          />
        ) : null}
        {r.motion ? <Reading label="Movement" value="Yes" sub="near plant" bad /> : null}
      </View>

      {/* Dual Sparklines */}
      {readings.length > 0 && (
        <Section title="24-hour dual telemetry sparklines" gap={10}>
          <View style={{ padding: 12, borderRadius: 12, backgroundColor: c.bg, gap: 6 }}>
            <Txt v="caption" color={c.ink2}>Temperature (°C)</Txt>
            <Spark values={readings.map((x) => x.temperature).filter((v) => v != null)} limit={limits.temp_max} height={60} />
          </View>
          <View style={{ padding: 12, borderRadius: 12, backgroundColor: c.bg, gap: 6 }}>
            <Txt v="caption" color={c.ink2}>Soil Moisture (%)</Txt>
            <Spark values={readings.map((x) => x.soil_moisture).filter((v) => v != null)} limit={limits.moisture_min} height={60} />
          </View>
        </Section>
      )}

      {/* Protected Plant */}
      {plant && (
        <Section title="Protected plant" gap={0}>
          <Row
            left={<Thumb uri={plant.photos?.[0]?.url} size={48} />}
            title={plant.name}
            sub={
              <>
                <Mono size={13}>{plant.qr_id}</Mono>
                {plant.endangered ? <DotLabel status="endangered" /> : null}
              </>
            }
            onPress={() => nav.go('tag', { qr: plant.qr_id })}
            last
          />
        </Section>
      )}

      {/* Investigation Notes Feed */}
      <Section title={`Investigation notes (${notes.length})`} gap={8}>
        {notes.map((n) => (
          <View key={n.id} style={{ padding: 12, borderRadius: 12, backgroundColor: c.bg, gap: 4 }}>
            <Txt v="caption" color={c.ink2}>{nameOf(db, n.author_id)} · {dateTime(n.created_at)}</Txt>
            <Txt v="body" style={{ fontSize: 15, lineHeight: 22 }}>{n.note}</Txt>
          </View>
        ))}

        {a.status !== 'resolved' && (
          <View style={{ gap: 8, marginTop: 4 }}>
            <Area
              label="Add investigation note"
              value={investigationNote}
              onChangeText={setInvestigationNote}
              placeholder="Record field observations, soil checks, battery level..."
            />
            <Button
              label="Save investigation note"
              kind="secondary"
              height={40}
              size={14}
              disabled={!investigationNote.trim() || busy}
              onPress={handleAddNote}
            />
          </View>
        )}
      </Section>

      {/* Resolution Outcome Section */}
      <Section title="Resolution outcome" gap={8}>
        {a.status === 'resolved' ? (
          <View style={{ padding: 14, borderRadius: 12, backgroundColor: c.bg, gap: 4 }}>
            <Txt v="caption" color={c.ink2}>Resolved outcome</Txt>
            <Txt v="body" style={{ fontSize: 15 }}>{a.outcome || 'Resolved without detailed note.'}</Txt>
          </View>
        ) : (
          <Area
            label="Resolution outcome (required to resolve)"
            value={resolutionOutcome}
            onChangeText={setResolutionOutcome}
            placeholder="Describe action taken to resolve this alert (e.g. Cleared dry debris, watered root zone)..."
          />
        )}
      </Section>

      {/* Officer Assignment Picker Modal */}
      {assignPicker && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setAssignPicker(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} onPress={() => setAssignPicker(false)}>
            <Pressable style={{ maxHeight: '60%', backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt v="title2">Assign conservation officer</Txt>
                <IconButton name="x" label="Close" onPress={() => setAssignPicker(false)} />
              </View>
              <ScrollView>
                {officers.map((o) => (
                  <Pressable
                    key={o.id}
                    onPress={() => handleAssign(o.id)}
                    style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.line }}
                  >
                    <Txt v="body" style={{ fontWeight: a.assigned_to === o.id ? '700' : '400' }}>
                      {o.full_name} ({o.email})
                    </Txt>
                  </Pressable>
                ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </Screen>
  );
}

function Reading({ label, value, sub, bad }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, gap: 2, padding: 14, borderRadius: 14, backgroundColor: c.bg }}>
      <Txt v="caption" color={c.ink2}>{label}</Txt>
      <Text style={{ fontFamily: font('display', 700), fontSize: 26, color: bad ? c.danger : c.ink }}>{value}</Text>
      <Txt v="caption" color={c.ink2} style={{ fontFamily: font('text', 600) }}>{sub}</Txt>
    </View>
  );
}
