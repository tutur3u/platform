import { describe, expect, it } from 'vitest';
import { getRuntimeProgressStats } from './runtime-progress';
import type { FormDefinition } from './types';

const form: FormDefinition = {
  id: '50000000-0000-0000-0000-000000000001',
  wsId: '50000000-0000-0000-0000-000000000002',
  creatorId: '50000000-0000-0000-0000-000000000003',
  title: 'Progress form',
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
          type: 'single_choice',
          title: 'Path',
          description: '',
          required: true,
          settings: {},
          options: [
            {
              id: '50000000-0000-0000-0000-000000000012',
              label: 'Skip to final',
              value: 'skip',
            },
            {
              id: '50000000-0000-0000-0000-000000000013',
              label: 'Continue linearly',
              value: 'linear',
            },
          ],
        },
        {
          id: '50000000-0000-0000-0000-000000000014',
          sectionId: '50000000-0000-0000-0000-000000000010',
          type: 'short_text',
          title: 'Optional context',
          description: '',
          required: false,
          settings: {},
          options: [],
        },
      ],
    },
    {
      id: '50000000-0000-0000-0000-000000000020',
      title: 'Section 2',
      description: '',
      image: {
        storagePath: '',
        url: '',
        alt: '',
      },
      questions: [
        {
          id: '50000000-0000-0000-0000-000000000021',
          sectionId: '50000000-0000-0000-0000-000000000020',
          type: 'section_break',
          title: 'Divider',
          description: '',
          required: false,
          settings: {},
          options: [],
        },
        {
          id: '50000000-0000-0000-0000-000000000022',
          sectionId: '50000000-0000-0000-0000-000000000020',
          type: 'short_text',
          title: 'Skipped prompt',
          description: '',
          required: false,
          settings: {},
          options: [],
        },
      ],
    },
    {
      id: '50000000-0000-0000-0000-000000000030',
      title: 'Section 3',
      description: '',
      image: {
        storagePath: '',
        url: '',
        alt: '',
      },
      questions: [
        {
          id: '50000000-0000-0000-0000-000000000031',
          sectionId: '50000000-0000-0000-0000-000000000030',
          type: 'short_text',
          title: 'Final answer',
          description: '',
          required: false,
          settings: {},
          options: [],
        },
      ],
    },
  ],
  logicRules: [
    {
      id: '50000000-0000-0000-0000-000000000040',
      sourceQuestionId: '50000000-0000-0000-0000-000000000011',
      operator: 'equals',
      comparisonValue: 'skip',
      actionType: 'go_to_section',
      targetSectionId: '50000000-0000-0000-0000-000000000030',
    },
  ],
};

describe('getRuntimeProgressStats', () => {
  it('counts answered and skipped questions instead of section position', () => {
    const progress = getRuntimeProgressStats(
      form,
      {
        '50000000-0000-0000-0000-000000000011': 'skip',
      },
      [
        '50000000-0000-0000-0000-000000000010',
        '50000000-0000-0000-0000-000000000030',
      ],
      '50000000-0000-0000-0000-000000000030'
    );

    expect(progress).toEqual({
      totalQuestions: 4,
      answeredCount: 1,
      skippedCount: 2,
      completedCount: 3,
      progressValue: 75,
    });
  });
});
