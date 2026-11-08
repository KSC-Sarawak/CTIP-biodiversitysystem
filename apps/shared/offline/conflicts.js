// apps/shared/offline/conflicts.js
// Two devices edited one record (CTIP-67). Design: docs/architecture/offline-sync.md, §8.
//
// The rule is small. Only an edit of a record the server already holds (draft or
// queued) can conflict. The phone sends its edit with the version it last saw;
// if the server moved on, the server changes nothing and the sync engine keeps
// both copies (state 'conflict', record.server = the server's copy). Nothing is
// ever resolved automatically: the botanist chooses, and the choice is written
// to the record as a comment.
//
// No React Native imports: this runs under plain Node in the tests.

export const MINE_COMMENT = "Edited on two devices before syncing. Kept the version from this phone.";
export const THEIRS_COMMENT = "Edited on two devices before syncing. Kept the version from the other device.";

const COULD_NOT = "This record could not be changed on this phone. Try again.";
export const ALREADY_SENT = "This record was already sent for review from another device.";

/**
 * True when the other device already sent the record for review (WRONG_STATUS).
 * The server no longer takes edits to it, so resending this phone's version
 * would only clash again: only "Keep the other version" can clear it.
 */
export const sentForReviewElsewhere = (record) => record?.error?.code === "WRONG_STATUS";

/**
 * Apply the botanist's choice for the conflicting record `id`. Answers { ok, message? }.
 *
 *   'mine'    The phone's edit is sent again, based on the server's current
 *             version (resolution: 'mine'). The sync engine adds MINE_COMMENT
 *             once the server has accepted the edit, so this works with no
 *             connection: the choice is kept and the comment follows the edit.
 *             Refused when the other device already sent the record for
 *             review (sentForReviewElsewhere): the edit could never land.
 *   'theirs'  The comment is posted first. Only if the server confirmed it is the
 *             phone's copy removed. If the comment fails the record stays in
 *             conflict, so the botanist can try again; we never drop the phone's
 *             edit without leaving a trace on the record.
 */
export async function resolveConflict({ outbox, addComment, id, choice }) {
  const record = await outbox.get(id);
  if (!record || record.state !== "conflict") {
    return { ok: false, message: "This record is no longer waiting for a choice." };
  }

  if (choice === "mine") {
    if (sentForReviewElsewhere(record)) return { ok: false, message: ALREADY_SENT };
    const version = record.server?.version;
    if (!Number.isInteger(version)) return { ok: false, message: COULD_NOT };
    const saved = await outbox.update(id, {
      base_version: version,
      resolution: "mine",
      state: "pending",
      server: null,
      error: null,
    });
    return saved ? { ok: true } : { ok: false, message: "This record is no longer on this phone." };
  }

  if (choice === "theirs") {
    const res = await addComment(id, THEIRS_COMMENT);
    if (!res?.ok) return { ok: false, message: res?.message || "The comment could not be added. Try again." };
    await outbox.remove(id);
    return { ok: true };
  }

  return { ok: false, message: COULD_NOT };
}
