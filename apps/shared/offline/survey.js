// apps/shared/offline/survey.js
// Quick survey mode (CTIP-147, innovation CTIP-51): a botanist starts a survey
// for a plot while online, the phone keeps enough tags for it, and then records
// plant after plant with no signal. Only the survey and, when asked, the species
// carry over to the next plant: photos, GPS, height, morphology and notes are
// always that plant's own.
//
// Sessions live on the phone (survey_sessions, schema v7) and are never sent to
// the API; survey_id on an outbox record is local only (the sync engine sends
// fixed field lists).
//
// No React or Expo import, so node can load it in the tests.
import { RESERVED_KEEP } from "./tags.js";

export const SURVEY_TAG_DEFAULT = 10;
export const SURVEY_TAG_MAX = 20; // same as the API's limit (services/api/src/staff.js)
const NAME_MAX = 60;

const norm = (id) => String(id || "").trim().toUpperCase();

/** { ok: true } or { ok: false, message } for the start form. */
export function checkSurveyStart({ name, tagTarget }) {
  const clean = String(name ?? "").trim();
  if (!clean) return { ok: false, message: "Give the survey a name, for example the plot." };
  if (clean.length > NAME_MAX) return { ok: false, message: `Keep the name to ${NAME_MAX} characters.` };
  if (!Number.isInteger(tagTarget) || tagTarget < 1 || tagTarget > SURVEY_TAG_MAX) {
    return { ok: false, message: `Keep between 1 and ${SURVEY_TAG_MAX} tags.` };
  }
  return { ok: true };
}

/** What the next plant starts with: the survey, and the species only when asked. */
export function carryOver(lastRecord, { sameSpecies = false } = {}) {
  const out = { survey_id: lastRecord?.survey_id ?? null };
  const species = String(lastRecord?.proposed_species ?? "").trim();
  if (sameSpecies && species) out.proposed_species = species;
  return out;
}

/** How many free kept tags the phone should hold: the survey's target while one is active. */
export function keepTarget(activeSurvey) {
  return activeSurvey ? Math.max(RESERVED_KEEP, Number(activeSurvey.tag_target) || 0) : RESERVED_KEEP;
}

/** The free kept tags beyond the first `keep`, to give back once a survey has ended. */
export function extraKeptTags(keptIds = [], usedOnPhone = [], keep = RESERVED_KEEP) {
  const used = new Set(usedOnPhone.map(norm));
  return keptIds.map(norm).filter((id) => !used.has(id)).slice(keep);
}

/**
 * The survey so far. recorded: timing rows of this survey (one per saved plant);
 * onPhone: its records still waiting in the outbox; sent: the rest; tagsLeft:
 * free kept tags.
 */
export function sessionSummary({ sessionId, timings = [], outboxItems = [], keptIds = [], usedOnPhone = [] }) {
  const recorded = timings.filter((t) => sessionId && t.survey_id === sessionId).length;
  const onPhone = outboxItems.filter((r) => sessionId && r.survey_id === sessionId).length;
  const used = new Set(usedOnPhone.map(norm));
  return {
    recorded,
    onPhone,
    sent: Math.max(0, recorded - onPhone),
    tagsLeft: keptIds.map(norm).filter((id) => !used.has(id)).length,
  };
}

/**
 * The survey a new plant belongs to: the one in the route, else the botanist's open
 * survey. A plant reached through Scan (a printed tag, once kept tags ran out) still
 * belongs to the survey that is open.
 */
export function surveyIdFor(params, activeSurvey) {
  return params?.survey ?? activeSurvey?.id ?? null;
}

/**
 * What to tell the botanist when the server refuses to keep tags, or null to stay
 * quiet. Over the holding limit is always told; during a survey any refusal is told,
 * because they may be about to walk into no signal with too few tags. No connection
 * stays quiet: the next connection tries again.
 */
export function keptTagRefusal(res, keepTargetNow = RESERVED_KEEP) {
  if (!res || res.ok || res.offline) return null;
  if (res.code === "TOO_MANY_KEPT_TAGS") return res.message || "Release some kept tags first.";
  if (keepTargetNow > RESERVED_KEEP) return `Could not keep tags for the survey: ${res.message || "try again"}`;
  return null;
}
