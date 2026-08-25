import { describe, expect, it } from 'vitest';
import { getRuntimeProgressStats } from './runtime-progress';
import { createTestFormDefinition } from './test-support/form-fixtures';
import type { FormDefinition } from './types';

const form: FormDefinition = createTestFormDefinition({
  title: 'Progress form',
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
          image: { storagePath: '', url: '', alt: '' },
          settings: {},
          options: [
            {
              id: '50000000-0000-0000-0000-000000000012',
              label: 'Skip to final',
              value: 'skip',
              image: { storagePath: '', url: '', alt: '' },
            },
            {
              id: '50000000-0000-0000-0000-000000000013',
              label: 'Continue linearly',
              value: 'linear',
              image: { storagePath: '', url: '', alt: '' },
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
          image: { storagePath: '', url: '', alt: '' },
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
          image: { storagePath: '', url: '', alt: '' },
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
          image: { storagePath: '', url: '', alt: '' },
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
          image: { storagePath: '', url: '', alt: '' },
          settings: {},
          options: [],
        },
      ],
    },
  ],
  logicRules: [
    {
      id: '50000000-0000-0000-0000-000000000040',
      triggerType: 'question',
      sourceQuestionId: '50000000-0000-0000-0000-000000000011',
      operator: 'equals',
      comparisonValue: 'skip',
      actionType: 'go_to_section',
      targetSectionId: '50000000-0000-0000-0000-000000000030',
    },
  ],
});

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
      routeSectionIds: [
        '50000000-0000-0000-0000-000000000010',
        '50000000-0000-0000-0000-000000000030',
      ],
      currentSectionNumber: 2,
      routeSectionCount: 2,
      totalQuestions: 3,
      answeredCount: 1,
      skippedCount: 1,
      completedCount: 2,
      progressValue: 66.66666666666666,
    });
  });
});
