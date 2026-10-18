import {
  journalEntrySchema,
  parseJournalSourceReference,
} from '@tuturuuu/internal-api/personal-journal';
import { describe, expect, it } from 'vitest';
import { projectJournalReference } from './reference';

const actorId = '00000000-0000-4000-8000-000000000001',
  workspaceId = '00000000-0000-4000-8000-000000000002',
  sourceId = '00000000-0000-4000-8000-000000000003';
const now = '2026-10-12T10:00:00.000Z';
const entry = journalEntrySchema.parse({
  id: sourceId,
  actorId,
  workspaceId,
  title: 'Private title',
  body: 'Private original',
  occurredAt: now,
  timezone: 'UTC',
  mood: 'good',
  moodContext: 'Private',
  domain: 'work',
  category: 'reflection',
  revision: 2,
  createdAt: now,
  updatedAt: now,
});
const authority = {
  kind: 'journal',
  actorId,
  personalWorkspaceId: workspaceId,
  sourceId,
  sourceVersion: 2,
  observedAt: now,
  expiresAt: '2026-10-12T10:01:00.000Z',
  consentVersion: 3,
  deletionVersion: 0,
  revocationVersion: 4,
  consentEnabled: true,
  deleted: false,
  revoked: false,
};
describe('journal metadata authority', () => {
  it('emits only an exact metadata reference after fresh authoritative proof', () => {
    const result = projectJournalReference(
      entry,
      { actorId, workspaceId },
      authority,
      now
    );
    expect(result).toEqual({
      qualified: true,
      reference: {
        kind: 'journal',
        actorId,
        personalWorkspaceId: workspaceId,
        sourceId,
        sourceVersion: 2,
        observedAt: now,
        expiresAt: '2026-10-12T10:01:00.000Z',
        consentVersion: 3,
        deletionVersion: 0,
        revocationVersion: 4,
      },
    });
    expect(JSON.stringify(result)).not.toContain('Private');
  });
  it('denies absent versions, unknown consent, revoked/deleted/stale scope or revision', () => {
    const { consentVersion: _version, ...missing } = authority;
    for (const value of [
      undefined,
      missing,
      { ...authority, consentEnabled: false },
      { ...authority, revoked: true },
      { ...authority, deleted: true },
      { ...authority, sourceVersion: 1 },
      { ...authority, actorId: workspaceId },
      { ...authority, personalWorkspaceId: actorId },
      { ...authority, observedAt: '2026-10-12T09:58:00.000Z' },
      { ...authority, expiresAt: now },
    ]) {
      expect(
        projectJournalReference(entry, { actorId, workspaceId }, value, now)
      ).toEqual({ qualified: false });
    }
    expect(
      projectJournalReference(
        entry,
        { actorId, workspaceId: 'team' },
        authority,
        now
      )
    ).toEqual({ qualified: false });
  });
  it('strictly rejects raw content and fabricated missing defaults at portable boundary', () => {
    const {
      consentEnabled: _enabled,
      deleted: _deleted,
      revoked: _revoked,
      ...reference
    } = authority;
    expect(() =>
      parseJournalSourceReference({ ...reference, body: entry.body })
    ).toThrow();
    expect(() =>
      parseJournalSourceReference({ ...reference, consentVersion: undefined })
    ).toThrow();
    expect(() =>
      parseJournalSourceReference({ ...reference, consentVersion: 0 })
    ).toThrow();
  });
});
