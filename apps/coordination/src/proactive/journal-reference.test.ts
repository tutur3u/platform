import { expect, it } from 'vitest';
import {
  adaptSyntheticJournalReference,
  type QualifiedJournalParser,
  REVIEWED_JOURNAL_PARSER_SHA,
} from './journal-reference';

const reference = {
  kind: 'journal',
  actorId: 'c1121e22-ace1-4123-8f77-593f201abc11',
  personalWorkspaceId: 'c1121e22-ace1-4123-8f77-593f201abc12',
  sourceId: 'c1121e22-ace1-4123-8f77-593f201abc13',
  sourceVersion: 7,
  observedAt: '2026-10-12T12:00:00.000Z',
  expiresAt: '2026-10-12T12:00:05.000Z',
  deletionVersion: 2,
  revocationVersion: 3,
  consentVersion: 4,
};
// Synthetic injected parser only. No import or execution of the actual journal service.
const parser: QualifiedJournalParser = {
  kind: 'qualified',
  sourceSha256: REVIEWED_JOURNAL_PARSER_SHA,
  parse: (value) => value,
};

it('missing reviewed parser denies even a canonical-looking fixture', () => {
  expect(adaptSyntheticJournalReference(reference)).toEqual({
    kind: 'denied',
    reason: 'journal-parser-unqualified',
  });
});
it('preserves sourceVersion and explicitly aliases the same number, without runtime authority', () => {
  const result = adaptSyntheticJournalReference(reference, parser);
  expect(result).toEqual({
    kind: 'synthetic-reference',
    canonical: reference,
    evidence: {
      kind: 'journal',
      actorId: reference.actorId,
      personalWorkspaceId: reference.personalWorkspaceId,
      sourceId: reference.sourceId,
      sourceRevision: 7,
      observedAt: reference.observedAt,
      expiresAt: reference.expiresAt,
      deletionVersion: 2,
      revocationVersion: 3,
      consentVersion: 4,
    },
    parserSourceSha256: REVIEWED_JOURNAL_PARSER_SHA,
    runtimeAdmission: 'denied',
  });
});
it('canonical precision, positivity, required versions and no-extra-fields gates remain exact', () => {
  const { consentVersion: _consent, ...missingConsent } = reference;
  const { deletionVersion: _deletion, ...missingDeletion } = reference;
  for (const input of [
    { ...reference, sourceVersion: '7' },
    { ...reference, sourceRevision: 7 },
    { ...reference, sourceVersion: 0 },
    { ...reference, sourceVersion: Number.MAX_SAFE_INTEGER + 1 },
    { ...reference, consentVersion: 0 },
    missingConsent,
    missingDeletion,
    { ...reference, observedAt: '2026-10-12T12:00:00Z' },
    { ...reference, observedAt: '2026-10-12T12:00:00.00Z' },
    { ...reference, observedAt: '2026-10-12T12:00:00.000+00:00' },
    { ...reference, expiresAt: reference.observedAt },
    { ...reference, body: 'private journal' },
    { ...reference, mood: 'inferred' },
  ])
    expect(adaptSyntheticJournalReference(input, parser)).toEqual({
      kind: 'denied',
      reason: 'journal-reference-invalid',
    });
});
it('a canonical GUID need not qualify as an internal RFC UUID', () => {
  expect(
    adaptSyntheticJournalReference(
      { ...reference, actorId: '11111111-1111-1111-1111-111111111111' },
      parser
    )
  ).toEqual({
    kind: 'denied',
    reason: 'internal-identity-unqualified',
  });
});
it('rejects injected parser failure, extra data or identity/version rewriting', () => {
  expect(
    adaptSyntheticJournalReference(reference, {
      ...parser,
      parse() {
        throw new Error('offline');
      },
    })
  ).toEqual({
    kind: 'denied',
    reason: 'journal-parser-failed',
  });
  for (const output of [
    { ...reference, sourceVersion: 8 },
    { ...reference, actorId: reference.sourceId },
    { ...reference, body: 'private' },
  ])
    expect(
      adaptSyntheticJournalReference(reference, {
        ...parser,
        parse: () => output,
      })
    ).toEqual({
      kind: 'denied',
      reason: 'journal-parser-output-conflict',
    });
});

it('rejects a parser that mutates its input while returning it', () => {
  expect(
    adaptSyntheticJournalReference(reference, {
      ...parser,
      parse(value) {
        if (value && typeof value === 'object')
          Reflect.set(value, 'sourceVersion', 8);
        return value;
      },
    })
  ).toEqual({ kind: 'denied', reason: 'journal-parser-output-conflict' });
});
it('a forged parser SHA is not qualification', () => {
  const forged = { ...parser };
  Object.defineProperty(forged, 'sourceSha256', { value: 'unreviewed' });
  expect(adaptSyntheticJournalReference(reference, forged)).toEqual({
    kind: 'denied',
    reason: 'journal-parser-unqualified',
  });
});
