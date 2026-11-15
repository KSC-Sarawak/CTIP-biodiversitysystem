// apps/mobile/pages/Survey.js
// Quick survey mode (CTIP-147, innovation CTIP-51). A botanist starts a survey
// for a plot while online; the phone keeps enough tags for it. Then, with no
// signal, they record plant after plant: after each save "Next plant" opens Add
// plant with the next kept tag filled in. Only the survey and, when asked, the
// species carry over (apps/shared/offline/survey.js). Ending the survey works
// offline; the extra tags are given back at the next connection.
import React, { useEffect, useState } from 'react';
import { View, Alert } from 'react-native';

import { useStore } from '../../shared/store.js';
import { SURVEY_TAG_DEFAULT, SURVEY_TAG_MAX, carryOver, sessionSummary } from '../../shared/offline/survey.js';
import {
  Screen, Header, IconButton, TitleBlock, Section, Txt, Field, Button, KV, Notice,
} from '../components/Bits.js';

export default function Survey({ nav }) {
  const { activeSurvey, startSurvey, apiStatus } = useStore();
  const [name, setName] = useState('');
  const [count, setCount] = useState(String(SURVEY_TAG_DEFAULT));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const online = apiStatus === 'connected';

  const start = async () => {
    setProblem('');
    setBusy(true);
    try {
      const res = await startSurvey({ name, tagTarget: Number(count) });
      if (!res.ok) setProblem(res.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<Header left={<IconButton name="chevL" label="Back" onPress={nav.back} />} />} top={0} gap={20} refresh={false}>
      {activeSurvey ? (
        <>
          <TitleBlock title={activeSurvey.name} sub="Survey in progress. Record plant after plant, even with no signal." />
          <SurveyPanel nav={nav} />
        </>
      ) : (
        <>
          <TitleBlock title="Start a survey" sub="Record a whole plot in one visit. Start it while you still have signal, so the phone can keep tags for it." />
          {!online ? <Notice tone="warning" title="No connection" body="Starting a survey needs a connection to keep tags." /> : null}
          <Field label="Survey name" value={name} onChangeText={setName} placeholder="For example Plot 4, river trail" maxLength={60} />
          <Field
            label="Tags to keep"
            value={count}
            onChangeText={(t) => setCount(t.replace(/\D/g, ''))}
            keyboardType="number-pad"
            hint={`1 to ${SURVEY_TAG_MAX}. Unused tags are given back when the survey ends.`}
            maxLength={2}
          />
          {problem ? <Notice tone="warning" title="Can't start yet" body={problem} /> : null}
          <Button label={busy ? 'Starting…' : 'Start survey'} icon="check" disabled={busy || !online} onPress={start} />
        </>
      )}
    </Screen>
  );
}

// The open survey: how it is going, the next plant, and ending it. `last` is the
// plant just saved ({ qr, name, sameSpecies }) when shown after a save. Its tag is
// skipped: a record sent at once leaves the outbox before the tag list reloads.
export function SurveyPanel({ nav, last = null }) {
  const { activeSurvey, endSurvey, takeReservedTag, keptTags = [], outboxItems = [], timings, me, notify } = useStore();
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let current = true;
    if (timings && me?.id) {
      timings.listTimings(me.id).then((r) => { if (current) setRows(r); }, () => {});
    }
    return () => { current = false; };
  }, [timings, me?.id, activeSurvey?.id, outboxItems.length]);

  if (!activeSurvey) return null;
  const justUsed = last?.qr ? [last.qr] : [];
  const sum = sessionSummary({ sessionId: activeSurvey.id, timings: rows, outboxItems, keptIds: keptTags, usedOnPhone: justUsed });
  const next = takeReservedTag(justUsed);

  const nextPlant = () => {
    const carry = carryOver({ survey_id: activeSurvey.id, proposed_species: last?.name }, { sameSpecies: !!last?.sameSpecies });
    const params = { qr: next, survey: activeSurvey.id, carry, sameSpecies: !!last?.sameSpecies };
    if (last) nav.replace('add', params);
    else nav.go('add', params);
  };

  const end = () => {
    Alert.alert(`End "${activeSurvey.name}"?`, 'Plants already saved stay on the phone or are sent as usual. Unused tags are given back when there is a connection.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End survey',
        onPress: async () => {
          const res = await endSurvey();
          if (!res.ok) return Alert.alert("Couldn't end the survey", res.message);
          notify?.('Survey ended');
          nav.home();
        },
      },
    ]);
  };

  return (
    <Section title="This survey" gap={12}>
      <KV
        rows={[
          ['Plants recorded', String(sum.recorded)],
          ['Saved on this phone', String(sum.onPhone)],
          ['Sent', String(sum.sent)],
          ['Tags left', `${sum.tagsLeft} of ${activeSurvey.tag_target}`],
        ]}
      />
      {next ? (
        <Button label={`Next plant (${next})`} icon="plus" onPress={nextPlant} />
      ) : (
        <>
          <Notice tone="warning" title="No kept tags left" body="Scan a printed tag or end the survey." />
          <Button label="Scan a printed tag" kind="secondary" onPress={() => (last ? nav.replace('scan') : nav.go('scan'))} />
        </>
      )}
      <View style={{ alignItems: 'flex-start' }}>
        <Button label="End survey" kind="dangerText" height={40} size={13} onPress={end} />
      </View>
      <Txt v="caption">Photos, location, height, appearance and notes are never copied to the next plant.</Txt>
    </Section>
  );
}
