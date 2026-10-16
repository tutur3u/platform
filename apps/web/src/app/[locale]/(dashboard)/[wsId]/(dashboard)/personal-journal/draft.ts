import {
  type JournalCreate,
  type JournalDocument,
  type JournalEntry,
  type JournalUpdate,
  journalDocumentSchema,
} from '@tuturuuu/internal-api/personal-journal';
export type JournalAttempt =
  | { kind: 'create'; input: JournalCreate }
  | { kind: 'update'; id: string; input: JournalUpdate };
export function makeJournalAttempt(
  document: JournalDocument,
  id: string,
  operationId: string,
  revision: number
): JournalAttempt {
  const snapshot = journalDocumentSchema.parse(document);
  return revision === 0
    ? { kind: 'create', input: { id, document: snapshot } }
    : {
        kind: 'update',
        id,
        input: { operationId, expectedRevision: revision, document: snapshot },
      };
}
export function confirmJournalAttempt(
  attempt: JournalAttempt,
  entry: JournalEntry,
  actorId: string,
  workspaceId: string
) {
  const id = attempt.kind === 'create' ? attempt.input.id : attempt.id;
  const revision =
    attempt.kind === 'create' ? 1 : attempt.input.expectedRevision + 1;
  if (
    entry.id !== id ||
    entry.actorId !== actorId ||
    entry.workspaceId !== workspaceId ||
    entry.revision !== revision
  )
    throw new Error('Unconfirmed journal receipt');
  const actual = journalDocumentSchema.parse(
    Object.fromEntries(
      Object.entries(entry).filter(([key]) => key in attempt.input.document)
    )
  );
  if (JSON.stringify(actual) !== JSON.stringify(attempt.input.document))
    throw new Error('Journal receipt content mismatch');
  return entry;
}
