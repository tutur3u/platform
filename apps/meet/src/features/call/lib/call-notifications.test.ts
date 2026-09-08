import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { expect, it } from 'vitest';
import { collectCallNotices } from './call-notifications';
import { type CallState, INITIAL_CALL_STATE } from './call-state';

const before: CallState = {
  ...INITIAL_CALL_STATE,
  admission: 'admitted',
  selfUserId: 'self',
  role: 'host',
};
const after: CallState = {
  ...before,
  participants: {
    peer: { userId: 'peer', displayName: 'Peer' } as MeetRealtimePresence,
  },
  waiting: [{ userId: 'guest', displayName: 'Guest' }] as CallState['waiting'],
  chat: [
    {
      id: 'msg',
      body: 'Hello',
      displayName: 'Peer',
      userId: 'peer',
      createdAt: '',
    },
  ],
  stage: { ...before.stage, raisedHandUserIds: ['peer'] },
};
it('announces joins, requests, messages and raised hands once', () => {
  expect(
    collectCallNotices(before, after).map((notice) => notice.kind)
  ).toEqual(['joined', 'waiting', 'chat', 'hand']);
  expect(collectCallNotices(after, after)).toEqual([]);
});
it('does not replay initial state or announce ended-room changes', () => {
  expect(collectCallNotices(INITIAL_CALL_STATE, after)).toEqual([]);
  expect(collectCallNotices(before, { ...after, ended: true })).toEqual([]);
});
it('keeps admission notices private to hosts and ignores own chat', () => {
  const notices = collectCallNotices(before, {
    ...after,
    role: 'speaker',
    selfUserId: 'peer',
  });
  expect(notices).toEqual([]);
});
