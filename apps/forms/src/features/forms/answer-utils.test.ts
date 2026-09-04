import { describe, expect, it } from 'vitest';

import { deriveOptionValue, findMatchingOption } from './answer-utils';
import { getNextSectionTarget } from './branching';
import { createTestFormDefinition } from './test-support/form-fixtures';
import type { FormDefinition } from './types';

const baseForm: FormDefinition = createTestFormDefinition({
  title: 'Form',
  sections: [
    {
      id: 'section-1',
      title: 'Section 1',
      description: '',
      image: { storagePath: '', url: '', alt: '' },
      questions: [
        {
          id: 'question-1',
          sectionId: 'section-1',
          type: 'single_choice',
          title: 'Choose one',
          description: '',
          required: false,
          image: { storagePath: '', url: '', alt: '' },
          settings: { optionLayout: 'list' },
          options: [
            {
              id: 'option-1',
              label: '**Hello** world',
              value: 'hello-world',
              image: { storagePath: '', url: '', alt: '' },
            },
          ],
        },
      ],
    },
    {
      id: 'section-2',
      title: 'Section 2',
      description: '',
      image: { storagePath: '', url: '', alt: '' },
      questions: [],
    },
  ],
  logicRules: [
    {
      id: 'rule-1',
      triggerType: 'question',
      sourceQuestionId: 'question-1',
      operator: 'equals',
      comparisonValue: 'Hello world',
      actionType: 'go_to_section',
      targetSectionId: 'section-2',
    },
  ],
});

describe('form markdown option helpers', () => {
  it('derives stable option values from markdown labels', () => {
    expect(deriveOptionValue('**Hello** world')).toBe('hello-world');
  });

  it('matches plain text answers against markdown labels', () => {
    const question = baseForm.sections[0]?.questions[0];

    expect(findMatchingOption(question, 'Hello world')?.value).toBe(
      'hello-world'
    );
  });

  it('keeps branching working when comparison labels contain markdown-free text', () => {
    expect(
      getNextSectionTarget(baseForm, 'section-1', {
        'question-1': 'hello-world',
      })
    ).toEqual({
      type: 'section',
      targetSectionId: 'section-2',
    });
  });
});
