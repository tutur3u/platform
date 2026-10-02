import { describe, expect, it } from 'vitest';
import {
  authorProgrammingProblem,
  type ProgrammingProblemRow,
  publicProgrammingProblem,
} from './programming-model';
import {
  ProgrammingProblemEditSchema,
  ProgrammingProblemInputSchema,
} from './programming-schema';

const row: ProgrammingProblemRow = {
  id: '11111111-1111-4111-8111-111111111111',
  ws_id: '22222222-2222-4222-8222-222222222222',
  slug: 'synthetic-sum',
  title: { en: 'Synthetic sum', vi: 'Tổng thử nghiệm' },
  prompt: { en: 'Add two integers.', vi: 'Cộng hai số nguyên.' },
  starter_code: 'print(1 + 2)',
  difficulty: 'easy',
  topic: 'arrays',
  status: 'published',
  revision: 1,
};
const cases = [
  {
    problem_id: row.id,
    position: 0,
    input: '1 2',
    expected: '3',
    visible: true,
  },
  {
    problem_id: row.id,
    position: 1,
    input: 'PRIVATE INPUT',
    expected: 'PRIVATE ANSWER',
    visible: false,
  },
];
const input = {
  slug: row.slug,
  title: row.title,
  prompt: row.prompt,
  starterCode: row.starter_code,
  difficulty: row.difficulty,
  topic: row.topic,
  status: row.status,
  cases: cases.map(({ input, expected, visible }) => ({
    input,
    expected,
    visible,
  })),
};

describe('Programming privacy and author payload contracts', () => {
  it('never serializes hidden answers or workspace metadata to a learner', () => {
    const dto = publicProgrammingProblem(row, cases, false);
    expect(dto.publicCases).toEqual([{ input: '1 2', output: '3' }]);
    expect(JSON.stringify(dto)).not.toContain('PRIVATE');
    expect(dto).not.toHaveProperty('ws_id');
    expect(dto).not.toHaveProperty('cases');
    expect(dto.editable).toBe(false);
  });
  it('does not expose global hidden answers or global edit authority to workspace authors', () => {
    const dto = authorProgrammingProblem({ ...row, ws_id: null }, cases);
    expect(dto.editable).toBe(false);
    expect(JSON.stringify(dto)).not.toContain('PRIVATE');
  });
  it('includes private cases only in a workspace author DTO', () => {
    const dto = authorProgrammingProblem(row, cases);
    expect(dto.editable).toBe(true);
    expect(dto.cases[1]?.expected).toBe('PRIVATE ANSWER');
  });
  it('rejects client-selected workspace, actor, and revision fields on create', () => {
    for (const field of ['ws_id', 'created_by', 'updated_by', 'revision']) {
      expect(
        ProgrammingProblemInputSchema.safeParse({ ...input, [field]: row.id })
          .success
      ).toBe(false);
    }
  });
  it('requires a revision on edits without dropping privacy/payload refinements', () => {
    expect(
      ProgrammingProblemEditSchema.safeParse({ ...input, expectedRevision: 1 })
        .success
    ).toBe(true);
    expect(ProgrammingProblemEditSchema.safeParse(input).success).toBe(false);
    expect(
      ProgrammingProblemEditSchema.safeParse({ ...input, expectedRevision: 0 })
        .success
    ).toBe(false);
    expect(
      ProgrammingProblemEditSchema.safeParse({
        ...input,
        expectedRevision: 1,
        cases: [{ input: '', expected: '', visible: false }],
      }).success
    ).toBe(false);
  });
  it('rejects NUL in case text and every localized author field', () => {
    for (const field of ['input', 'expected']) {
      expect(
        ProgrammingProblemInputSchema.safeParse({
          ...input,
          cases: [{ input: '', expected: '', visible: true, [field]: '\0' }],
        }).success
      ).toBe(false);
    }
    for (const field of ['title', 'prompt'] as const)
      for (const locale of ['en', 'vi']) {
        expect(
          ProgrammingProblemInputSchema.safeParse({
            ...input,
            [field]: { ...input[field], [locale]: 'Invalid\0' },
          }).success
        ).toBe(false);
      }
  });
  it('rejects catalogs that cannot fit even a minimal unchanged execution envelope', () => {
    const oversized = Array.from({ length: 5 }, () => ({
      input: 'x'.repeat(4096),
      expected: 'x'.repeat(4096),
      visible: true,
    }));
    expect(
      ProgrammingProblemInputSchema.safeParse({ ...input, cases: oversized })
        .error?.issues
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Test cases exceed the existing judge payload limit.',
        }),
      ])
    );
  });
});
