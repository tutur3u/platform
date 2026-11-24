import type { CallChatMessage } from './call-state';

const storageKey = (meetingId: string) => `meet:mira-lines:${meetingId}`;

/**
 * A room Mira system line shows once per acceptance revision, however many
 * times it is delivered or replayed. A line without a revision is its own.
 */
export function miraLineKey(message: Pick<CallChatMessage, 'id' | 'notice'>) {
  const { notice } = message;
  return notice?.revision === undefined
    ? `id:${message.id}`
    : `${notice.kind}:${notice.revision}`;
}

/** The chat without repeated or dismissed Mira system lines. */
export function visibleChatMessages(
  chat: readonly CallChatMessage[],
  dismissed: ReadonlySet<string>
) {
  const seen = new Set<string>();
  return chat.filter((message) => {
    if (!message.notice) return true;
    const key = miraLineKey(message);
    if (dismissed.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Lines this person dismissed in this meeting, for this browser tab. */
export function readDismissedMiraLines(meetingId: string) {
  try {
    const raw = sessionStorage.getItem(storageKey(meetingId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((key): key is string => typeof key === 'string')
        : []
    );
  } catch {
    return new Set<string>();
  }
}

export function writeDismissedMiraLines(
  meetingId: string,
  dismissed: ReadonlySet<string>
) {
  try {
    sessionStorage.setItem(
      storageKey(meetingId),
      JSON.stringify([...dismissed].slice(-50))
    );
  } catch {
    // Storage can be blocked; the line stays dismissed until the next reload.
  }
}
