import { describe, expect, it } from 'vitest';
import { formatAnswerForQuestion } from './answer-utils';
import {
  isListAnswerQuestionType,
  isTextInputQuestionType,
} from './block-utils';
import { calculateNpsScore, getNpsBand, isValidNpsScore } from './nps';
import { buildQuestionAnalytics } from './response-analytics';
import { moveRankingEntry, resolveRankingOrder } from './runtime/ranking-field';
import { createTestFormDefinition } from './test-support/form-fixtures';
import type {
  FormDefinition,
  FormDefinitionQuestion,
  FormResponseAnswerRow,
} from './types';

const SECTION_ID = '60000000-0000-0000-0000-000000000010';
const NPS_ID = '60000000-0000-0000-0000-000000000011';
const RANKING_ID = '60000000-0000-0000-0000-000000000012';
const NUMBER_ID = '60000000-0000-0000-0000-000000000013';

const emptyImage = { storagePath: '', url: '', alt: '' };

function createOption(id: string, label: string, value: string) {
  return { id, label, value, image: emptyImage };
}

const rankingOptions = [
  createOption('60000000-0000-0000-0000-0000000000a1', 'Speed', 'speed'),
  createOption('60000000-0000-0000-0000-0000000000a2', 'Clarity', 'clarity'),
  createOption('60000000-0000-0000-0000-0000000000a3', 'Price', 'price'),
];

const rankingQuestion: FormDefinitionQuestion = {
  id: RANKING_ID,
  sectionId: SECTION_ID,
  type: 'ranking',
  title: 'Rank these',
  description: '',
  required: false,
  image: emptyImage,
  settings: {},
  options: rankingOptions,
};

const form: FormDefinition = createTestFormDefinition({
  sections: [
    {
      id: SECTION_ID,
      title: 'Section 1',
      description: '',
      image: emptyImage,
      questions: [
        {
          id: NPS_ID,
          sectionId: SECTION_ID,
          type: 'nps',
          title: 'How likely are you to recommend us?',
          description: '',
          required: false,
          image: emptyImage,
          settings: {},
          options: [],
        },
        rankingQuestion,
        {
          id: NUMBER_ID,
          sectionId: SECTION_ID,
          type: 'number',
          title: 'How many seats?',
          description: '',
          required: false,
          image: emptyImage,
          settings: {},
          options: [],
        },
      ],
    },
  ],
});

let answerRowId = 0;
function answerRow(
  questionId: string,
  questionType: string,
  questionTitle: string,
  value: string | string[]
): FormResponseAnswerRow {
  answerRowId += 1;

  return {
    id: `60000000-0000-0000-0000-${String(answerRowId).padStart(12, '0')}`,
    response_id: `60000000-0000-0000-0000-${String(answerRowId).padStart(12, '9')}`,
    question_id: questionId,
    question_title: questionTitle,
    question_type: questionType,
    answer_text: Array.isArray(value) ? null : value,
    answer_json: Array.isArray(value) ? value : null,
    created_at: new Date(0).toISOString(),
  } as FormResponseAnswerRow;
}

describe('block type groupings', () => {
  it('treats every single-line typed input as a text input', () => {
    for (const type of ['short_text', 'email', 'phone', 'number', 'url']) {
      expect(isTextInputQuestionType(type as never)).toBe(true);
    }
    expect(isTextInputQuestionType('long_text')).toBe(false);
    expect(isTextInputQuestionType('nps')).toBe(false);
  });

  it('groups ranking with multiple choice as a list answer', () => {
    expect(isListAnswerQuestionType('ranking')).toBe(true);
    expect(isListAnswerQuestionType('multiple_choice')).toBe(true);
    expect(isListAnswerQuestionType('single_choice')).toBe(false);
  });
});

describe('nps helpers', () => {
  it('bands scores the standard way', () => {
    expect([0, 3, 6].map(getNpsBand)).toEqual([
      'detractor',
      'detractor',
      'detractor',
    ]);
    expect([7, 8].map(getNpsBand)).toEqual(['passive', 'passive']);
    expect([9, 10].map(getNpsBand)).toEqual(['promoter', 'promoter']);
  });

  it('rejects scores outside 0-10 and non-integers', () => {
    expect(isValidNpsScore(0)).toBe(true);
    expect(isValidNpsScore(10)).toBe(true);
    expect(isValidNpsScore(11)).toBe(false);
    expect(isValidNpsScore(-1)).toBe(false);
    expect(isValidNpsScore(7.5)).toBe(false);
  });

  it('subtracts detractors from promoters as a percentage of everyone', () => {
    // Passives count toward the denominator but neither side of the numerator.
    expect(
      calculateNpsScore({ promoters: 5, passives: 3, detractors: 2 })
    ).toBe(30);
    expect(
      calculateNpsScore({ promoters: 0, passives: 0, detractors: 4 })
    ).toBe(-100);
    expect(
      calculateNpsScore({ promoters: 0, passives: 0, detractors: 0 })
    ).toBe(0);
  });
});

describe('resolveRankingOrder', () => {
  it("falls back to the author's order when nothing is answered", () => {
    expect(resolveRankingOrder(rankingQuestion, undefined)).toEqual([
      'speed',
      'clarity',
      'price',
    ]);
  });

  it('keeps the respondent order when one exists', () => {
    expect(
      resolveRankingOrder(rankingQuestion, ['price', 'speed', 'clarity'])
    ).toEqual(['price', 'speed', 'clarity']);
  });

  it('appends options added after the answer was saved', () => {
    expect(resolveRankingOrder(rankingQuestion, ['price'])).toEqual([
      'price',
      'speed',
      'clarity',
    ]);
  });

  it('drops options the author has since removed', () => {
    expect(
      resolveRankingOrder(rankingQuestion, [
        'gone',
        'price',
        'speed',
        'clarity',
      ])
    ).toEqual(['price', 'speed', 'clarity']);
  });
});

describe('moveRankingEntry', () => {
  const order = ['a', 'b', 'c'];

  it('moves an entry to the requested position', () => {
    expect(moveRankingEntry(order, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveRankingEntry(order, 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('returns the original order for a move that goes nowhere', () => {
    expect(moveRankingEntry(order, 1, 1)).toBe(order);
    expect(moveRankingEntry(order, 0, -1)).toBe(order);
    expect(moveRankingEntry(order, 0, 3)).toBe(order);
    expect(moveRankingEntry(order, 5, 0)).toBe(order);
  });
});

describe('formatAnswerForQuestion for ranking', () => {
  it('numbers the entries so the order survives an export', () => {
    const { value } = formatAnswerForQuestion(rankingQuestion, [
      'price',
      'speed',
      'clarity',
    ]);
    expect(value).toBe('1. Price, 2. Speed, 3. Clarity');
  });

  it('leaves other list answers unnumbered', () => {
    const multipleChoice: FormDefinitionQuestion = {
      ...rankingQuestion,
      type: 'multiple_choice',
    };
    const { value } = formatAnswerForQuestion(multipleChoice, [
      'price',
      'speed',
    ]);
    expect(value).toBe('Price, Speed');
  });
});

describe('buildQuestionAnalytics for the new types', () => {
  it('scores nps answers and bands them', () => {
    const answers = [
      ...[10, 9, 9].map((score) =>
        answerRow(
          NPS_ID,
          'nps',
          'How likely are you to recommend us?',
          String(score)
        )
      ),
      answerRow(NPS_ID, 'nps', 'How likely are you to recommend us?', '8'),
      ...[3, 0].map((score) =>
        answerRow(
          NPS_ID,
          'nps',
          'How likely are you to recommend us?',
          String(score)
        )
      ),
    ];

    const nps = buildQuestionAnalytics(form, answers).find(
      (entry) => entry.questionId === NPS_ID
    );

    expect(nps?.totalAnswers).toBe(6);
    expect(nps?.nps?.promoters).toBe(3);
    expect(nps?.nps?.passives).toBe(1);
    expect(nps?.nps?.detractors).toBe(2);
    // (3 - 2) / 6 = 16.67% -> 17
    expect(nps?.nps?.score).toBe(17);
    expect(nps?.nps?.distribution).toHaveLength(11);
    expect(nps?.meanScore).toBe(6.5);
  });

  it('files an out-of-range nps answer as unmatched rather than scoring it', () => {
    const answers = [
      answerRow(NPS_ID, 'nps', 'How likely are you to recommend us?', '42'),
    ];

    const nps = buildQuestionAnalytics(form, answers).find(
      (entry) => entry.questionId === NPS_ID
    );

    expect(nps?.nps?.promoters).toBe(0);
    expect(nps?.unmatchedAnswers?.[0]?.value).toBe('42');
  });

  it('ranks options by mean position, best first', () => {
    const answers = [
      answerRow(RANKING_ID, 'ranking', 'Rank these', [
        'price',
        'speed',
        'clarity',
      ]),
      answerRow(RANKING_ID, 'ranking', 'Rank these', [
        'price',
        'clarity',
        'speed',
      ]),
    ];

    const ranking = buildQuestionAnalytics(form, answers).find(
      (entry) => entry.questionId === RANKING_ID
    )?.ranking;

    // speed: positions 2 and 3 -> 2.5; clarity: 3 and 2 -> 2.5. The tie is
    // broken by the stable sort, which preserves the author's option order.
    expect(ranking?.map((entry) => entry.value)).toEqual([
      'price',
      'speed',
      'clarity',
    ]);
    expect(ranking?.[0]).toMatchObject({
      value: 'price',
      averageRank: 1,
      firstChoiceCount: 2,
      count: 2,
    });
    expect(ranking?.[1]?.averageRank).toBe(2.5);
    expect(ranking?.[2]?.averageRank).toBe(2.5);
  });

  it('sorts an option nobody ranked to the bottom instead of the top', () => {
    const answers = [
      answerRow(RANKING_ID, 'ranking', 'Rank these', ['clarity', 'speed']),
    ];

    const ranking = buildQuestionAnalytics(form, answers).find(
      (entry) => entry.questionId === RANKING_ID
    )?.ranking;

    expect(ranking?.at(-1)?.value).toBe('price');
    expect(ranking?.at(-1)?.count).toBe(0);
    expect(Number.isNaN(ranking?.at(-1)?.averageRank ?? 0)).toBe(true);
  });

  it('averages number answers while still listing them as text', () => {
    const answers = ['4', '6', '11'].map((value) =>
      answerRow(NUMBER_ID, 'number', 'How many seats?', value)
    );

    const numberAnalytics = buildQuestionAnalytics(form, answers).find(
      (entry) => entry.questionId === NUMBER_ID
    );

    expect(numberAnalytics?.meanScore).toBe(7);
    expect(numberAnalytics?.textResponses).toHaveLength(3);
  });
});
