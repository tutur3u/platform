import type { StoredLiveQaQuestion } from './live-qa-schema';
import type { MeetRoomSnapshot } from './room';

type Attachments = MeetRoomSnapshot['attachments'];

/**
 * Marks the files shared. Each one has to be a file this person uploaded to
 * this room and has not shared anywhere yet, so removing the answer that
 * carries it can release it.
 */
export function claimLiveQaFiles(
  state: MeetRoomSnapshot,
  ids: string[],
  actor: string
): Attachments | 'attachment_unavailable' {
  if (new Set(ids).size !== ids.length) return 'attachment_unavailable';
  const attachments = { ...state.attachments };
  for (const id of ids) {
    const file = attachments[id];
    if (
      !file ||
      file.discarded ||
      file.published ||
      file.ownerAccountId !== actor
    )
      return 'attachment_unavailable';
    attachments[id] = { ...file, published: true };
  }
  return attachments;
}

/** Every file a question and its answers carry. */
export function liveQaQuestionFiles(question: StoredLiveQaQuestion) {
  return [
    ...(question.attachmentIds ?? []),
    ...(question.answers ?? []).flatMap((answer) => answer.attachmentIds),
  ];
}

/**
 * Files of a hidden question are for hosts only until it is shown again, so
 * a link someone already has stops opening for everyone else.
 */
export function withholdLiveQaFiles(
  attachments: Attachments,
  ids: readonly string[],
  withheld: boolean
): Attachments {
  if (!ids.length) return attachments;
  const next = { ...attachments };
  for (const id of ids) {
    const file = next[id];
    if (!file) continue;
    if (withheld) next[id] = { ...file, withheld: true };
    else {
      const { withheld: _withheld, ...shown } = file;
      next[id] = shown;
    }
  }
  return next;
}

/**
 * Files of a deleted answer: no longer readable, no longer shared, and
 * released so their uploader or a host can remove the stored bytes.
 */
export function releaseLiveQaFiles(
  attachments: Attachments,
  ids: readonly string[]
): Attachments {
  const next = { ...attachments };
  for (const id of ids) {
    const file = next[id];
    if (file)
      next[id] = { ...file, discarded: true, published: false, released: true };
  }
  return next;
}
