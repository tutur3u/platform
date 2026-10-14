import { z } from 'zod';
import { type ContextEvidence, evidenceSchema } from './contracts';

export const REVIEWED_JOURNAL_PARSER_SHA =
  '2c651de443636f60a7614f05813cf201afbe4dfec8c250b9f98bf365a8cce372';

const canonicalJournalReference = z
  .object({
    kind: z.literal('journal'),
    actorId: z.guid(),
    personalWorkspaceId: z.guid(),
    sourceId: z.guid(),
    sourceVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    observedAt: z.iso.datetime({ precision: 3 }),
    expiresAt: z.iso.datetime({ precision: 3 }),
    deletionVersion: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER),
    revocationVersion: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER),
    consentVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict()
  .refine(
    (value) => value.expiresAt > value.observedAt,
    'Expired reference interval'
  );

export type CanonicalJournalReference = z.infer<
  typeof canonicalJournalReference
>;
export type QualifiedJournalParser = {
  kind: 'qualified';
  sourceSha256: typeof REVIEWED_JOURNAL_PARSER_SHA;
  parse(value: unknown): unknown;
};
export type JournalReferenceResult =
  | { kind: 'denied'; reason: string }
  | {
      kind: 'synthetic-reference';
      canonical: CanonicalJournalReference;
      evidence: Extract<ContextEvidence, { kind: 'journal' }>;
      parserSourceSha256: typeof REVIEWED_JOURNAL_PARSER_SHA;
      runtimeAdmission: 'denied';
    };

/** A parser descriptor is metadata, not authority. Every result stays synthetic. */
export function adaptSyntheticJournalReference(
  input: unknown,
  parser: QualifiedJournalParser | undefined = undefined
): JournalReferenceResult {
  if (
    parser?.kind !== 'qualified' ||
    parser.sourceSha256 !== REVIEWED_JOURNAL_PARSER_SHA ||
    typeof parser.parse !== 'function'
  )
    return { kind: 'denied', reason: 'journal-parser-unqualified' };
  const inputResult = canonicalJournalReference.safeParse(input);
  if (!inputResult.success)
    return { kind: 'denied', reason: 'journal-reference-invalid' };
  const expectedMetadata = JSON.stringify(inputResult.data);
  let output: unknown;
  try {
    output = parser.parse(inputResult.data);
  } catch {
    return { kind: 'denied', reason: 'journal-parser-failed' };
  }
  const parsed = canonicalJournalReference.safeParse(output);
  if (!parsed.success || JSON.stringify(parsed.data) !== expectedMetadata)
    return { kind: 'denied', reason: 'journal-parser-output-conflict' };
  const { sourceVersion, ...metadata } = parsed.data;
  const evidence = evidenceSchema.safeParse({
    ...metadata,
    sourceRevision: sourceVersion,
  });
  if (!evidence.success || evidence.data.kind !== 'journal')
    return { kind: 'denied', reason: 'internal-identity-unqualified' };
  return {
    kind: 'synthetic-reference',
    canonical: parsed.data,
    evidence: evidence.data,
    parserSourceSha256: REVIEWED_JOURNAL_PARSER_SHA,
    runtimeAdmission: 'denied',
  };
}
