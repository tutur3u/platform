import { describe, expect, it } from 'vitest';
import { createDefaultFormStudioInput } from '../schema';
import {
  duplicateQuestionInput,
  duplicateSectionInput,
  exportFormStudioPayload,
  importFormStudioPayload,
  remapFormStudioIds,
} from './studio-utils';

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

describe('studio-utils export/import', () => {
  it('exportFormStudioPayload produces a versioned envelope with form data', () => {
    const input = createDefaultFormStudioInput();
    const envelope = exportFormStudioPayload(input);

    expect(envelope.formatVersion).toBe('1');
    expect(envelope.exportedAt).toBeDefined();
    expect(new Date(envelope.exportedAt).getTime()).not.toBeNaN();
    expect(envelope.form.title).toBe(input.title);
    expect(envelope.form.sections).toHaveLength(input.sections.length);
  });

  it('importFormStudioPayload parses valid JSON and remaps IDs', () => {
    const input = createDefaultFormStudioInput();
    const envelope = exportFormStudioPayload(input);
    const json = JSON.stringify(envelope);
    const result = importFormStudioPayload(json);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.title).toBe(input.title);
      expect(result.data.sections).toHaveLength(input.sections.length);
      const firstSection = result.data.sections[0];
      const originalFirst = input.sections[0];
      expect(firstSection?.id).toBeDefined();
      expect(firstSection?.id).not.toBe(originalFirst?.id);
    }
  });

  it('importFormStudioPayload normalizes legacy local datetimes', () => {
    const input = createDefaultFormStudioInput();
    input.openAt = '2026-03-16T06:57';
    input.closeAt = '2026-03-16T06:57:14';
    const json = JSON.stringify({
      formatVersion: '1',
      exportedAt: new Date().toISOString(),
      form: input,
    });

    const result = importFormStudioPayload(json);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.openAt).toBe(
        new Date(2026, 2, 16, 6, 57, 0, 0).toISOString()
      );
      expect(result.data.closeAt).toBe(
        new Date(2026, 2, 16, 6, 57, 14, 0).toISOString()
      );
      expect(result.data.sections[0]?.id).not.toBe(input.sections[0]?.id);
    }
  });

  it('importFormStudioPayload accepts offset-bearing ISO datetimes', () => {
    const input = createDefaultFormStudioInput();
    input.openAt = '2026-03-16T17:00:00+00:00';
    input.closeAt = '2026-03-23T17:00:00+00:00';
    const json = JSON.stringify({
      formatVersion: '1',
      exportedAt: new Date().toISOString(),
      form: input,
    });

    const result = importFormStudioPayload(json);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.openAt).toBe('2026-03-16T17:00:00+00:00');
      expect(result.data.closeAt).toBe('2026-03-23T17:00:00+00:00');
    }
  });

  it('exportFormStudioPayload rewrites legacy local datetimes to canonical ISO', () => {
    const input = createDefaultFormStudioInput();
    input.openAt = '2026-03-16T06:57';
    input.closeAt = '2026-03-16T06:57:14';

    const envelope = exportFormStudioPayload(input);

    expect(envelope.form.openAt).toBe(
      new Date(2026, 2, 16, 6, 57, 0, 0).toISOString()
    );
    expect(envelope.form.closeAt).toBe(
      new Date(2026, 2, 16, 6, 57, 14, 0).toISOString()
    );
  });

  it('export/import preserves validation settings (integer, real, regex, email)', () => {
    const input = createDefaultFormStudioInput();
    input.sections[0]!.questions[0] = {
      id: 'q1',
      type: 'short_text',
      title: 'Age',
      description: '',
      required: true,
      image: { storagePath: '', url: '', alt: '' },
      settings: {
        validationMode: 'integer',
        validationMin: 0,
        validationMax: 120,
        validationMessage: 'Enter a valid age.',
      },
      options: [],
    };
    input.sections[0]!.questions.push({
      id: 'q2',
      type: 'short_text',
      title: 'Weight (kg)',
      description: '',
      required: false,
      image: { storagePath: '', url: '', alt: '' },
      settings: {
        validationMode: 'real',
        validationMin: 20,
        validationMax: 300,
        validationMessage: 'Enter weight between 20 and 300.',
      },
      options: [],
    });
    input.sections[0]!.questions.push({
      id: 'q3',
      type: 'short_text',
      title: 'Email',
      description: '',
      required: false,
      image: { storagePath: '', url: '', alt: '' },
      settings: {
        validationMode: 'email',
        validationMessage: 'Invalid email.',
      },
      options: [],
    });

    const envelope = exportFormStudioPayload(input);
    const json = JSON.stringify(envelope);
    const result = importFormStudioPayload(json);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const q1 = result.data.sections[0]?.questions[0];
      const q2 = result.data.sections[0]?.questions[1];
      const q3 = result.data.sections[0]?.questions[2];
      expect(q1?.settings?.validationMode).toBe('integer');
      expect(q1?.settings?.validationMin).toBe(0);
      expect(q1?.settings?.validationMax).toBe(120);
      expect(q1?.settings?.validationMessage).toBe('Enter a valid age.');
      expect(q2?.settings?.validationMode).toBe('real');
      expect(q2?.settings?.validationMin).toBe(20);
      expect(q2?.settings?.validationMax).toBe(300);
      expect(q2?.settings?.validationMessage).toBe(
        'Enter weight between 20 and 300.'
      );
      expect(q3?.settings?.validationMode).toBe('email');
      expect(q3?.settings?.validationMessage).toBe('Invalid email.');
    }
  });

  it('importFormStudioPayload returns error for invalid JSON', () => {
    const result = importFormStudioPayload('not json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Invalid JSON');
    }
  });

  it('importFormStudioPayload returns error for invalid envelope shape', () => {
    const result = importFormStudioPayload(
      JSON.stringify({ formatVersion: '2', form: {} })
    );
    expect(result.ok).toBe(false);
  });

  it('remapFormStudioIds regenerates all IDs and remaps logic rule references', () => {
    const sectionA = 'section-a';
    const sectionB = 'section-b';
    const questionA = 'question-a';
    const input = createDefaultFormStudioInput();
    input.sections[0]!.id = sectionA;
    input.sections[0]!.questions[0]!.id = questionA;
    input.sections.push({
      id: sectionB,
      title: 'Section 2',
      description: '',
      image: { storagePath: '', url: '', alt: '' },
      questions: [
        {
          id: 'question-b',
          type: 'short_text',
          title: 'Q2',
          description: '',
          required: false,
          image: { storagePath: '', url: '', alt: '' },
          settings: {},
          options: [],
        },
      ],
    });
    input.logicRules = [
      {
        id: 'rule-1',
        triggerType: 'question',
        sourceQuestionId: questionA,
        operator: 'equals',
        comparisonValue: 'yes',
        actionType: 'go_to_section',
        targetSectionId: sectionB,
      },
    ];

    const remapped = remapFormStudioIds(input);

    expect(remapped.sections[0]?.id).not.toBe(sectionA);
    expect(remapped.sections[1]?.id).not.toBe(sectionB);
    expect(remapped.sections[0]?.questions[0]?.id).not.toBe(questionA);
    expect(remapped.logicRules[0]?.sourceQuestionId).toBe(
      remapped.sections[0]?.questions[0]?.id
    );
    expect(remapped.logicRules[0]?.targetSectionId).toBe(
      remapped.sections[1]?.id
    );
  });
});
