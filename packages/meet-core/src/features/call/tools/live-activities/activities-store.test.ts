import {
  EMPTY_LIVE_ACTIVITIES_MINE,
  EMPTY_LIVE_ACTIVITIES_SNAPSHOT,
  type MeetRealtimeClientMessage,
  type MeetRealtimeServerMessage,
} from '@tuturuuu/realtime/meet';
import { afterEach, expect, it, vi } from 'vitest';
import {
  handleLiveActivitiesMessage,
  handleLiveActivitiesTransport,
} from './activities-handler';
import {
  closeLiveActivitiesRoom,
  createLiveActivitiesStore,
  LIVE_ACTIVITIES_READ_DEADLINE_MS,
  LIVE_ACTIVITIES_READ_RETRY_MS,
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
const snapshot = {
  ...EMPTY_LIVE_ACTIVITIES_SNAPSHOT,
  icebreaker: { prompt: 'Hi', promptId: PROMPT, responses: [] },
};
const mine = {
  ...EMPTY_LIVE_ACTIVITIES_MINE,
  icebreaker: { promptId: PROMPT, text: 'My answer' },
};
const command = { kind: 'game.start' as const };
type Store = ReturnType<typeof createLiveActivitiesStore>;

// The room's greeting after every connect; only these fields matter here.
const ready = (admission: 'admitted' | 'waiting') =>
  ({
    type: 'ready',
    role: 'host',
    userId: 'self',
    roomId: 'room',
    admission,
  }) as unknown as MeetRealtimeServerMessage;
const reads = () =>
  send.mock.calls.flatMap(([message]) =>
    message.type === 'activity.read' ? [message] : []
  );
const commands = () =>
  send.mock.calls.flatMap(([message]) =>
    message.type === 'activity.command' ? [message] : []
  );
const readId = () => reads().at(-1)?.requestId;
/** The room's answer to the store's last read. */
const answer = (room: Store, state = snapshot) =>
  room.receive({
    type: 'activity.snapshot',
    snapshot: state,
    requestId: readId(),
  });

afterEach(() => {
  closeLiveActivitiesRoom(meetingId);
  send.mockClear();
  vi.useRealTimers();
});

it('reads once on admission and updates separate public and private views from room messages', () => {
  const room = liveActivitiesRoom(meetingId);
  const notify = vi.fn();
  const unsubscribe = room.subscribe(notify);
  expect(room.send(command)).toBe(false);
  expect(notify).not.toHaveBeenCalled();
  handleLiveActivitiesMessage(
    meetingId,
    { type: 'admission.result', admitted: true, decidedBy: 'host' },
    send
  );
  expect(reads()).toEqual([
    { type: 'activity.read', requestId: expect.any(String) },
  ]);

  handleLiveActivitiesMessage(
    meetingId,
    { type: 'activity.snapshot', snapshot, requestId: readId() },
    send
  );
  handleLiveActivitiesMessage(meetingId, { type: 'activity.mine', mine }, send);
  handleLiveActivitiesMessage(meetingId, { type: 'activity.host', host }, send);
  expect(notify).toHaveBeenCalledTimes(2);
  expect(room.read()).toEqual({
    snapshot,
    mine,
    host: null,
    error: null,
    stale: false,
  });
  expect(liveActivitiesRoom('different-room').read().mine).toBe(
    EMPTY_LIVE_ACTIVITIES_MINE
  );
  expect(room.send(command)).toBe(true);
  expect(send).toHaveBeenLastCalledWith({
    type: 'activity.command',
    command,
    requestId: expect.any(String),
  });

  handleLiveActivitiesMessage(meetingId, { type: 'room.ended' }, send);
  expect(notify).toHaveBeenCalledTimes(3);
  expect(room.read().snapshot).toBe(EMPTY_LIVE_ACTIVITIES_SNAPSHOT);
  expect(room.send(command)).toBe(false);
  unsubscribe();
});

it('shows a refusal of the last command only, and clears it with the next one', () => {
  const room = createLiveActivitiesStore();
  room.open(send);
  answer(room);
  room.receive({ type: 'error', error: 'room_full', requestId: 'someone' });
  expect(room.read().error).toBeNull();
  room.send(command);
  const requestId = commands().at(-1)?.requestId;
  room.receive({ type: 'error', error: 'activity_rate_limited', requestId });
  expect(room.read().error).toBe('activity_rate_limited');
  room.send(command);
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
  expect(reads()).toHaveLength(2);
  expect(reads()[0]?.requestId).not.toBe(reads()[1]?.requestId);
  room.close();
});

it('keeps the last state through a reconnect, inert until the room answers the new read', () => {
  const room = liveActivitiesRoom(meetingId);
  handleLiveActivitiesMessage(meetingId, ready('admitted'), send);
  answer(room);
  room.receive({ type: 'activity.mine', mine });
  room.receive({ type: 'activity.host', host });
  const before = room.read();
  expect(before).toEqual({ snapshot, mine, host, error: null, stale: false });

  handleLiveActivitiesTransport(meetingId, 'reconnecting');
  expect(room.read()).toEqual({ ...before, stale: true });
  // Nothing can be sent meanwhile, and the person is told why.
  send.mockClear();
  expect(room.send(command)).toBe(false);
  expect(send).not.toHaveBeenCalled();
  expect(room.read()).toEqual({
    ...before,
    stale: true,
    error: 'activity_offline',
  });

  // The socket is back and the person is admitted, but what is on screen is
  // still the cached state: its controls stay inert until the read returns.
  handleLiveActivitiesTransport(meetingId, 'open');
  handleLiveActivitiesMessage(meetingId, ready('admitted'), send);
  expect(reads()).toHaveLength(1);
  expect(room.read().stale).toBe(true);
  expect(room.send(command)).toBe(false);
  // A broadcast is not the answer to this connection's read.
  room.receive({ type: 'activity.snapshot', snapshot });
  expect(room.send(command)).toBe(false);
  expect(commands()).toEqual([]);
  expect(reads()).toHaveLength(1);

  const next = {
    ...snapshot,
    icebreaker: { ...snapshot.icebreaker, prompt: 'Next' },
  };
  answer(room, next);
  expect(room.read()).toEqual({ ...before, snapshot: next });
  expect(room.send(command)).toBe(true);
  expect(commands()).toHaveLength(1);
});

it('says why a read was refused, asks again and stays inert until it is answered', () => {
  vi.useFakeTimers();
  const room = createLiveActivitiesStore();
  room.open(send);
  const refused = readId();
  room.receive({
    type: 'error',
    error: 'activity_read_rate_limited',
    requestId: refused,
  });
  expect(room.read().error).toBe('activity_read_rate_limited');
  // A retry is already scheduled, so acting now does not send another read.
  expect(room.send(command)).toBe(false);
  expect(reads()).toHaveLength(1);
  vi.advanceTimersByTime(LIVE_ACTIVITIES_READ_RETRY_MS[0]);
  expect(reads()).toHaveLength(2);
  expect(readId()).not.toBe(refused);

  // Only the answer to the read in flight confirms the state.
  room.receive({ type: 'activity.snapshot', snapshot, requestId: refused });
  expect(room.send(command)).toBe(false);
  answer(room);
  expect(room.read()).toMatchObject({ snapshot, error: null, stale: false });
  expect(room.send(command)).toBe(true);
  expect(commands()).toHaveLength(1);
  room.close();
});

it('asks again when the person acts after the automatic retries ran out', () => {
  vi.useFakeTimers();
  const room = createLiveActivitiesStore();
  room.open(send);
  const refuse = () =>
    room.receive({
      type: 'error',
      error: 'activity_read_rate_limited',
      requestId: readId(),
    });
  for (const delay of LIVE_ACTIVITIES_READ_RETRY_MS) {
    refuse();
    vi.advanceTimersByTime(delay);
  }
  const automatic = LIVE_ACTIVITIES_READ_RETRY_MS.length + 1;
  expect(reads()).toHaveLength(automatic);
  refuse();
  vi.advanceTimersByTime(60_000);
  expect(reads()).toHaveLength(automatic);
  expect(room.read().error).toBe('activity_read_rate_limited');
  expect(room.send(command)).toBe(false);
  expect(reads()).toHaveLength(automatic + 1);
  room.close();
});

it('clears the state when the transport gives up or the reconnect lands in the waiting room', () => {
  for (const end of [
    () => handleLiveActivitiesTransport(meetingId, 'error'),
    () => handleLiveActivitiesTransport(meetingId, 'closed'),
    () => handleLiveActivitiesMessage(meetingId, ready('waiting'), send),
  ]) {
    handleLiveActivitiesMessage(meetingId, ready('admitted'), send);
    const room = liveActivitiesRoom(meetingId);
    answer(room);
    room.receive({ type: 'activity.host', host });
    handleLiveActivitiesTransport(meetingId, 'reconnecting');
    expect(room.read().snapshot).toBe(snapshot);
    end();
    expect(room.read()).toEqual({
      snapshot: EMPTY_LIVE_ACTIVITIES_SNAPSHOT,
      mine: EMPTY_LIVE_ACTIVITIES_MINE,
      host: null,
      error: null,
      stale: false,
    });
    // A room that was cleared says nothing about reconnecting.
    expect(room.send(command)).toBe(false);
    expect(room.read().error).toBeNull();
  }
});

it('treats a read the room never answers as refused, so later clicks are not lost', () => {
  vi.useFakeTimers();
  const room = createLiveActivitiesStore();
  room.open(send);
  const unanswered = readId();
  expect(room.send(command)).toBe(false);
  vi.advanceTimersByTime(LIVE_ACTIVITIES_READ_DEADLINE_MS - 1);
  expect(reads()).toHaveLength(1);
  expect(room.read().error).toBe('activity_offline');
  // The deadline passes: the person is told, and the read goes out again.
  vi.advanceTimersByTime(1);
  expect(room.read().error).toBe('activity_read_timeout');
  vi.advanceTimersByTime(LIVE_ACTIVITIES_READ_RETRY_MS[0]);
  expect(reads()).toHaveLength(2);
  expect(readId()).not.toBe(unanswered);
  // A late answer to the first read does not count; the second one does.
  room.receive({ type: 'activity.snapshot', snapshot, requestId: unanswered });
  expect(room.send(command)).toBe(false);
  answer(room);
  expect(room.read()).toMatchObject({ error: null, stale: false });
  expect(room.send(command)).toBe(true);
  // An answered read leaves no deadline behind.
  vi.advanceTimersByTime(LIVE_ACTIVITIES_READ_DEADLINE_MS * 2);
  expect(reads()).toHaveLength(2);
  expect(room.read().error).toBeNull();
  room.close();
});

it('folds a flashcard progress update into the manager view, for managers only', () => {
  const ANA = '22222222-2222-4222-8222-222222222222';
  const BEN = '33333333-3333-4333-8333-333333333333';
  const update = (participantId: string, known: number) =>
    handleLiveActivitiesMessage(
      meetingId,
      { type: 'activity.progress', flashcards: { participantId, known } },
      send
    );
  const progress = () => room.read().host?.flashcards.progress;
  handleLiveActivitiesMessage(meetingId, ready('admitted'), send);
  const room = liveActivitiesRoom(meetingId);
  answer(room);
  // Without a manager view there is nothing to fold into.
  update(ANA, 1);
  expect(room.read().host).toBeNull();
  room.receive({ type: 'activity.host', host });
  update(ANA, 1);
  update(BEN, 2);
  update(ANA, 3);
  expect(progress()).toEqual([
    { participantId: BEN, known: 2 },
    { participantId: ANA, known: 3 },
  ]);
  // Someone who knows no card any more leaves the list.
  update(BEN, 0);
  expect(progress()).toEqual([{ participantId: ANA, known: 3 }]);
  // A participant never holds progress of others.
  room.setManager(false);
  update(BEN, 4);
  expect(room.read().host).toBeNull();
});
