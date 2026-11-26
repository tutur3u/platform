import { describe, expect, it, vi } from 'vitest';
import { meetRealtimeTokenPayloadSchema } from './primitives';
import { createMeetRoomSnapshot, createMeetRoomSocketDelivery } from './room';
import {
  applyRoomPolls,
  exportPollCsv,
  exportPollJson,
  MEET_POLL_VOTE_LIMIT,
  MEET_POLL_VOTE_WINDOW_MS,
  pollDefinitionSchema,
  projectPollsForUser,
  type RoomPoll,
} from './room-polls';
import { recordRemovedGuest } from './room-removed-guests';
import type { RoomServiceState } from './room-service';

const poll = {
  id: 'poll',
  status: 'active',
  question: 'What went well?',
  anonymous: true,
  resultsVisible: false,
  type: 'open_text',
  responses: [
    {
      userId: 'voter-alice',
      displayName: 'Alice Secret',
      submittedAt: 987654321,
      response: { type: 'open_text', text: '=SUM(1,2) "and more"' },
    },
    {
      userId: 'voter-bob',
      displayName: 'Bob Secret',
      response: { type: 'open_text', text: 'Clear agenda' },
    },
  ],
} satisfies RoomPoll;

describe('room poll privacy and exports', () => {
  it('exposes only the caller’s response until results are revealed', () => {
    expect(projectPollsForUser([poll], 'voter-alice', false)).toMatchObject([
      { myResponse: poll.responses[0]?.response, results: null, kind: 'poll' },
    ]);
    expect(projectPollsForUser([poll], 'outside', false)).toMatchObject([
      { myResponse: null, results: null },
    ]);
    expect(
      projectPollsForUser(
        [{ ...poll, resultsVisible: true }],
        'outside',
        false
      )[0]?.results?.responseCount
    ).toBe(2);
    expect(
      projectPollsForUser([{ ...poll, status: 'closed' }], 'outside', false)[0]
        ?.results?.responseCount
    ).toBe(2);
    expect(
      projectPollsForUser([{ ...poll, status: 'draft' }], 'outside', false)
    ).toEqual([]);
  });

  it('omits account, name, timestamp and per-voter rows even for managers and anonymous exports', () => {
    const views = [
      JSON.stringify(projectPollsForUser([poll], 'voter-bob', true)),
      JSON.stringify(exportPollJson(poll)),
      exportPollCsv(poll),
    ];
    for (const data of views) {
      for (const privateValue of [
        'voter-alice',
        'Alice Secret',
        'voter-bob',
        'Bob Secret',
        '987654321',
        'submittedAt',
        'displayName',
      ])
        expect(data).not.toContain(privateValue);
      expect(data).toContain('Clear agenda');
    }
    expect(exportPollCsv(poll)).toContain(`"'=SUM(1,2) ""and more"""`);
    expect(exportPollJson({ ...poll, anonymous: false }).responses).toEqual(
      poll.responses
    );
  });

  it.each(['=cmd', '+cmd', '-cmd', '@cmd', '\tcmd', '\rcmd', '  =cmd'])(
    'escapes spreadsheet formula prefixes %j',
    (value) => {
      const csv = exportPollCsv({ ...poll, question: value });
      expect(csv).toContain(`"'${value}"`);
    }
  );

  it('keeps quiz answer keys and explanations private until closure', () => {
    const quiz = {
      ...poll,
      kind: 'quiz',
      resultsVisible: true,
      quizMeta: {
        timeLimitSec: 30,
        points: 10,
        explanation: 'Answer reasoning',
        correctOptionIds: ['correct'],
      },
    } satisfies RoomPoll;
    expect(projectPollsForUser([quiz], 'outside', false)[0]?.quizMeta).toEqual({
      timeLimitSec: 30,
      points: 10,
    });
    expect(projectPollsForUser([quiz], 'manager', true)[0]?.quizMeta).toEqual(
      quiz.quizMeta
    );
    expect(
      projectPollsForUser([{ ...quiz, status: 'closed' }], 'outside', false)[0]
        ?.quizMeta
    ).toEqual(quiz.quizMeta);
  });

  it.each([
    { type: 'single_choice', options: ['only one'] },
    { type: 'single_choice', options: ['First', 'first'] },
    {
      type: 'single_choice',
      options: Array.from({ length: 11 }, (_, index) => String(index)),
    },
    { type: 'multiple_choice', options: ['First', 'Second'], maxChoices: 3 },
    { type: 'rating', min: 2, max: 5 },
    { type: 'rating', min: 1, max: 7 },
    { type: 'open_text', quizMeta: { correctOptionIds: ['answer'] } },
  ])('rejects out-of-scope or invalid draft fields %j', (input) => {
    expect(
      pollDefinitionSchema.safeParse({ question: 'Question', ...input }).success
    ).toBe(false);
  });
});

describe('anonymous guest poll voting', () => {
  const guestId = '33333333-3333-4333-8333-333333333333';
  const token = meetRealtimeTokenPayloadSchema.parse({
    guest: true,
    guestTurnstileVerified: true,
    admission: 'lobby',
    exp: 2_000_000_000,
    limits: {
      maxRoomDurationSeconds: 7200,
      video: {
        defaultCameraEnabled: false,
        maxFrameRate: 24,
        maxHeight: 720,
        maxWidth: 1280,
      },
    },
    meetingId: '7f2a528e-3bff-40ee-bfda-5b944ad03ed8',
    role: 'speaker',
    roomId: 'room',
    userId: guestId,
    accountId: guestId,
    wsId: '22222222-2222-4222-8222-222222222222',
  });
  const poll: RoomPoll = {
    id: '55555555-5555-4555-8555-555555555555',
    status: 'active',
    question: 'Pick one',
    anonymous: false,
    resultsVisible: true,
    type: 'single_choice',
    options: [
      { id: '66666666-6666-4666-8666-666666666666', label: 'A' },
      { id: '77777777-7777-4777-8777-777777777777', label: 'B' },
    ],
    responses: [],
  };
  const snapshot = {
    ...createMeetRoomSnapshot(),
    polls: [poll],
    approved: {
      [guestId]: { userId: guestId, displayName: 'Guest' },
    },
    presence: {
      [guestId]: {
        guest: true as const,
        accountId: guestId,
        userId: guestId,
        displayName: 'Guest',
        joinedAt: '2026-11-19T00:00:00.000Z',
        lastSeenAt: '2026-11-19T00:00:00.000Z',
        media: {
          audioEnabled: false,
          videoEnabled: false,
          screenEnabled: false,
        },
        role: 'speaker' as const,
      },
    },
  };

  it('lets a guest list and vote but not create polls', () => {
    expect(
      applyRoomPolls(snapshot, token, {
        action: 'poll.list',
      }).body
    ).toEqual(expect.objectContaining({ polls: expect.any(Array) }));
    expect(
      applyRoomPolls(snapshot, token, {
        action: 'poll.create',
        definition: { type: 'open_text', question: 'Why?' },
        anonymous: true,
      })
    ).toMatchObject({ status: 403 });
    const voted = applyRoomPolls(snapshot, token, {
      action: 'poll.vote',
      pollId: poll.id,
      response: {
        type: 'single_choice',
        optionId: poll.options[0]!.id,
      },
    });
    expect(voted.state.polls?.[0]?.responses).toEqual([
      expect.objectContaining({ userId: guestId }),
    ]);
  });
  it('lets a host-admitted unverified guest vote once across devices while still requiring a bound guest identity', () => {
    const vote = {
      action: 'poll.vote',
      pollId: poll.id,
      response: { type: 'single_choice', optionId: poll.options[0]!.id },
    } as const;
    const unverifiedGuest = {
      ...token,
      guestTurnstileVerified: undefined,
      roomId: 'room-unverified',
    };
    const first = applyRoomPolls(
      {
        ...snapshot,
        presence: {
          [guestId]: {
            ...snapshot.presence[guestId]!,
            displayName: 'Renamed Guest',
          },
        },
      },
      { ...unverifiedGuest, displayName: 'Old Guest Name' },
      vote,
      10_000
    );
    expect(first.status).toBeUndefined();
    expect(first.state.polls?.[0]?.responses).toMatchObject([
      {
        userId: guestId,
        displayName: 'Renamed Guest',
        response: { optionId: poll.options[0]!.id },
      },
    ]);
    const second = applyRoomPolls(
      first.state,
      { ...unverifiedGuest, userId: '44444444-4444-4444-8444-444444444444' },
      {
        ...vote,
        response: { ...vote.response, optionId: poll.options[1]!.id },
      },
      10_100
    );
    expect(second.status).toBeUndefined();
    expect(second.state.polls?.[0]?.responses).toMatchObject([
      { userId: guestId, response: { optionId: poll.options[1]!.id } },
    ]);
    expect(
      applyRoomPolls(
        snapshot,
        { ...unverifiedGuest, accountId: undefined },
        { action: 'poll.list' },
        10_200
      )
    ).toMatchObject({ status: 403 });
    expect(
      applyRoomPolls(
        snapshot,
        { ...unverifiedGuest, accountId: undefined },
        vote,
        10_200
      )
    ).toMatchObject({ status: 403 });
  });

  it('rejects disconnected, unadmitted, waiting, removed, and ended-room guests from listing or voting', () => {
    const outsiderId = '88888888-8888-4888-8888-888888888888';
    const outsider = {
      ...token,
      guestTurnstileVerified: undefined,
      userId: outsiderId,
      accountId: outsiderId,
      roomId: 'room-outsider',
    };
    const waitingRoom = {
      ...snapshot,
      waiting: {
        [outsiderId]: {
          guest: true as const,
          unverified: true as const,
          accountId: outsiderId,
          displayName: 'Waiting Guest',
          requestedAt: '2026-11-19T00:00:00.000Z',
          userId: outsiderId,
        },
      },
    };
    const vote = {
      action: 'poll.vote',
      pollId: poll.id,
      response: { type: 'single_choice', optionId: poll.options[0]!.id },
    } as const;
    expect(
      applyRoomPolls(waitingRoom, outsider, { action: 'poll.list' }, 10_000)
    ).toMatchObject({ status: 403 });
    expect(applyRoomPolls(waitingRoom, outsider, vote, 10_000)).toMatchObject({
      status: 403,
    });

    // Disconnected guest still in `approved` must not list or vote.
    const disconnectedApproved = { ...snapshot, presence: {} };
    expect(
      applyRoomPolls(
        disconnectedApproved,
        token,
        { action: 'poll.list' },
        10_000
      )
    ).toMatchObject({ status: 403 });
    expect(
      applyRoomPolls(disconnectedApproved, token, vote, 10_000)
    ).toMatchObject({ status: 403 });

    // Ended room refuses poll.list for both guests (403) and managers (409).
    const ended = { ...snapshot, ended: true };
    expect(
      applyRoomPolls(ended, token, { action: 'poll.list' }, 10_000)
    ).toMatchObject({ status: 403 });
    const host = meetRealtimeTokenPayloadSchema.parse({
      ...token,
      guest: undefined,
      guestTurnstileVerified: undefined,
      admission: 'open',
      role: 'host',
      userId: '11111111-1111-4111-8111-111111111111',
      accountId: '11111111-1111-4111-8111-111111111111',
    });
    expect(
      applyRoomPolls(ended, host, { action: 'poll.list' }, 10_000)
    ).toMatchObject({ status: 409 });

    const removed = {
      ...snapshot,
      ...recordRemovedGuest(snapshot, guestId, 10_000, true),
    };
    expect(
      applyRoomPolls(removed, token, { action: 'poll.list' }, 10_500)
    ).toMatchObject({ status: 403 });
    expect(applyRoomPolls(removed, token, vote, 10_500)).toMatchObject({
      status: 403,
    });
  });

  it('rate-limits repeated guest poll votes per actor with Retry-After and recovers after the window', () => {
    const rateGuest = {
      ...token,
      guestTurnstileVerified: undefined,
      roomId: 'room-rate-limit',
    };
    let state: RoomServiceState = snapshot;
    const baseTime = 1_000_000;
    for (let index = 0; index < MEET_POLL_VOTE_LIMIT; index++) {
      const result = applyRoomPolls(
        state,
        rateGuest,
        {
          action: 'poll.vote',
          pollId: poll.id,
          response: {
            type: 'single_choice',
            optionId: poll.options[index % 2]!.id,
          },
        },
        baseTime + index * 10
      );
      expect(result.status).toBeUndefined();
      state = result.state;
    }
    expect(
      applyRoomPolls(
        state,
        rateGuest,
        {
          action: 'poll.vote',
          pollId: poll.id,
          response: { type: 'single_choice', optionId: poll.options[0]!.id },
        },
        baseTime + 500
      )
    ).toMatchObject({
      status: 429,
      retryAfterSeconds: 60,
      body: { error: 'Too many poll votes', retryAfterSeconds: 60 },
    });
    expect(
      applyRoomPolls(
        state,
        rateGuest,
        {
          action: 'poll.vote',
          pollId: poll.id,
          response: { type: 'single_choice', optionId: poll.options[0]!.id },
        },
        baseTime + MEET_POLL_VOTE_WINDOW_MS + 1
      ).status
    ).toBeUndefined();
  });

  it('broadcasts polls.changed on lifecycle transitions to admitted guests only and short-circuits idempotent or closed visibility writes', () => {
    const hostId = '11111111-1111-4111-8111-111111111111';
    const host = meetRealtimeTokenPayloadSchema.parse({
      ...token,
      guest: undefined,
      guestTurnstileVerified: undefined,
      admission: 'open',
      role: 'host',
      userId: hostId,
      accountId: hostId,
    });
    const created = applyRoomPolls(snapshot, host, {
      action: 'poll.create',
      definition: {
        type: 'single_choice',
        question: 'Draft?',
        options: ['Yes', 'No'],
      },
      anonymous: true,
    });
    expect(created.messages).toBeUndefined();
    const draftId = (created.body as { pollId: string }).pollId;
    const launched = applyRoomPolls(created.state, host, {
      action: 'poll.launch',
      pollId: draftId,
    });
    expect(launched.messages).toEqual([
      { type: 'polls.changed', pollId: draftId, status: 'active' },
    ]);
    const revealed = applyRoomPolls(launched.state, host, {
      action: 'poll.visibility',
      pollId: draftId,
      resultsVisible: true,
    });
    expect(revealed.messages).toEqual([
      { type: 'polls.changed', pollId: draftId, resultsVisible: true },
    ]);
    // Idempotent visibility write is a no-op with no broadcast.
    const sameVisibility = applyRoomPolls(revealed.state, host, {
      action: 'poll.visibility',
      pollId: draftId,
      resultsVisible: true,
    });
    expect(sameVisibility.state).toBe(revealed.state);
    expect(sameVisibility.messages).toBeUndefined();
    const voted = applyRoomPolls(
      revealed.state,
      { ...token, guestTurnstileVerified: undefined, roomId: 'room-lifecycle' },
      {
        action: 'poll.vote',
        pollId: poll.id,
        response: { type: 'single_choice', optionId: poll.options[0]!.id },
      }
    );
    expect(voted.messages).toBeUndefined();
    const closed = applyRoomPolls(voted.state, host, {
      action: 'poll.close',
      pollId: draftId,
    });
    expect(closed.messages).toEqual([
      { type: 'polls.changed', pollId: draftId, status: 'closed' },
    ]);
    // Visibility toggle on a closed poll is a no-op with no broadcast.
    const closedVisibility = applyRoomPolls(closed.state, host, {
      action: 'poll.visibility',
      pollId: draftId,
      resultsVisible: false,
    });
    expect(closedVisibility.state).toBe(closed.state);
    expect(closedVisibility.messages).toBeUndefined();
    const deleted = applyRoomPolls(closed.state, host, {
      action: 'poll.delete',
      pollId: draftId,
    });
    expect(deleted.messages).toEqual([
      { type: 'polls.changed', pollId: draftId, deleted: true },
    ]);

    const waitingId = '99999999-9999-4999-8999-999999999999';
    const waitingToken = { ...token, userId: waitingId, accountId: waitingId };
    const sent = new Map<string, string[]>();
    const makeSocket = (sockToken: typeof token) => {
      const frames: string[] = [];
      sent.set(sockToken.userId, frames);
      return {
        readyState: 1,
        send: (data: string) => frames.push(data),
        close: vi.fn(),
        deserializeAttachment: () => ({ token: sockToken }),
        serializeAttachment: vi.fn(),
      };
    };
    const delivery = createMeetRoomSocketDelivery({
      sockets: () => [makeSocket(token), makeSocket(waitingToken)],
      read: () => closed.state,
      fullPresence: (roomId) => ({ type: 'presence', roomId, presence: [] }),
      announcements: () => [],
    });
    delivery.broadcast(closed.messages ?? []);
    expect(sent.get(guestId)).toEqual([
      JSON.stringify({
        type: 'polls.changed',
        pollId: draftId,
        status: 'closed',
      }),
    ]);
    expect(sent.get(waitingId)).toEqual([]);
  });
});
