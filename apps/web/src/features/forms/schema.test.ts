import { describe, expect, it } from 'vitest';
import {
  createDefaultFormStudioInput,
  formExportEnvelopeSchema,
  formLogicRuleSchema,
  formProgressSchema,
  formStudioSchema,
  formSubmitSchema,
} from './schema';

describe('formStudioSchema', () => {
  it('accepts empty strings for openAt and closeAt as null', () => {
    const input = {
      ...createDefaultFormStudioInput(),
      openAt: '',
      closeAt: '',
    };
    const parsed = formStudioSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.openAt).toBe(null);
      expect(parsed.data.closeAt).toBe(null);
    }
  });

  it('accepts valid ISO datetime strings for openAt and closeAt', () => {
    const validDate = new Date().toISOString();
    const input = {
      ...createDefaultFormStudioInput(),
      openAt: validDate,
      closeAt: validDate,
    };
    const parsed = formStudioSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.openAt).toBe(validDate);
      expect(parsed.data.closeAt).toBe(validDate);
    }
  });

  it('accepts offset-bearing ISO datetime strings for openAt and closeAt', () => {
    const validDate = '2026-03-16T17:00:00+00:00';
    const input = {
      ...createDefaultFormStudioInput(),
      openAt: validDate,
      closeAt: validDate,
    };
    const parsed = formStudioSchema.safeParse(input);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.openAt).toBe(validDate);
      expect(parsed.data.closeAt).toBe(validDate);
    }
  });

  it('normalizes timezone-less ISO datetimes without seconds', () => {
    const input = {
      ...createDefaultFormStudioInput(),
      openAt: '2026-03-16T06:57',
      closeAt: '2026-03-16T06:57',
    };
    const parsed = formStudioSchema.safeParse(input);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.openAt).toBe(
        new Date(2026, 2, 16, 6, 57, 0, 0).toISOString()
      );
      expect(parsed.data.closeAt).toBe(
        new Date(2026, 2, 16, 6, 57, 0, 0).toISOString()
      );
    }
  });

  it('normalizes timezone-less ISO datetimes with seconds', () => {
    const input = {
      ...createDefaultFormStudioInput(),
      openAt: '2026-03-16T06:57:14',
      closeAt: '2026-03-16T06:57:14',
    };
    const parsed = formStudioSchema.safeParse(input);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.openAt).toBe(
        new Date(2026, 2, 16, 6, 57, 14, 0).toISOString()
      );
      expect(parsed.data.closeAt).toBe(
        new Date(2026, 2, 16, 6, 57, 14, 0).toISOString()
      );
    }
  });

  it('rejects non-ISO datetime strings for openAt and closeAt', () => {
    const input = {
      ...createDefaultFormStudioInput(),
      openAt: '2026/03/16 06:57',
      closeAt: '2026/03/16 06:57',
    };
    const parsed = formStudioSchema.safeParse(input);

    expect(parsed.success).toBe(false);
  });
});

describe('formSubmitSchema', () => {
  it('accepts canonical Postgres UUID answer keys used by seeded forms', () => {
    const parsed = formSubmitSchema.safeParse({
      sessionId: '50000000-0000-0000-0000-000000000901',
      answers: {
        '50000000-0000-0000-0000-000000000201': 'speed',
      },
    });

    expect(parsed.success).toBe(true);
  });
});

describe('formProgressSchema', () => {
  it('accepts canonical Postgres UUID question and section ids', () => {
    const parsed = formProgressSchema.safeParse({
      sessionId: '50000000-0000-0000-0000-000000000901',
      lastQuestionId: '50000000-0000-0000-0000-000000000201',
      lastSectionId: '50000000-0000-0000-0000-000000000101',
    });

    expect(parsed.success).toBe(true);
  });
});

describe('formExportEnvelopeSchema', () => {
  it('accepts valid envelope with formatVersion 1', () => {
    const form = createDefaultFormStudioInput();
    const parsed = formExportEnvelopeSchema.safeParse({
      formatVersion: '1',
      exportedAt: new Date().toISOString(),
      form,
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects envelope with wrong formatVersion', () => {
    const form = createDefaultFormStudioInput();
    const parsed = formExportEnvelopeSchema.safeParse({
      formatVersion: '2',
      exportedAt: new Date().toISOString(),
      form,
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects envelope with invalid form structure', () => {
    const parsed = formExportEnvelopeSchema.safeParse({
      formatVersion: '1',
      exportedAt: new Date().toISOString(),
      form: { title: '', sections: [] },
    });

    expect(parsed.success).toBe(false);
  });
});

describe('formLogicRuleSchema', () => {
  it('accepts question-based rule with all required fields', () => {
    const parsed = formLogicRuleSchema.safeParse({
      triggerType: 'question',
      sourceQuestionId: 'q1',
      operator: 'equals',
      comparisonValue: 'yes',
      actionType: 'go_to_section',
      targetSectionId: 's2',
    });

    expect(parsed.success).toBe(true);
  });

  it('accepts section-end completion-only rule', () => {
    const parsed = formLogicRuleSchema.safeParse({
      triggerType: 'section_end',
      sourceSectionId: 's1',
      sourceQuestionId: null,
      operator: 'equals',
      comparisonValue: '',
      actionType: 'submit',
    });

    expect(parsed.success).toBe(true);
  });

  it('accepts section-end question-based rule', () => {
    const parsed = formLogicRuleSchema.safeParse({
      triggerType: 'section_end',
      sourceSectionId: 's1',
      sourceQuestionId: 'q1',
      operator: 'equals',
      comparisonValue: 'yes',
      actionType: 'go_to_section',
      targetSectionId: 's2',
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects section-end rule without sourceSectionId', () => {
    const parsed = formLogicRuleSchema.safeParse({
      triggerType: 'section_end',
      sourceSectionId: '',
      sourceQuestionId: null,
      actionType: 'submit',
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects question-based rule without sourceQuestionId', () => {
    const parsed = formLogicRuleSchema.safeParse({
      triggerType: 'question',
      sourceQuestionId: '',
      operator: 'equals',
      comparisonValue: 'yes',
      actionType: 'go_to_section',
      targetSectionId: 's2',
    });

    expect(parsed.success).toBe(false);
  });
});
