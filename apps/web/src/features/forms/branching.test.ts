import { describe, expect, it } from 'vitest';
import {
  getNextSectionTarget,
  getReachableSectionIds,
  matchesRule,
} from './branching';
import type { FormDefinition } from './types';

const baseForm: FormDefinition = {
  id: 'a0bba3b1-8861-4f5f-b174-746f75949001',
  wsId: 'a0bba3b1-8861-4f5f-b174-746f75949002',
  creatorId: 'a0bba3b1-8861-4f5f-b174-746f75949003',
  title: 'Branching test',
  description: '',
  status: 'draft',
  accessMode: 'anonymous',
  openAt: null,
  closeAt: null,
  maxResponses: null,
  theme: {
    presetId: 'editorial-moss',
    density: 'balanced',
    accentColor: 'dynamic-green',
    headlineFontId: 'noto-serif',
    bodyFontId: 'be-vietnam-pro',
    surfaceStyle: 'paper',
    coverHeadline: '',
    coverImage: {
      storagePath: '',
      url: '',
      alt: '',
    },
    sectionImages: {},
    typography: {
      displaySize: 'md',
      headingSize: 'md',
      bodySize: 'md',
    },
  },
  settings: {
    showProgressBar: true,
    allowMultipleSubmissions: true,
    oneResponsePerUser: false,
    requireTurnstile: true,
    confirmationTitle: 'Thanks',
    confirmationMessage: 'Done',
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  sections: [
    {
      id: 'a0bba3b1-8861-4f5f-b174-746f75949010',
      title: 'Section A',
      description: '',
      image: {
        storagePath: '',
        url: '',
        alt: '',
      },
      questions: [
        {
          id: 'a0bba3b1-8861-4f5f-b174-746f75949011',
          sectionId: 'a0bba3b1-8861-4f5f-b174-746f75949010',
          type: 'single_choice',
          title: 'Are you a manager?',
          description: '',
          required: true,
          image: { storagePath: '', url: '', alt: '' },
          settings: {},
          options: [
            {
              id: 'a0bba3b1-8861-4f5f-b174-746f75949012',
              label: 'Yes',
              value: 'yes',
              image: { storagePath: '', url: '', alt: '' },
            },
            {
              id: 'a0bba3b1-8861-4f5f-b174-746f75949013',
              label: 'No',
              value: 'no',
              image: { storagePath: '', url: '', alt: '' },
            },
          ],
        },
      ],
    },
    {
      id: 'a0bba3b1-8861-4f5f-b174-746f75949020',
      title: 'Section B',
      description: '',
      image: {
        storagePath: '',
        url: '',
        alt: '',
      },
      questions: [],
    },
    {
      id: 'a0bba3b1-8861-4f5f-b174-746f75949030',
      title: 'Section C',
      description: '',
      image: {
        storagePath: '',
        url: '',
        alt: '',
      },
      questions: [],
    },
  ],
  logicRules: [
    {
      id: 'a0bba3b1-8861-4f5f-b174-746f75949040',
      sourceQuestionId: 'a0bba3b1-8861-4f5f-b174-746f75949011',
      operator: 'equals',
      comparisonValue: 'yes',
      actionType: 'go_to_section',
      targetSectionId: 'a0bba3b1-8861-4f5f-b174-746f75949030',
    },
  ],
};

describe('forms branching', () => {
  it('matches contains rules against array answers', () => {
    expect(matchesRule('contains', 'beta', ['alpha', 'beta tester'])).toBe(
      true
    );
  });

  it('branches to a target section when a rule matches', () => {
    const firstSection = baseForm.sections[0];
    const firstQuestion = firstSection?.questions[0];

    expect(firstSection).toBeDefined();
    expect(firstQuestion).toBeDefined();

    const next = getNextSectionTarget(baseForm, firstSection!.id, {
      [firstQuestion!.id]: 'yes',
    });

    expect(next).toEqual({
      type: 'section',
      targetSectionId: 'a0bba3b1-8861-4f5f-b174-746f75949030',
    });
  });

  it('branches when a choice rule stores the visible option label', () => {
    const firstSection = baseForm.sections[0];
    const firstQuestion = firstSection?.questions[0];

    expect(firstSection).toBeDefined();
    expect(firstQuestion).toBeDefined();

    const next = getNextSectionTarget(
      {
        ...baseForm,
        logicRules: [
          {
            ...baseForm.logicRules[0]!,
            comparisonValue: 'Yes',
          },
        ],
      },
      firstSection!.id,
      {
        [firstQuestion!.id]: 'yes',
      }
    );

    expect(next).toEqual({
      type: 'section',
      targetSectionId: 'a0bba3b1-8861-4f5f-b174-746f75949030',
    });
  });

  it('keeps the linear path when no rule matches', () => {
    const firstSection = baseForm.sections[0];
    const firstQuestion = firstSection?.questions[0];

    expect(firstSection).toBeDefined();
    expect(firstQuestion).toBeDefined();

    const reachable = getReachableSectionIds(baseForm, {
      [firstQuestion!.id]: 'no',
    });

    expect(reachable).toEqual([
      'a0bba3b1-8861-4f5f-b174-746f75949010',
      'a0bba3b1-8861-4f5f-b174-746f75949020',
      'a0bba3b1-8861-4f5f-b174-746f75949030',
    ]);
  });
});
