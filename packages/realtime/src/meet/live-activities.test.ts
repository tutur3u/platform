import { describe, expect, it, vi } from 'vitest';
import { MeetCommandExecutor } from './command-executor';
import {
  liveActivityCommandSchema,
  malformedMeetEventReply,
} from './live-activities';
import {
  action,
  cohost,
  error,
  guest,
  host,
  now,
  other,
  read,
  room,
} from './live-activities.fixtures';
import {
  LIVE_ACTIVITY_ACTIONS_PER_MINUTE,
  serializedMeetBytes,
} from './live-activity-rate';
import { meetRealtimeClientMessageSchema } from './messages';
import { receivesMeetManagerMessage } from './permissions';
import {
  createMeetRoomSnapshot,
  createMeetRoomSocketDelivery,
  type MeetRoomSnapshot,
  type MeetRoomSocketAttachment,
} from './room';
import { endMeetRoom } from './room-ending';

describe('flashcards', () => {
  it('synchronizes the shown card and keeps individual known cards private', () => {
    const initial = room();
    const cards = [{ front: ' Question ', back: ' Answer ' }];
    expect(
      action(initial, guest, { kind: 'flashcards.set', cards }).reply
    ).toMatchObject(error('permission_denied'));
    const set = action(initial, host, { kind: 'flashcards.set', cards });
    const card = set.state.liveActivities?.flashcards.cards[0];
    expect(card).toMatchObject({ front: 'Question', back: 'Answer' });
    const shown = action(set.state, cohost, {
      kind: 'flashcards.show',
      cardId: card?.id,
      index: 0,
      flipped: true,
    });
    expect(shown.broadcast).toMatchObject([
      { snapshot: { flashcards: { index: 0, flipped: true } } },
    ]);
    const marked = action(shown.state, guest, {
      kind: 'flashcards.mark',
      cardId: card?.id,
      known: true,
    });
    expect(marked.reply).toMatchObject([
      { mine: { flashcards: { known: [card?.id] } } },
    ]);
    // A mark shares nothing new with the room: managers get a small update.
    expect(marked.broadcast).toEqual([]);
    expect(marked.toManagers).toEqual([
      {
        type: 'activity.progress',
        flashcards: { participantId: guest.userId, known: 1 },
      },
    ]);
    expect(read(marked.state, host).reply).toMatchObject([
      {},
      {},
      {
        host: {
          flashcards: { progress: [{ participantId: guest.userId, known: 1 }] },
        },
      },
    ]);
    expect(read(marked.state, other).reply).toMatchObject([
      {},
      { mine: { flashcards: { known: [] } } },
    ]);
    expect(
      action(marked.state, host, { kind: 'flashcards.set', cards: [] }).direct
    ).toMatchObject([
      {
        userId: guest.userId,
        message: { mine: { flashcards: { known: [] } } },
      },
    ]);
  });

  it('keeps every back with managers until the host flips that card for the room', () => {
    const cards = [
      { front: 'First front', back: 'First back' },
      { front: 'Second front', back: 'Second back' },
    ];
    const set = action(room(), host, { kind: 'flashcards.set', cards });
    const deck = set.state.liveActivities!.flashcards.cards;
    const full = deck.map(({ id, front, back }) => ({ id, front, back }));
    const fronts = deck.map(({ id, front }) => ({ id, front }));
    const publicCards = (state: MeetRoomSnapshot, token: typeof host) => {
      const [first] = read(state, token).reply;
      if (first?.type !== 'activity.snapshot') throw new Error('No snapshot');
      return first.snapshot.flashcards.cards;
    };
    const seenByRoom = (outcome: ReturnType<typeof action>) =>
      JSON.stringify([outcome.broadcast, read(outcome.state, guest).reply]);

    // Saved but not flipped: the room has fronts only, on the wire and on read.
    expect(set.broadcast).toEqual([
      {
        type: 'activity.snapshot',
        snapshot: expect.objectContaining({
          flashcards: { cards: fronts, index: 0, flipped: false },
        }),
      },
    ]);
    expect(seenByRoom(set)).not.toMatch(/First back|Second back|"back"/);
    expect(set.toManagers).toMatchObject([
      { host: { flashcards: { cards: full } } },
    ]);

    // Flipped: exactly the card on show carries its back.
    const flipped = action(set.state, host, {
      kind: 'flashcards.show',
      cardId: deck[0]?.id,
      index: 0,
      flipped: true,
    });
    expect(publicCards(flipped.state, guest)).toEqual([full[0], fronts[1]]);
    expect(seenByRoom(flipped)).toContain('First back');
    expect(seenByRoom(flipped)).not.toContain('Second back');

    // Moving on hides the first back again and does not reveal the next one.
    const moved = action(flipped.state, cohost, {
      kind: 'flashcards.show',
      cardId: deck[1]?.id,
      index: 1,
      flipped: false,
    });
    expect(publicCards(moved.state, guest)).toEqual(fronts);
    expect(seenByRoom(moved)).not.toMatch(/First back|Second back|"back"/);

    // Un-flipping the card on show takes its back away as well.
    const shown = action(moved.state, host, {
      kind: 'flashcards.show',
      cardId: deck[1]?.id,
      index: 1,
      flipped: true,
    });
    expect(publicCards(shown.state, other)).toEqual([fronts[0], full[1]]);
    const hidden = action(shown.state, host, {
      kind: 'flashcards.show',
      cardId: deck[1]?.id,
      index: 1,
      flipped: false,
    });
    expect(seenByRoom(hidden)).not.toMatch(/First back|Second back|"back"/);

    // Managers have the whole deck at every step; nobody else gets that view.
    for (const step of [set, flipped, moved, shown, hidden]) {
      expect(read(step.state, cohost).reply).toMatchObject([
        {},
        {},
        { type: 'activity.host', host: { flashcards: { cards: full } } },
      ]);
      expect(
        read(step.state, guest).reply.map(({ type }) => type)
      ).not.toContain('activity.host');
    }
  });

  it('refuses a reveal for a card that a newer deck replaced at that position', () => {
    const save = (state: MeetRoomSnapshot, back: string) =>
      action(state, host, {
        kind: 'flashcards.set',
        cards: [{ front: 'Front', back }],
      }).state;
    const first = save(room(), 'First back');
    const seen = first.liveActivities?.flashcards.cards[0]?.id;
    // Another manager saves a new deck before the reveal arrives.
    const second = save(first, 'Second back');
    const late = action(second, cohost, {
      kind: 'flashcards.show',
      cardId: seen,
      index: 0,
      flipped: true,
    });
    expect(late.reply).toMatchObject(error('activity_card_changed'));
    expect(late.state).toBe(second);
    expect(late.broadcast).toEqual([]);
    expect(JSON.stringify(read(second, guest).reply)).not.toContain(
      'Second back'
    );
    // The same reveal for the card that is there now goes through.
    const current = second.liveActivities?.flashcards.cards[0]?.id;
    expect(
      JSON.stringify(
        action(second, cohost, {
          kind: 'flashcards.show',
          cardId: current,
          index: 0,
          flipped: true,
        }).broadcast
      )
    ).toContain('Second back');
  });

  it('projects a deck stored before backs were withheld without exposing it', () => {
    const stored: MeetRoomSnapshot = {
      ...room(),
      liveActivities: {
        assessment: {
          status: 'draft',
          released: false,
          items: [],
          responses: [],
        },
        flashcards: {
          cards: [
            { id: crypto.randomUUID(), front: 'Old front', back: 'Old back' },
          ],
          index: 0,
          flipped: false,
          progress: {},
        },
        game: { phase: 'idle', rounds: [], scores: {} },
        icebreaker: { prompt: null, responses: [] },
      },
    };
    const guestRead = JSON.stringify(read(stored, guest).reply);
    expect(guestRead).toContain('Old front');
    expect(guestRead).not.toContain('Old back');
    expect(JSON.stringify(read(stored, host).reply)).toContain('Old back');
  });
});

it('validates per-activity caps and option bounds at the wire boundary', () => {
  const card = { front: 'A', back: 'B' };
  const item = { prompt: 'Q', kind: 'short' };
  const round = { prompt: 'Q', options: ['A', 'B'], answer: 0, seconds: 5 };
  expect(
    [
      { kind: 'assessment.set', items: Array.from({ length: 21 }, () => item) },
      { kind: 'flashcards.set', cards: Array.from({ length: 61 }, () => card) },
      { kind: 'game.set', rounds: Array.from({ length: 31 }, () => round) },
      { kind: 'game.set', rounds: [{ ...round, answer: 2 }] },
      {
        kind: 'icebreaker.respond',
        promptId: crypto.randomUUID(),
        text: 'a'.repeat(201),
      },
    ].map((command) => liveActivityCommandSchema.safeParse(command).success)
  ).toEqual([false, false, false, false, false]);
});

it('loads an old snapshot, refuses absent participants, and clears state when the room ends', () => {
  const old = room();
  expect(old.liveActivities).toBeUndefined();
  expect(read(old, guest).reply).toMatchObject([
    {
      requestId: 'read',
      snapshot: {
        assessment: { status: 'draft', items: [] },
        flashcards: { cards: [] },
        game: { phase: 'idle' },
        icebreaker: { prompt: null },
      },
    },
    { type: 'activity.mine' },
  ]);
  expect(read(createMeetRoomSnapshot(), guest).reply).toMatchObject(
    error('awaiting_admission')
  );
  const active = action(old, cohost, {
    kind: 'icebreaker.prompt',
    text: 'Hi?',
  }).state;
  const ended = endMeetRoom(active, now);
  expect(ended.liveActivities).toBeUndefined();
  expect(ended.liveActivityLimits).toBeUndefined();
  expect(read(ended, host).reply).toMatchObject(error('awaiting_admission'));
});

it('limits accepted mutations per account and resumes after expiry', () => {
  let state = room();
  for (let index = 0; index < LIVE_ACTIVITY_ACTIONS_PER_MINUTE; index++)
    state = action(state, host, {
      kind: 'icebreaker.prompt',
      text: String(index),
    }).state;
  const command = { kind: 'icebreaker.prompt', text: 'New' };
  expect(action(state, host, command).reply).toMatchObject(
    error('activity_rate_limited')
  );
  expect(action(state, host, command, 60_000).state).not.toBe(state);
});

it('routes reads through the executor without a storage commit', async () => {
  const commit = vi.fn();
  const replyOnly = vi.fn();
  const state = room();
  await new MeetCommandExecutor().run(
    { token: guest, now, message: { type: 'activity.read' } },
    {
      read: () => state,
      commit,
      replyOnly,
      runSfu: vi.fn(),
    }
  );
  expect(commit).not.toHaveBeenCalled();
  expect(replyOnly).toHaveBeenCalledWith([
    expect.objectContaining({ type: 'activity.snapshot' }),
    expect.objectContaining({ type: 'activity.mine' }),
  ]);
});

it('rechecks manager and actor admission at socket delivery', () => {
  const socket = (token: typeof host) => ({
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(),
    deserializeAttachment: () => ({ token }),
    serializeAttachment: vi.fn<(value: MeetRoomSocketAttachment) => void>(),
  });
  const manager = socket(cohost);
  const participant = socket(guest);
  const absent = socket({ ...cohost, userId: crypto.randomUUID() });
  const state = room();
  const delivery = createMeetRoomSocketDelivery({
    sockets: () => [manager, participant, absent],
    read: () => state,
    fullPresence: () => ({ type: 'room.ended' }),
    announcements: () => [],
  });
  const managerRead = read(state, cohost).reply;
  delivery.sendToManagers(
    managerRead.filter(({ type }) => type === 'activity.host')
  );
  expect(manager.send).toHaveBeenCalledTimes(1);
  expect(participant.send).not.toHaveBeenCalled();
  expect(absent.send).not.toHaveBeenCalled();
  // A workspace co-host gets the activity view and no other manager notice.
  delivery.sendToManagers([
    { type: 'room.title.changed', title: 'Managers only' },
  ]);
  expect(manager.send).toHaveBeenCalledTimes(1);
  delivery.sendToUser(
    absent.deserializeAttachment().token.userId,
    managerRead.filter(({ type }) => type === 'activity.mine')
  );
  expect(absent.send).not.toHaveBeenCalled();
});

it('lets a workspace co-host run activities with the token the join route mints', () => {
  // No participant-management scope: only the role and the co-host scope.
  expect(cohost.role).toBe('speaker');
  expect(cohost.scopes).not.toContain('participants:manage');
  const deck = action(room(), cohost, {
    kind: 'flashcards.set',
    cards: [{ front: 'Front', back: 'Back' }],
  });
  expect(deck.state.liveActivities?.flashcards.cards).toHaveLength(1);
  const game = action(deck.state, cohost, {
    kind: 'game.set',
    rounds: [
      { prompt: 'Ready?', options: ['Yes', 'No'], answer: 0, seconds: 10 },
    ],
  });
  expect(game.state.liveActivities?.game.rounds).toHaveLength(1);
  expect(read(game.state, cohost).reply.map(({ type }) => type)).toContain(
    'activity.host'
  );
  // A participant with the same speaker scopes stays a participant.
  expect(action(game.state, guest, { kind: 'game.start' }).reply).toMatchObject(
    error('permission_denied')
  );
  expect(read(game.state, guest).reply.map(({ type }) => type)).not.toContain(
    'activity.host'
  );
});

it('gives managers the answer keys and prepared rounds, and nobody else', () => {
  const set = action(room(), host, {
    kind: 'assessment.set',
    items: [
      { prompt: 'Pick one', kind: 'choice', options: ['a', 'b'], answer: 1 },
    ],
  });
  const itemId = set.state.liveActivities!.assessment.items[0]!.id;
  expect(set.toManagers).toMatchObject([
    {
      type: 'activity.host',
      host: { assessment: { answers: { [itemId]: 1 } } },
    },
  ]);
  const prepared = action(set.state, cohost, {
    kind: 'game.set',
    rounds: [
      { prompt: 'Round one', options: ['x', 'y'], answer: 0, seconds: 10 },
    ],
  });
  expect(prepared.toManagers).toMatchObject([
    {
      host: {
        game: { rounds: [{ prompt: 'Round one', answer: 0, seconds: 10 }] },
      },
    },
  ]);
  expect(JSON.stringify(prepared.broadcast)).not.toMatch(
    /"answer"|"answers"|"correct"|"rounds"|Round one/
  );
  expect(JSON.stringify(read(prepared.state, guest).reply)).not.toMatch(
    /activity\.host|"answers"|"rounds"|Round one/
  );
  expect(read(prepared.state, cohost).reply).toMatchObject([
    {},
    {},
    {
      type: 'activity.host',
      host: {
        assessment: { answers: { [itemId]: 1 } },
        game: { rounds: [{ answer: 0 }] },
      },
    },
  ]);
});

it('delivers manager messages by one rule on every transport', () => {
  const view = { type: 'activity.host' };
  const notice = { type: 'room.title.changed' };
  // Hosts manage participants: everything for managers reaches them.
  expect(receivesMeetManagerMessage(host, view)).toBe(true);
  expect(receivesMeetManagerMessage(host, notice)).toBe(true);
  // A workspace co-host gets the activity view and nothing else.
  expect(receivesMeetManagerMessage(cohost, view)).toBe(true);
  expect(receivesMeetManagerMessage(cohost, notice)).toBe(false);
  expect(receivesMeetManagerMessage(guest, view)).toBe(false);
  expect(receivesMeetManagerMessage(guest, notice)).toBe(false);
});

it("refuses an activity frame it cannot read under the sender's request id", () => {
  // What a page from before reveals named their card would send.
  const outdated = {
    type: 'activity.command',
    requestId: 'request-1',
    command: { kind: 'flashcards.show', index: 0, flipped: true },
  };
  expect(meetRealtimeClientMessageSchema.safeParse(outdated).success).toBe(
    false
  );
  expect(malformedMeetEventReply(outdated)).toEqual({
    type: 'error',
    error: 'malformed_event',
    requestId: 'request-1',
  });
  // An id the room would not accept is not echoed, and neither is the id of
  // a frame that is not about activities.
  for (const frame of [
    { ...outdated, requestId: 'x'.repeat(121) },
    { ...outdated, requestId: 7 },
    { ...outdated, type: 'chat.send' },
    'not an object',
    null,
  ])
    expect(malformedMeetEventReply(frame)).toEqual({
      type: 'error',
      error: 'malformed_event',
    });
});

it('keeps what one flashcard mark sends small, however large the room and the deck', () => {
  const socket = (token: typeof host) => ({
    readyState: 1,
    send: vi.fn<(wire: string) => void>(),
    close: vi.fn(),
    deserializeAttachment: () => ({ token }),
    serializeAttachment: vi.fn<(value: MeetRoomSocketAttachment) => void>(),
  });
  // A full deck with the longest sides, so the shared views are large.
  const cards = Array.from({ length: 60 }, (_, index) => ({
    front: `${index} ${'f'.repeat(190)}`,
    back: `${index} ${'b'.repeat(390)}`,
  }));
  const set = action(room(), host, { kind: 'flashcards.set', cards });
  const full =
    serializedMeetBytes(set.broadcast) + serializedMeetBytes(set.toManagers);
  expect(full).toBeGreaterThan(30_000);
  const cardId = set.state.liveActivities?.flashcards.cards[0]?.id;

  // The marker, three other sockets of people in the room and two managers.
  const marker = socket(guest);
  const others = [socket(other), socket(other), socket(other)];
  const managers = [socket(host), socket(cohost)];
  const marked = action(set.state, guest, {
    kind: 'flashcards.mark',
    cardId,
    known: true,
  });
  const delivery = createMeetRoomSocketDelivery({
    sockets: () => [marker, ...others, ...managers],
    read: () => marked.state,
    fullPresence: () => ({ type: 'room.ended' }),
    announcements: () => [],
  });
  // Delivered the way the room flushes an outcome.
  delivery.sendToSocket(marker, marked.reply);
  delivery.broadcast(marked.broadcast);
  delivery.sendToManagers(marked.toManagers);
  for (const entry of marked.direct)
    delivery.sendToUser(entry.userId, [entry.message]);
  const bytes = (sockets: ReturnType<typeof socket>[]) =>
    sockets
      .flatMap(({ send }) => send.mock.calls)
      .reduce((sum, [wire]) => sum + new TextEncoder().encode(wire).length, 0);

  // Nobody else in the room receives anything for someone's mark.
  expect(bytes(others)).toBe(0);
  // The marker gets their own small view, each manager a small update.
  expect(marker.send).toHaveBeenCalledTimes(1);
  for (const manager of managers) expect(manager.send).toHaveBeenCalledTimes(1);
  expect(bytes([marker])).toBeLessThan(600);
  expect(bytes(managers)).toBeLessThan(2 * 200);
  expect(bytes([marker, ...others, ...managers])).toBeLessThan(1_000);
  // No frame carries the deck again.
  expect(
    JSON.stringify([marked.reply, marked.broadcast, marked.toManagers])
  ).not.toMatch(/ffffffff|bbbbbbbb/);
});
