import {
  journalDocumentSchema,
  journalEntrySchema,
} from '@tuturuuu/internal-api/personal-journal';
import { describe, expect, it } from 'vitest';
import { confirmJournalAttempt, makeJournalAttempt } from './draft';

const id = '00000000-0000-4000-8000-000000000001',
  actorId = '00000000-0000-4000-8000-000000000002',
  workspaceId = '00000000-0000-4000-8000-000000000003';
const document = journalDocumentSchema.parse({
  title: 'Reflection',
  body: 'Original words',
  occurredAt: '2026-10-12T10:00:00.000Z',
  timezone: 'UTC',
  mood: null,
  moodContext: '',
  domain: 'life',
  category: 'reflection',
});
const receipt = journalEntrySchema.parse({
  ...document,
  id,
  actorId,
  workspaceId,
  revision: 1,
  createdAt: document.occurredAt,
  updatedAt: document.occurredAt,
});
describe('journal immutable attempt and acknowledgment', () => {
  it('keeps the exact original document even if the later editable object changes', () => {
    const editable = { ...document };
    const attempt = makeJournalAttempt(editable, id, actorId, 0);
    editable.body = 'Later words';
    expect(attempt).toEqual({ kind: 'create', input: { id, document } });
    expect(
      confirmJournalAttempt(attempt, receipt, actorId, workspaceId)
    ).toEqual(receipt);
  });
  it('does not acknowledge unrelated scope, content, id or revision', () => {
    const attempt = makeJournalAttempt(document, id, actorId, 0);
    for (const result of [
      { ...receipt, actorId: id },
      { ...receipt, workspaceId: id },
      { ...receipt, id: actorId },
      { ...receipt, revision: 2 },
      { ...receipt, body: 'Rewritten words' },
    ])
      expect(() =>
        confirmJournalAttempt(attempt, result, actorId, workspaceId)
      ).toThrow();
  });
  it('retains expected revision and immutable operation identity for retry', () => {
    expect(makeJournalAttempt(document, id, actorId, 2)).toEqual({
      kind: 'update',
      id,
      input: { operationId: actorId, expectedRevision: 2, document },
    });
  });
});
