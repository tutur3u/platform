import { describe, expect, it, vi } from 'vitest';
import { MeetCommandExecutor } from './command-executor';
import {
  applyLiveActivities,
  LIVE_ACTIVITY_LIMITS,
  liveActivityCommandSchema,
} from './live-activities';
import {
  LIVE_ACTIVITY_ACTIONS_PER_MINUTE,
  serializedMeetBytes,
} from './live-activity-rate';
import { MEET_MAX_MESSAGE_BYTES } from './message-size';
import { meetRealtimeClientMessageSchema } from './messages';
import { meetRealtimeTokenPayloadSchema } from './primitives';
import {
  createMeetPresence,
  createMeetRoomSnapshot,
  createMeetRoomSocketDelivery,
  type MeetRoomSnapshot,
  type MeetRoomSocketAttachment,
} from './room';
import { endMeetRoom } from './room-ending';

const time = Date.parse('2026-11-22T08:00:00Z');
const now = new Date(time).toISOString();
const host = meetRealtimeTokenPayloadSchema.parse({
  roomId: 'room-activities',
  wsId: crypto.randomUUID(),
  meetingId: crypto.randomUUID(),
  userId: crypto.randomUUID(),
  role: 'host',
  exp: 2_000_000_000,
});
const guest = { ...host, role: 'viewer' as const, userId: crypto.randomUUID() };
const other = { ...guest, userId: crypto.randomUUID() };
const cohost = {
  ...guest,
  userId: crypto.randomUUID(),
  scopes: ['participants:manage'],
};
const room = () => ({
  ...createMeetRoomSnapshot(),
  presence: Object.fromEntries(
    [host, guest, other, cohost].map((token) => [
      token.userId,
      createMeetPresence(token, now),
    ])
  ),
});
const run = (
  state: MeetRoomSnapshot,
  token: typeof host,
  input: unknown,
  offset = 0
) => {
  const message = meetRealtimeClientMessageSchema.parse(input);
  const result = applyLiveActivities(state, {
    message,
    token,
    now: new Date(time + offset).toISOString(),
  });
  if (!result) throw new Error('Expected an activity outcome');
  return result;
};
const action = (
  state: MeetRoomSnapshot,
  token: typeof host,
  command: unknown,
  offset?: number
) => run(state, token, { type: 'activity.command', command }, offset);
const read = (state: MeetRoomSnapshot, token: typeof host) =>
  run(state, token, { type: 'activity.read', requestId: 'read' });
const error = (name: string) => [{ type: 'error', error: name }];

describe('assessment', () => {
  const items = [
    { prompt: ' Question ', kind: 'choice', options: [' A ', 'B'], answer: 1 },
    { prompt: 'Explain', kind: 'long' },
  ];
  it('gates host actions, replaces submissions, and releases only the actor’s grade', () => {
    const initial = room();
    expect(
      action(initial, guest, { kind: 'assessment.set', items }).reply
    ).toMatchObject(error('permission_denied'));
    const configured = action(initial, cohost, {
      kind: 'assessment.set',
      items,
    });
    const snapshot = configured.broadcast.find(
      (frame) => frame.type === 'activity.snapshot'
    )?.snapshot;
    const [question, long] = snapshot?.assessment.items ?? [];
    expect(question).toEqual({
      id: expect.any(String),
      prompt: 'Question',
      kind: 'choice',
      options: ['A', 'B'],
    });
    if (!question || !long) throw new Error('Missing configured items');
    const open = action(configured.state, host, {
      kind: 'assessment.status',
      status: 'open',
    }).state;
    expect(
      action(open, host, { kind: 'assessment.set', items }).reply
    ).toMatchObject(error('activity_assessment_not_draft'));
    expect(
      action(open, guest, {
        kind: 'assessment.submit',
        itemId: question.id,
        choice: 2,
      }).reply
    ).toMatchObject(error('activity_invalid_answer'));

    const submitted = action(open, guest, {
      kind: 'assessment.submit',
      itemId: long.id,
      answer: 'old answer',
    });
    const replaced = action(submitted.state, guest, {
      kind: 'assessment.submit',
      itemId: long.id,
      answer: ' private answer ',
    });
    const graded = action(replaced.state, cohost, {
      kind: 'assessment.grade',
      itemId: long.id,
      participantId: guest.userId,
      score: 85,
      feedback: 'Private feedback',
    });
    expect(graded.broadcast).toMatchObject([
      { snapshot: { assessment: { counts: { [long.id]: 1 } } } },
    ]);
    expect(graded.toManagers).toMatchObject([
      {
        type: 'activity.host',
        host: {
          assessment: {
            responses: [
              {
                answer: 'private answer',
                score: 85,
                feedback: 'Private feedback',
              },
            ],
          },
        },
      },
    ]);
    expect(JSON.stringify(graded.broadcast)).not.toMatch(
      /correct|private answer|Private feedback/
    );
    expect(JSON.stringify(read(graded.state, other).reply)).not.toMatch(
      /correct|private answer|Private feedback|activity.host/
    );
    expect(JSON.stringify(read(graded.state, guest).reply)).toContain(
      'private answer'
    );
    expect(JSON.stringify(read(graded.state, guest).reply)).not.toContain(
      'Private feedback'
    );

    const released = action(graded.state, host, {
      kind: 'assessment.release',
      released: true,
    });
    expect(released.broadcast).toMatchObject([
      {
        snapshot: {
          assessment: {
            released: true,
            items: [{ correct: 1 }, { id: long.id }],
          },
        },
      },
    ]);
    expect(released.direct).toMatchObject([
      {
        userId: guest.userId,
        message: {
          type: 'activity.mine',
          mine: {
            assessment: {
              [long.id]: { score: 85, feedback: 'Private feedback' },
            },
          },
        },
      },
    ]);
    expect(JSON.stringify(read(released.state, other).reply)).not.toContain(
      'private answer'
    );
    const draft = action(released.state, host, {
      kind: 'assessment.status',
      status: 'draft',
    });
    expect(draft.direct).toMatchObject([
      { userId: guest.userId, message: { mine: { assessment: {} } } },
    ]);
    expect(draft.state.liveActivities?.assessment).toMatchObject({
      released: false,
      responses: [],
    });
  });

  it('rejects aggregate escaped JSON beyond the view budget without changing state', () => {
    const configured = action(room(), host, {
      kind: 'assessment.set',
      items: Array.from({ length: 20 }, () => ({
        prompt: 'Response',
        kind: 'long',
      })),
    }).state;
    let state = action(configured, host, {
      kind: 'assessment.status',
      status: 'open',
    }).state;
    let blocked = 0;
    for (const item of state.liveActivities?.assessment.items ?? []) {
      const result = action(state, guest, {
        kind: 'assessment.submit',
        itemId: item.id,
        answer: '\u0000'.repeat(2000),
      });
      if (result.state === state) {
        expect(result.reply).toMatchObject(error('activity_full'));
        blocked++;
      }
      state = result.state;
      for (const frame of [
        ...result.reply,
        ...result.broadcast,
        ...result.toManagers,
      ])
        expect(serializedMeetBytes(frame)).toBeLessThan(MEET_MAX_MESSAGE_BYTES);
    }
    expect(blocked).toBeGreaterThan(0);
    expect(serializedMeetBytes(state.liveActivities)).toBeLessThan(
      LIVE_ACTIVITY_LIMITS.stateBytes
    );
  });
});

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
    expect(marked.toManagers).toMatchObject([
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
      index: 0,
      flipped: true,
    });
    expect(publicCards(flipped.state, guest)).toEqual([full[0], fronts[1]]);
    expect(seenByRoom(flipped)).toContain('First back');
    expect(seenByRoom(flipped)).not.toContain('Second back');

    // Moving on hides the first back again and does not reveal the next one.
    const moved = action(flipped.state, cohost, {
      kind: 'flashcards.show',
      index: 1,
      flipped: false,
    });
    expect(publicCards(moved.state, guest)).toEqual(fronts);
    expect(seenByRoom(moved)).not.toMatch(/First back|Second back|"back"/);

    // Un-flipping the card on show takes its back away as well.
    const shown = action(moved.state, host, {
      kind: 'flashcards.show',
      index: 1,
      flipped: true,
    });
    expect(publicCards(shown.state, other)).toEqual([fronts[0], full[1]]);
    const hidden = action(shown.state, host, {
      kind: 'flashcards.show',
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

describe('game', () => {
  it('accepts the first answer before the deadline and scores once at reveal', () => {
    const rounds = [
      { prompt: 'Pick', options: ['A', 'B'], answer: 1, seconds: 5 },
    ];
    expect(
      action(room(), guest, { kind: 'game.set', rounds }).reply
    ).toMatchObject(error('permission_denied'));
    const ready = action(room(), host, { kind: 'game.set', rounds }).state;
    expect(action(ready, guest, { kind: 'game.start' }).reply).toMatchObject(
      error('permission_denied')
    );
    const started = action(ready, host, { kind: 'game.start' });
    const roundId = started.state.liveActivities?.game.rounds[0]?.id;
    expect(started.broadcast).toMatchObject([
      { snapshot: { game: { round: { endsAt: time + 5000 }, scores: [] } } },
    ]);
    expect(JSON.stringify(started.broadcast)).not.toContain('correct');
    const answered = action(
      started.state,
      guest,
      { kind: 'game.answer', roundId, choice: 1 },
      4999
    );
    expect(answered.broadcast).toMatchObject([
      { snapshot: { game: { answered: 1, scores: [] } } },
    ]);
    expect(read(answered.state, other).reply).toMatchObject([
      {},
      { mine: { game: {} } },
    ]);
    expect(
      action(
        answered.state,
        guest,
        { kind: 'game.answer', roundId, choice: 0 },
        4999
      ).state
    ).toBe(answered.state);
    expect(
      action(
        answered.state,
        other,
        { kind: 'game.answer', roundId, choice: 1 },
        5000
      ).reply
    ).toMatchObject(error('activity_game_closed'));
    const reset = action(answered.state, cohost, { kind: 'game.reset' }).state;
    const restarted = action(reset, host, { kind: 'game.start' }).state;
    expect(restarted.liveActivities?.game.rounds[0]?.id).not.toBe(roundId);
    expect(
      action(restarted, guest, { kind: 'game.answer', roundId, choice: 1 })
        .reply
    ).toMatchObject(error('activity_invalid_choice'));
    const revealed = action(
      answered.state,
      cohost,
      { kind: 'game.reveal' },
      5000
    );
    expect(revealed.broadcast).toMatchObject([
      {
        snapshot: {
          game: {
            phase: 'reveal',
            round: { correct: 1 },
            scores: [{ participantId: guest.userId, score: 100 }],
          },
        },
      },
    ]);
    expect(
      action(revealed.state, host, { kind: 'game.reveal' }, 5001).state
    ).toBe(revealed.state);
    expect(
      action(revealed.state, host, { kind: 'game.next' }, 5001).broadcast
    ).toMatchObject([
      { snapshot: { game: { phase: 'done', round: { correct: 1 } } } },
    ]);
  });
});

describe('icebreaker', () => {
  it('hides a response from public views and preserves moderation across edits', () => {
    expect(
      action(room(), guest, { kind: 'icebreaker.prompt', text: 'Hi?' }).reply
    ).toMatchObject(error('permission_denied'));
    const prompted = action(room(), host, {
      kind: 'icebreaker.prompt',
      text: 'Hi?',
    }).state;
    const response = action(prompted, guest, {
      kind: 'icebreaker.respond',
      text: ' first ',
    });
    const responseId =
      response.state.liveActivities?.icebreaker.responses[0]?.id;
    expect(response.broadcast).toMatchObject([
      { snapshot: { icebreaker: { responses: [{ text: 'first' }] } } },
    ]);
    expect(
      action(response.state, other, {
        kind: 'icebreaker.hide',
        responseId,
        hidden: true,
      }).reply
    ).toMatchObject(error('permission_denied'));
    const hidden = action(response.state, cohost, {
      kind: 'icebreaker.hide',
      responseId,
      hidden: true,
    });
    const edited = action(hidden.state, guest, {
      kind: 'icebreaker.respond',
      text: 'private edit',
    });
    expect(edited.broadcast).toMatchObject([
      { snapshot: { icebreaker: { responses: [] } } },
    ]);
    expect(edited.toManagers).toMatchObject([
      {
        host: {
          icebreaker: { hidden: [{ id: responseId, text: 'private edit' }] },
        },
      },
    ]);
    expect(JSON.stringify(read(edited.state, other).reply)).not.toContain(
      'private edit'
    );
    expect(
      action(edited.state, host, { kind: 'icebreaker.prompt', text: null })
        .direct
    ).toMatchObject([
      { userId: guest.userId, message: { mine: { icebreaker: {} } } },
    ]);
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
      { kind: 'icebreaker.respond', text: 'a'.repeat(201) },
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
  delivery.sendToUser(
    absent.deserializeAttachment().token.userId,
    managerRead.filter(({ type }) => type === 'activity.mine')
  );
  expect(absent.send).not.toHaveBeenCalled();
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
