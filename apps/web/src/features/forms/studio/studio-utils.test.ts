import { describe, expect, it } from 'vitest';
import { duplicateQuestionInput, duplicateSectionInput } from './studio-utils';

describe('studio-utils duplication helpers', () => {
  it('duplicates a question with fresh ids and preserved content', () => {
    const duplicated = duplicateQuestionInput({
      id: 'question-1',
      type: 'single_choice',
      title: '<p><strong>Favorite fruit</strong></p>',
      description: '<p>Pick one option.</p>',
      required: true,
      image: {
        storagePath: 'workspaces/ws/forms/question.png',
        url: 'https://example.com/question.png',
        alt: 'Question',
      },
      settings: {
        optionLayout: 'grid',
        placeholder: 'Choose',
      },
      options: [
        {
          id: 'option-1',
          label: '<p>Apple</p>',
          value: 'apple',
          image: {
            storagePath: 'workspaces/ws/forms/apple.png',
            url: 'https://example.com/apple.png',
            alt: 'Apple',
          },
        },
      ],
    });

    expect(duplicated.id).not.toBe('question-1');
    expect(duplicated.options[0]?.id).not.toBe('option-1');
    expect(duplicated.title).toBe('<p><strong>Favorite fruit</strong></p>');
    expect(duplicated.options[0]?.value).toBe('apple');
    expect(duplicated.image.url).toBe('https://example.com/question.png');
    expect(duplicated.options[0]?.image.url).toBe(
      'https://example.com/apple.png'
    );
  });

  it('duplicates a section with fresh nested ids and preserved media', () => {
    const duplicated = duplicateSectionInput({
      id: 'section-1',
      title: '<p>Section title</p>',
      description: '<p>Section description</p>',
      image: {
        storagePath: 'workspaces/ws/forms/section.png',
        url: 'https://example.com/section.png',
        alt: 'Section',
      },
      questions: [
        {
          id: 'question-1',
          type: 'short_text',
          title: '<p>Question</p>',
          description: '',
          required: false,
          image: { storagePath: '', url: '', alt: '' },
          settings: {
            placeholder: 'Answer',
          },
          options: [],
        },
      ],
    });

    expect(duplicated.id).not.toBe('section-1');
    expect(duplicated.questions[0]?.id).not.toBe('question-1');
    expect(duplicated.image.url).toBe('https://example.com/section.png');
    expect(duplicated.questions).toHaveLength(1);
  });
});
