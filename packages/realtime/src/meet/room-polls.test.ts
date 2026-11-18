import { describe, expect, it } from 'vitest';
import {
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
