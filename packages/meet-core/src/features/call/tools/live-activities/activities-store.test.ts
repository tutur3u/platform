import {
  EMPTY_LIVE_ACTIVITIES_MINE,
  EMPTY_LIVE_ACTIVITIES_SNAPSHOT,
  type MeetRealtimeClientMessage,
} from '@tuturuuu/realtime/meet';
import { afterEach, expect, it, vi } from 'vitest';
import { handleLiveActivitiesMessage } from './activities-handler';
import {
  closeLiveActivitiesRoom,
  createLiveActivitiesStore,
  liveActivitiesRoom,
} from './activities-store';

const meetingId = 'live-activities';
const PROMPT = '55555555-5555-4555-8555-555555555555';
const send = vi.fn<(message: MeetRealtimeClientMessage) => boolean>(() => true);
const host = {
  assessment: { responses: [], answers: {} },
  flashcards: { cards: [], progress: [] },
  game: { rounds: [] },
  icebreaker: { hidden: [] },
};

afterEach(() => {
  closeLiveActivitiesRoom(meetingId);
  send.mockClear();
});

it('reads once on admission and updates separate public and private views from room messages', () => {
  const room = liveActivitiesRoom(meetingId);
  const notify = vi.fn();
  const unsubscribe = room.subscribe(notify);
  const command = { kind: 'game.start' as const };
  expect(room.send(command)).toBe(false);
  handleLiveActivitiesMessage(
    meetingId,
    { type: 'admission.result', admitted: true, decidedBy: 'host' },
    send
  );
  expect(send).toHaveBeenCalledWith({ type: 'activity.read' });
  expect(room.send(command)).toBe(true);
  expect(send).toHaveBeenLastCalledWith({
    type: 'activity.command',
    command,
    requestId: expect.any(String),
  });

  const snapshot = {
    ...EMPTY_LIVE_ACTIVITIES_SNAPSHOT,
    icebreaker: { prompt: 'Hi', promptId: PROMPT, responses: [] },
  };
  const mine = {
    ...EMPTY_LIVE_ACTIVITIES_MINE,
    icebreaker: { text: 'My answer' },
  };
  handleLiveActivitiesMessage(
    meetingId,
    { type: 'activity.snapshot', snapshot },
    send
  );
  handleLiveActivitiesMessage(meetingId, { type: 'activity.mine', mine }, send);
  handleLiveActivitiesMessage(meetingId, { type: 'activity.host', host }, send);
  expect(notify).toHaveBeenCalledTimes(2);
  expect(room.read()).toEqual({ snapshot, mine, host: null, error: null });
  expect(liveActivitiesRoom('different-room').read().mine).toBe(
    EMPTY_LIVE_ACTIVITIES_MINE
  );

  handleLiveActivitiesMessage(meetingId, { type: 'room.ended' }, send);
  expect(notify).toHaveBeenCalledTimes(3);
  expect(room.read().snapshot).toBe(EMPTY_LIVE_ACTIVITIES_SNAPSHOT);
  expect(room.send(command)).toBe(false);
  unsubscribe();
});

it('shows a refusal of the last command only, and clears it with the next one', () => {
  const room = createLiveActivitiesStore();
  room.open(send);
  room.receive({ type: 'error', error: 'room_full', requestId: 'someone' });
  expect(room.read().error).toBeNull();
  room.send({ kind: 'game.start' });
  const requestId = (
    send.mock.calls.at(-1)?.[0] as { requestId?: string } | undefined
  )?.requestId;
  room.receive({ type: 'error', error: 'activity_rate_limited', requestId });
  expect(room.read().error).toBe('activity_rate_limited');
  room.send({ kind: 'game.start' });
  expect(room.read().error).toBeNull();
  room.close();
});

it('drops manager data on downgrade and re-reads when the transport opens again', () => {
  const room = createLiveActivitiesStore();
  room.setManager(true);
  room.open(send);
  room.receive({ type: 'activity.host', host });
  expect(room.read().host).toEqual(host);
  room.setManager(false);
  expect(room.read().host).toBeNull();
  room.receive({ type: 'activity.host', host });
  expect(room.read().host).toBeNull();
  room.close();
  room.open(send);
  expect(send.mock.calls.map(([message]) => message)).toEqual([
    { type: 'activity.read' },
    { type: 'activity.read' },
  ]);
});
