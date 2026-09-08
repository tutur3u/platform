import type { CallState } from './call-state';

export type CallNotice = {
  id: string;
  kind: 'joined' | 'waiting' | 'chat' | 'hand';
  name: string;
  body?: string;
};

/** Compare snapshots, ignoring initial presence, reconnects and our own actions. */
export function collectCallNotices(
  previous: CallState,
  next: CallState
): CallNotice[] {
  if (
    previous.admission !== 'admitted' ||
    next.admission !== 'admitted' ||
    next.ended
  )
    return [];
  const notices: CallNotice[] = [];
  for (const person of Object.values(next.participants)) {
    if (
      person.userId !== next.selfUserId &&
      !previous.participants[person.userId]
    )
      notices.push({
        id: `join:${person.userId}`,
        kind: 'joined',
        name: person.displayName,
      });
  }
  if (next.role === 'host')
    for (const person of next.waiting) {
      if (!previous.waiting.some((old) => old.userId === person.userId))
        notices.push({
          id: `waiting:${person.userId}`,
          kind: 'waiting',
          name: person.displayName,
        });
    }
  const oldMessages = new Set(previous.chat.map((message) => message.id));
  for (const message of next.chat) {
    if (message.userId !== next.selfUserId && !oldMessages.has(message.id))
      notices.push({
        id: `chat:${message.id}`,
        kind: 'chat',
        name: message.displayName,
        body: message.body,
      });
  }
  for (const id of next.stage.raisedHandUserIds) {
    if (
      id !== next.selfUserId &&
      !previous.stage.raisedHandUserIds.includes(id)
    )
      notices.push({
        id: `hand:${id}`,
        kind: 'hand',
        name: next.participants[id]?.displayName ?? '',
      });
  }
  return notices;
}
