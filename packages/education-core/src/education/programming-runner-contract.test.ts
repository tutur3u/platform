import {
  PROGRAMMING_CATALOG_CASE_LIMIT,
  PROGRAMMING_COMMAND_CASE_LIMIT,
} from '@tuturuuu/types/primitives/programming';
import { describe, expect, it, vi } from 'vitest';
import { parseJudgePayload } from '../../../sdk/src/cli/devbox-judge-sandbox';
import { ProgrammingExecutionSchema } from './programming-execution';
import { ProgrammingProblemInputSchema } from './programming-schema';

vi.mock('server-only', () => ({}));
const testCase = { input: '1\n', expected: '1\n', visible: true };
const problem = {
  slug: 'boundary',
  title: { en: 'Boundary', vi: 'Ranh giới' },
  prompt: { en: 'Print input', vi: 'In đầu vào' },
  difficulty: 'easy',
  topic: 'arrays',
  starterCode: 'print(input())',
  status: 'published',
  cases: [testCase],
};
const encoded = (cases: (typeof testCase)[]) =>
  Buffer.from(
    JSON.stringify({ language: 'python', source: 'print(input())', cases })
  ).toString('base64url');
describe('Programming catalogs match the actual runner parser without execution', () => {
  it('every admitted case count fits submission and public plus custom run modes', () => {
    for (let count = 1; count <= PROGRAMMING_CATALOG_CASE_LIMIT; count++) {
      const cases = Array.from({ length: count }, () => testCase);
      const parsed = ProgrammingProblemInputSchema.parse({ ...problem, cases });
      expect(parseJudgePayload(encoded(parsed.cases)).cases).toHaveLength(
        count
      );
      expect(
        parseJudgePayload(encoded([...parsed.cases, testCase])).cases
      ).toHaveLength(count + 1);
    }
  });
  it('reserves one custom case slot rather than enlarging runner limits', () => {
    expect(PROGRAMMING_CATALOG_CASE_LIMIT).toBe(9);
    expect(PROGRAMMING_COMMAND_CASE_LIMIT).toBe(10);
    for (const count of [10, 11])
      expect(
        ProgrammingProblemInputSchema.safeParse({
          ...problem,
          cases: Array.from({ length: count }, () => testCase),
        }).success
      ).toBe(false);
    expect(() =>
      parseJudgePayload(encoded(Array.from({ length: 11 }, () => testCase)))
    ).toThrow('Invalid Judge payload');
  });
  it('rejects NUL source before enqueue because the real parser rejects it', () => {
    expect(
      ProgrammingExecutionSchema.safeParse({
        problemId: '11111111-1111-4111-8111-111111111111',
        language: 'python',
        source: 'x\0',
        kind: 'submit',
      }).success
    ).toBe(false);
    expect(
      ProgrammingProblemInputSchema.safeParse({
        ...problem,
        starterCode: 'x\0',
      }).success
    ).toBe(false);
  });
});
