import { describe, expect, it } from 'vitest';
import type { FormStudioInput } from '../../schema';
import {
  insertSectionQuestionAfter,
  moveSectionQuestion,
  removeSectionQuestion,
  reorderSectionQuestions,
  resolveThreePaneSelection,
} from './selection';

const emptyImage = { storagePath: '', url: '', alt: '' };

function question(id: string) {
  return {
    id,
    type: 'short_text' as const,
    title: id,
    description: '',
    required: false,
    image: emptyImage,
    settings: {},
    options: [],
  };
}

const sections: FormStudioInput['sections'] = [
  {
    id: 'section-a',
    title: 'A',
    description: '',
    image: emptyImage,
    questions: [question('q1'), question('q2')],
  },
  {
    id: 'section-b',
    title: 'B',
    description: '',
    image: emptyImage,
    questions: [question('q3')],
  },
];

describe('resolveThreePaneSelection', () => {
  it('resolves a selected block to its section and question index', () => {
    expect(
      resolveThreePaneSelection(sections, 'section-b', { 'section-b': 'q3' })
    ).toEqual({
      sectionIndex: 1,
      questionIndex: 0,
      questionId: 'q3',
      sectionId: 'section-b',
    });
  });

  it('resolves the second block of the first section', () => {
    expect(
      resolveThreePaneSelection(sections, 'section-a', { 'section-a': 'q2' })
    ).toMatchObject({ sectionIndex: 0, questionIndex: 1, questionId: 'q2' });
  });

  it('reports no block when a section is selected but no question is', () => {
    const result = resolveThreePaneSelection(sections, 'section-a', {});
    // The indices stay bindable so the pane has a valid form path, but the
    // null id is what makes it render the empty state.
    expect(result).toEqual({
      sectionIndex: 0,
      questionIndex: 0,
      questionId: null,
      sectionId: 'section-a',
    });
  });

  it('refuses to fall back to block 0 when the selected id is gone', () => {
    // The regression this guards: a deleted block leaves a stale id behind,
    // and binding index 0 would silently edit a different block than the one
    // the outline highlights.
    const result = resolveThreePaneSelection(sections, 'section-a', {
      'section-a': 'deleted-question',
    });
    expect(result.questionId).toBeNull();
    expect(result.sectionIndex).toBe(0);
  });

  it('ignores a question id recorded against a different section', () => {
    const result = resolveThreePaneSelection(sections, 'section-b', {
      'section-a': 'q1',
      'section-b': 'q1',
    });
    expect(result.questionId).toBeNull();
    expect(result.sectionIndex).toBe(1);
  });

  it('reports nothing selected when the section id does not resolve', () => {
    expect(resolveThreePaneSelection(sections, 'gone', { gone: 'q1' })).toEqual(
      {
        sectionIndex: 0,
        questionIndex: 0,
        questionId: null,
        sectionId: '',
      }
    );
  });

  it('handles an empty form without selecting anything', () => {
    expect(resolveThreePaneSelection([], '', {})).toEqual({
      sectionIndex: 0,
      questionIndex: 0,
      questionId: null,
      sectionId: '',
    });
  });
});

describe('reorderSectionQuestions', () => {
  const questions = [question('q1'), question('q2'), question('q3')];

  it('applies a valid new order', () => {
    const result = reorderSectionQuestions(questions, ['q3', 'q1', 'q2']);
    expect(result?.map((entry) => entry.id)).toEqual(['q3', 'q1', 'q2']);
  });

  it('is a no-op order when nothing moved', () => {
    const result = reorderSectionQuestions(questions, ['q1', 'q2', 'q3']);
    expect(result?.map((entry) => entry.id)).toEqual(['q1', 'q2', 'q3']);
  });

  it('refuses an order that drops a question', () => {
    // Writing this would delete a question the author never asked to remove.
    expect(reorderSectionQuestions(questions, ['q1', 'q2'])).toBeNull();
  });

  it('refuses an order that duplicates a question', () => {
    expect(reorderSectionQuestions(questions, ['q1', 'q1', 'q2'])).toBeNull();
  });

  it('refuses an order naming a question the section does not have', () => {
    expect(
      reorderSectionQuestions(questions, ['q1', 'q2', 'ghost'])
    ).toBeNull();
  });
});

describe('block actions', () => {
  const questions = [question('q1'), question('q2'), question('q3')];
  const ids = (list: typeof questions | null) =>
    list?.map((entry) => entry.id) ?? null;

  it('removes the question at an index', () => {
    expect(ids(removeSectionQuestion(questions, 1))).toEqual(['q1', 'q3']);
  });

  it('refuses to remove an index that does not exist', () => {
    // Returning the list unchanged would look like success; returning null
    // lets the caller decline to write anything.
    expect(removeSectionQuestion(questions, 3)).toBeNull();
    expect(removeSectionQuestion(questions, -1)).toBeNull();
  });

  it('inserts a copy directly after the source', () => {
    const copy = question('q2-copy');
    expect(ids(insertSectionQuestionAfter(questions, 1, copy))).toEqual([
      'q1',
      'q2',
      'q2-copy',
      'q3',
    ]);
  });

  it('appends when duplicating the last question', () => {
    const copy = question('q3-copy');
    expect(ids(insertSectionQuestionAfter(questions, 2, copy))).toEqual([
      'q1',
      'q2',
      'q3',
      'q3-copy',
    ]);
  });

  it('moves a question by a signed offset', () => {
    expect(ids(moveSectionQuestion(questions, 2, -1))).toEqual([
      'q1',
      'q3',
      'q2',
    ]);
    expect(ids(moveSectionQuestion(questions, 0, 1))).toEqual([
      'q2',
      'q1',
      'q3',
    ]);
  });

  it('refuses a move that would fall off either end', () => {
    expect(moveSectionQuestion(questions, 0, -1)).toBeNull();
    expect(moveSectionQuestion(questions, 2, 1)).toBeNull();
  });
});
