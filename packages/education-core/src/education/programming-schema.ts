import { PROGRAMMING_CATALOG_CASE_LIMIT } from '@tuturuuu/types/primitives/programming';
import { z } from 'zod';

const localizedText = (max: number) =>
  z
    .object({
      en: z.string().trim().min(1).max(max),
      vi: z.string().trim().min(1).max(max),
    })
    .strict();

export const ProgrammingProblemId = z.guid();
export const ProgrammingCaseSchema = z
  .object({
    input: z.string().max(4096),
    expected: z.string().max(4096),
    visible: z.boolean(),
  })
  .strict();

export const ProgrammingProblemInputSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]{1,80}$/u),
    title: localizedText(255),
    prompt: localizedText(16_000),
    difficulty: z.enum(['easy', 'medium']),
    topic: z.enum(['arrays', 'search', 'stacks']),
    starterCode: z
      .string()
      .max(16_000)
      .refine((value) => !value.includes('\0')),
    status: z.enum(['draft', 'published', 'archived']),
    cases: z
      .array(ProgrammingCaseSchema)
      .min(1)
      .max(PROGRAMMING_CATALOG_CASE_LIMIT),
  })
  .strict()
  .superRefine((problem, context) => {
    if (!problem.cases.some((entry) => entry.visible)) {
      context.addIssue({
        code: 'custom',
        path: ['cases'],
        message: 'At least one public case is required.',
      });
    }
    // Preserve the existing 48,000-character base64url execution envelope. Source
    // length and the complete encoded command are checked again when executing.
    // A catalog cannot consume the envelope before even minimal source fits.
    const minimumPayload = JSON.stringify({
      cases: problem.cases,
      language: 'typescript',
      source: 'x',
    });
    if (new TextEncoder().encode(minimumPayload).byteLength > 35_900) {
      context.addIssue({
        code: 'custom',
        path: ['cases'],
        message: 'Test cases exceed the existing judge payload limit.',
      });
    }
  });

export const ProgrammingProblemEditSchema =
  ProgrammingProblemInputSchema.safeExtend({
    expectedRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  });
