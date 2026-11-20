import { describe, expect, it } from 'vitest';
import { createDefaultFormStudioInput } from '../../../../../../../apps/forms/src/features/forms/schema';
import type {
  FormDefinition,
  FormResponseAnswerRow,
} from '../../../../../../../apps/forms/src/features/forms/types';
import { meetFormAnswerId } from '../forms/response-ids';
import { aggregateFormsResults } from './aggregate';
import { exportFormsResults } from './results';

const choiceId = '33247a59-e00a-42e5-b6cf-15eedcbf7db3';
const textId = 'fa28af95-848b-4100-8666-56d68f7bb230';
const launch = {
  meetingId: '7ee82c83-1e55-408a-8f74-f12123372c51',
  launchId: 'fd5eafc4-6ce3-48c0-9332-200ceed4176e',
  formId: '0d5c5784-753d-430f-b5be-8cca40c7761d',
  versionId: 'dad42ee5-4b00-40f6-a30f-70aa0ffc78c0',
};
const defaults = createDefaultFormStudioInput();
const section = defaults.sections[0]!;
const baseQuestion = section.questions[0]!;
const date = '2026-01-01T00:00:00.000Z';
const form = {
  ...defaults,
  id: launch.formId,
  wsId: 'workspace',
  creatorId: 'creator',
  createdAt: date,
  updatedAt: date,
  logicRules: [],
  sections: [
    {
      ...section,
      id: 'section',
      questions: [
        {
          ...baseQuestion,
          id: choiceId,
          sectionId: 'section',
          title: 'Choices',
          type: 'multiple_choice',
          options: [
            {
              id: 'option',
              value: 'a',
              label: 'A',
              image: { storagePath: '', url: '', alt: '' },
            },
          ],
        },
        {
          ...baseQuestion,
          id: textId,
          sectionId: 'section',
          title: 'Contact',
          options: [],
        },
      ],
    },
  ],
} satisfies FormDefinition;

function answer(
  questionId: string,
  value: string | string[]
): FormResponseAnswerRow {
  return {
    id: 'answer',
    response_id: 'response',
    question_id: questionId,
    question_title: '',
    question_type: '',
    answer_text: typeof value === 'string' ? value : null,
    answer_json: Array.isArray(value) ? value : null,
    created_at: date,
  };
}

describe('launch aggregates', () => {
  it('restores the pinned question of a response whose live question was deleted', () => {
    const stored = answer(choiceId, ['a']);
    const results = aggregateFormsResults({ ...launch, form }, [
      {
        answers: [
          {
            ...stored,
            id: meetFormAnswerId(stored.response_id, choiceId),
            question_id: null,
          },
          {
            ...stored,
            id: 'unrelated-answer',
            question_id: null,
            question_title: 'Contact',
            question_type: 'short_text',
          },
        ],
      },
    ]);

    expect(results.questions[0]).toMatchObject({
      id: choiceId,
      answeredCount: 1,
    });
    expect(results.questions[1]).toMatchObject({
      id: textId,
      answeredCount: 0,
    });
  });

  it.each(['anonymous', 'authenticated_email'] as const)(
    'keeps counts and authored choices without exposing private answer text (%s)',
    (accessMode) => {
      const privateAnswer = 'private@example.com';
      const results = aggregateFormsResults(
        { ...launch, form: { ...form, accessMode } },
        [
          {
            answers: [
              answer(choiceId, ['a', privateAnswer]),
              answer(textId, privateAnswer),
              answer('another-version-question', privateAnswer),
            ],
          },
          { answers: [answer(choiceId, ['a'])] },
        ]
      );

      expect(results.responseCount).toBe(2);
      expect(results.responseMode).toBe(
        accessMode === 'anonymous' ? 'anonymous' : 'named'
      );
      expect(results.questions).toEqual([
        {
          id: choiceId,
          title: 'Choices',
          answeredCount: 2,
          breakdown: [{ label: 'A', count: 2 }],
        },
        { id: textId, title: 'Contact', answeredCount: 1, breakdown: [] },
      ]);
      expect(JSON.stringify(results)).not.toContain(privateAnswer);
      expect(exportFormsResults(results)).not.toContain(privateAnswer);
    }
  );
});
