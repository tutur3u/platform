import { describe, expect, it } from 'vitest';
import { createStoredAnswerQuestionResolver } from './answer-utils';
import type { FormDefinition, FormResponseAnswerRow } from './types';

const form: FormDefinition = {
  id: '50000000-0000-0000-0000-000000000001',
  wsId: '50000000-0000-0000-0000-000000000002',
  creatorId: '50000000-0000-0000-0000-000000000003',
  title: 'Resolver form',
  description: '',
  status: 'published',
  accessMode: 'anonymous',
  openAt: null,
  closeAt: null,
  maxResponses: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  theme: {
    presetId: 'editorial-moss',
    density: 'balanced',
    accentColor: 'dynamic-green',
    headlineFontId: 'noto-serif',
    bodyFontId: 'be-vietnam-pro',
    surfaceStyle: 'paper',
    coverHeadline: '',
    coverKicker: '',
    coverImage: {
      storagePath: '',
      url: '',
      alt: '',
    },
    sectionImages: {},
  },
  settings: {
    showProgressBar: true,
    allowMultipleSubmissions: true,
    oneResponsePerUser: false,
    requireTurnstile: false,
    confirmationTitle: 'Thanks',
    confirmationMessage: 'Done',
  },
  sections: [
    {
      id: '50000000-0000-0000-0000-000000000010',
      title: 'Section',
      description: '',
      image: {
        storagePath: '',
        url: '',
        alt: '',
      },
      questions: [
        {
          id: '50000000-0000-0000-0000-000000000011',
          sectionId: '50000000-0000-0000-0000-000000000010',
          type: 'multiple_choice',
          title: 'Which parts of the product feel most valuable?',
          description: '',
          required: false,
          settings: {},
          options: [
            {
              id: '50000000-0000-0000-0000-000000000012',
              label: 'Speed',
              value: 'speed',
            },
            {
              id: '50000000-0000-0000-0000-000000000013',
              label: 'Clarity',
              value: 'clarity',
            },
          ],
        },
      ],
    },
  ],
  logicRules: [],
};

describe('createStoredAnswerQuestionResolver', () => {
  it('falls back to question title and type when a stored question id no longer matches', () => {
    const resolveQuestion = createStoredAnswerQuestionResolver(form);
    const answer = {
      id: '50000000-0000-0000-0000-000000000101',
      response_id: '50000000-0000-0000-0000-000000000201',
      question_id: '50000000-0000-0000-0000-000000009999',
      question_title: 'Which parts of the product feel most valuable?',
      question_type: 'multiple_choice',
      answer_text: null,
      answer_json: ['clarity'],
      created_at: new Date().toISOString(),
    } satisfies FormResponseAnswerRow;

    expect(resolveQuestion(answer)?.id).toBe(
      '50000000-0000-0000-0000-000000000011'
    );
  });
});
