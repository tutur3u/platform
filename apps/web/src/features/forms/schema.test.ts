import { describe, expect, it } from 'vitest';
import { formProgressSchema, formSubmitSchema } from './schema';

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
