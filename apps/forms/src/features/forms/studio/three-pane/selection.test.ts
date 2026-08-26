import { describe, expect, it } from 'vitest';
import type { FormStudioInput } from '../../schema';
import { resolveThreePaneSelection } from './selection';

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
