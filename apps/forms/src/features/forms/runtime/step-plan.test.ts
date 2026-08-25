import { describe, expect, it } from 'vitest';
import type { FormDefinitionQuestion, FormDefinitionSection } from '../types';
import { buildSectionSteps, clampStepIndex } from './step-plan';

const media = { storagePath: '', url: '', alt: '' };

function question(
  id: string,
  type: FormDefinitionQuestion['type']
): FormDefinitionQuestion {
  return {
    id,
    sectionId: 'section-1',
    type,
    title: id,
    description: '',
    required: false,
    image: { ...media },
    settings: {},
    options: [],
  };
}

function section(questions: FormDefinitionQuestion[]): FormDefinitionSection {
  return {
    id: 'section-1',
    title: 'Section',
    description: '',
    image: { ...media },
    questions,
  };
}

describe('buildSectionSteps', () => {
  it('keeps a whole section on one screen in sections mode', () => {
    const steps = buildSectionSteps(
      section([question('a', 'short_text'), question('b', 'long_text')]),
      'sections'
    );

    expect(steps).toHaveLength(1);
    expect(steps[0]?.answerableQuestionIds).toEqual(['a', 'b']);
  });

  it('gives each answerable question its own screen in one_question mode', () => {
    const steps = buildSectionSteps(
      section([
        question('a', 'short_text'),
        question('b', 'long_text'),
        question('c', 'rating'),
      ]),
      'one_question'
    );

    expect(steps.map((step) => step.answerableQuestionIds)).toEqual([
      ['a'],
      ['b'],
      ['c'],
    ]);
  });

  it('attaches leading content blocks to the question they introduce', () => {
    const steps = buildSectionSteps(
      section([
        question('intro', 'rich_text'),
        question('image', 'image'),
        question('a', 'short_text'),
        question('b', 'long_text'),
      ]),
      'one_question'
    );

    expect(steps).toHaveLength(2);
    expect(steps[0]?.questions.map((q) => q.id)).toEqual([
      'intro',
      'image',
      'a',
    ]);
    expect(steps[0]?.answerableQuestionIds).toEqual(['a']);
    expect(steps[1]?.questions.map((q) => q.id)).toEqual(['b']);
  });

  it('keeps trailing content on the last screen rather than stranding it', () => {
    const steps = buildSectionSteps(
      section([
        question('a', 'short_text'),
        question('outro', 'rich_text'),
        question('divider', 'divider'),
      ]),
      'one_question'
    );

    expect(steps).toHaveLength(1);
    expect(steps[0]?.questions.map((q) => q.id)).toEqual([
      'a',
      'outro',
      'divider',
    ]);
  });

  it('still renders a section that has no answerable question at all', () => {
    const steps = buildSectionSteps(
      section([question('intro', 'rich_text'), question('img', 'image')]),
      'one_question'
    );

    expect(steps).toHaveLength(1);
    expect(steps[0]?.questions).toHaveLength(2);
    expect(steps[0]?.answerableQuestionIds).toEqual([]);
  });

  it('returns nothing for a missing section', () => {
    expect(buildSectionSteps(undefined, 'one_question')).toEqual([]);
  });
});

describe('clampStepIndex', () => {
  it('keeps an index inside the available steps', () => {
    expect(clampStepIndex(5, 3)).toBe(2);
    expect(clampStepIndex(-1, 3)).toBe(0);
    expect(clampStepIndex(1, 3)).toBe(1);
  });

  it('collapses to zero when a branch lands on an empty section', () => {
    expect(clampStepIndex(4, 0)).toBe(0);
  });
});
