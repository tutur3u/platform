import { describe, expect, it } from 'vitest';
import { meetRealtimeTokenPayloadSchema } from './primitives';
import { createMeetRoomSnapshot } from './room';
import {
  applyRoomPolls,
  exportPollCsv,
  exportPollJson,
  pollDefinitionSchema,
  projectPollsForUser,
  type RoomPoll,
} from './room-polls';

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
  it('requires a verified session and counts one response across devices', () => {
    const vote = {
      action: 'poll.vote',
      pollId: poll.id,
      response: { type: 'single_choice', optionId: poll.options[0]!.id },
    } as const;
    expect(
      applyRoomPolls(
        snapshot,
        { ...token, guestTurnstileVerified: undefined },
        vote
      )
    ).toMatchObject({ status: 403 });
    const first = applyRoomPolls(snapshot, token, vote);
    const second = applyRoomPolls(
      first.state,
      { ...token, userId: '44444444-4444-4444-8444-444444444444' },
      { ...vote, response: { ...vote.response, optionId: poll.options[1]!.id } }
    );
    expect(second.state.polls?.[0]?.responses).toMatchObject([
      { userId: guestId, response: { optionId: poll.options[1]!.id } },
    ]);
  });
});
