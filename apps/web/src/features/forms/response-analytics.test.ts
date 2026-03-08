import { describe, expect, it } from 'vitest';
import {
  buildQuestionAnalytics,
  buildResponseSummary,
} from './response-analytics';
import type {
  FormDefinition,
  FormResponseAnswerRow,
  FormResponseRow,
} from './types';

const form: FormDefinition = {
  id: '50000000-0000-0000-0000-000000000001',
  wsId: '50000000-0000-0000-0000-000000000002',
  creatorId: '50000000-0000-0000-0000-000000000003',
  title: 'Feedback form',
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
      title: 'Section 1',
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
          title: 'What matters most?',
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

describe('buildQuestionAnalytics', () => {
  it('keeps unmatched stored answers out of the current choice breakdown without dropping them', () => {
    const answers = [
      {
        id: '50000000-0000-0000-0000-000000000100',
        response_id: '50000000-0000-0000-0000-000000000200',
        question_id: '50000000-0000-0000-0000-000000000011',
        question_title: 'What matters most?',
        question_type: 'multiple_choice',
        answer_text: null,
        answer_json: ['speed', 'analytics'],
        created_at: new Date().toISOString(),
      },
    ] satisfies FormResponseAnswerRow[];

    const analytics = buildQuestionAnalytics(form, answers);

    expect(analytics[0]).toMatchObject({
      totalAnswers: 1,
      choices: [
        {
          value: 'speed',
          count: 1,
          percentage: 100,
        },
        {
          value: 'clarity',
          count: 0,
          percentage: 0,
        },
      ],
      unmatchedAnswers: [
        {
          value: 'analytics',
          count: 1,
          percentage: 100,
        },
      ],
    });
  });

  it('calculates chart percentages from answers to that question, not all submissions', () => {
    const answers = [
      {
        id: '50000000-0000-0000-0000-000000000101',
        response_id: '50000000-0000-0000-0000-000000000201',
        question_id: '50000000-0000-0000-0000-000000000011',
        question_title: 'What matters most?',
        question_type: 'multiple_choice',
        answer_text: null,
        answer_json: ['speed'],
        created_at: new Date().toISOString(),
      },
      {
        id: '50000000-0000-0000-0000-000000000102',
        response_id: '50000000-0000-0000-0000-000000000202',
        question_id: '50000000-0000-0000-0000-000000000011',
        question_title: 'What matters most?',
        question_type: 'multiple_choice',
        answer_text: null,
        answer_json: ['clarity'],
        created_at: new Date().toISOString(),
      },
    ] satisfies FormResponseAnswerRow[];

    const analytics = buildQuestionAnalytics(form, answers);

    expect(analytics[0]?.choices).toEqual([
      {
        label: 'Speed',
        value: 'speed',
        count: 1,
        percentage: 50,
      },
      {
        label: 'Clarity',
        value: 'clarity',
        count: 1,
        percentage: 50,
      },
    ]);
  });

  it('counts answers when the stored question id drifted but the question title and type still match', () => {
    const answers = [
      {
        id: '50000000-0000-0000-0000-000000000103',
        response_id: '50000000-0000-0000-0000-000000000203',
        question_id: '50000000-0000-0000-0000-000000009999',
        question_title: 'What matters most?',
        question_type: 'multiple_choice',
        answer_text: null,
        answer_json: ['clarity'],
        created_at: new Date().toISOString(),
      },
    ] satisfies FormResponseAnswerRow[];

    const analytics = buildQuestionAnalytics(form, answers);

    expect(analytics[0]?.choices).toEqual([
      {
        label: 'Speed',
        value: 'speed',
        count: 0,
        percentage: 0,
      },
      {
        label: 'Clarity',
        value: 'clarity',
        count: 1,
        percentage: 100,
      },
    ]);
    expect(analytics[0]?.unmatchedAnswers).toBeUndefined();
  });

  it('aggregates text answers so text questions still have ranked insight content', () => {
    const textForm: FormDefinition = {
      ...form,
      sections: [
        {
          ...form.sections[0]!,
          questions: [
            {
              id: '50000000-0000-0000-0000-000000000021',
              sectionId: form.sections[0]!.id,
              type: 'long_text',
              title: 'What should we improve next?',
              description: '',
              required: false,
              settings: {},
              options: [],
            },
          ],
        },
      ],
    };
    const answers = [
      {
        id: '50000000-0000-0000-0000-000000000104',
        response_id: '50000000-0000-0000-0000-000000000204',
        question_id: '50000000-0000-0000-0000-000000000021',
        question_title: 'What should we improve next?',
        question_type: 'long_text',
        answer_text: 'Faster reports',
        answer_json: null,
        created_at: new Date().toISOString(),
      },
      {
        id: '50000000-0000-0000-0000-000000000105',
        response_id: '50000000-0000-0000-0000-000000000205',
        question_id: '50000000-0000-0000-0000-000000000021',
        question_title: 'What should we improve next?',
        question_type: 'long_text',
        answer_text: 'Faster reports',
        answer_json: null,
        created_at: new Date().toISOString(),
      },
      {
        id: '50000000-0000-0000-0000-000000000106',
        response_id: '50000000-0000-0000-0000-000000000206',
        question_id: '50000000-0000-0000-0000-000000000021',
        question_title: 'What should we improve next?',
        question_type: 'long_text',
        answer_text: 'Better exports',
        answer_json: null,
        created_at: new Date().toISOString(),
      },
    ] satisfies FormResponseAnswerRow[];

    const analytics = buildQuestionAnalytics(textForm, answers);

    expect(analytics[0]?.textResponses).toEqual([
      {
        value: 'Faster reports',
        count: 2,
        percentage: 67,
      },
      {
        value: 'Better exports',
        count: 1,
        percentage: 33,
      },
    ]);
  });
});

describe('buildResponseSummary', () => {
  it('matches the duplicate-user summary rules used by the responses view', () => {
    const responses = [
      {
        id: '50000000-0000-0000-0000-000000000301',
        respondent_email: null,
        respondent_user_id: '50000000-0000-0000-0000-000000000401',
      },
      {
        id: '50000000-0000-0000-0000-000000000302',
        respondent_email: null,
        respondent_user_id: '50000000-0000-0000-0000-000000000401',
      },
      {
        id: '50000000-0000-0000-0000-000000000303',
        respondent_email: 'user@example.com',
        respondent_user_id: null,
      },
      {
        id: '50000000-0000-0000-0000-000000000304',
        respondent_email: null,
        respondent_user_id: null,
      },
    ] satisfies Array<
      Pick<FormResponseRow, 'id' | 'respondent_email' | 'respondent_user_id'>
    >;

    expect(buildResponseSummary(responses)).toEqual({
      totalSubmissions: 4,
      totalResponders: 3,
      authenticatedResponders: 1,
      anonymousSubmissions: 1,
      duplicateAuthenticatedResponders: 1,
      duplicateAuthenticatedSubmissions: 2,
      hasMultipleSubmissionsByUser: true,
    });
  });
});
