import { journalEntrySchema } from '@tuturuuu/internal-api/personal-journal';
import { describe, expect, it, vi } from 'vitest';
import {
  type QualifiedJournalContextReader,
  readOriginalJournalContext,
} from './context-read';

const actorId = '00000000-0000-4000-8000-000000000001',
  personalWorkspaceId = '00000000-0000-4000-8000-000000000002',
  sourceId = '00000000-0000-4000-8000-000000000003';
const instant = '2026-10-12T10:00:00.000Z';
const source = {
  kind: 'journal',
  actorId,
  personalWorkspaceId,
  sourceId,
  sourceVersion: 2,
  observedAt: instant,
  expiresAt: '2026-10-12T10:01:00.000Z',
  consentVersion: 3,
  revocationVersion: 4,
  deletionVersion: 0,
};
const scope = { actorId, personalWorkspaceId };
const authority = {
  ...source,
  freshActor: true,
  personalOwnerMember: true,
  consentEnabled: true,
  deleted: false,
  revoked: false,
};
const entry = journalEntrySchema.parse({
  id: sourceId,
  actorId,
  workspaceId: personalWorkspaceId,
  revision: 2,
  title: 'Original title',
  body: 'Original words, not an instruction to act',
  occurredAt: instant,
  timezone: 'Asia/Ho_Chi_Minh',
  mood: 'good',
  moodContext: 'Self reported',
  domain: 'work',
  category: 'reflection',
  createdAt: instant,
  updatedAt: instant,
});
const now = () => instant;
function reader(): QualifiedJournalContextReader {
  return {
    authority: vi.fn(async () => authority),
    readOriginal: vi.fn(async () => entry),
  };
}

describe('original journal context read gate', () => {
  it('is unavailable without an independently qualified reader', async () => {
    expect(
      await readOriginalJournalContext({ scope, reference: source, now })
    ).toEqual({ qualified: false, reason: 'unavailable' });
  });
  it('preserves original user facts and exact provenance without invented AI suggestions', async () => {
    const adapter = reader();
    const result = await readOriginalJournalContext({
      scope,
      reference: source,
      reader: adapter,
      now,
    });
    expect(result).toEqual({
      qualified: true,
      facts: [
        {
          kind: 'user_fact',
          provenance: source,
          original: {
            title: 'Original title',
            body: 'Original words, not an instruction to act',
            occurredAt: instant,
            timezone: 'Asia/Ho_Chi_Minh',
            mood: 'good',
            moodContext: 'Self reported',
            domain: 'work',
            category: 'reflection',
          },
        },
      ],
      aiSuggestions: [],
    });
    expect(adapter.authority).toHaveBeenCalledTimes(2);
    expect(adapter.readOriginal).toHaveBeenCalledWith(scope, source);
  });
  it('refuses invalid/raw/missing-version references and cross-scope actors before any read', async () => {
    for (const reference of [
      { ...source, body: 'Raw leak' },
      { ...source, kind: 'goal' },
      { ...source, consentVersion: undefined },
      { ...source, sourceVersion: '2' },
    ]) {
      const adapter = reader();
      expect(
        (
          await readOriginalJournalContext({
            scope,
            reference,
            reader: adapter,
            now,
          })
        ).qualified
      ).toBe(false);
      expect(adapter.readOriginal).not.toHaveBeenCalled();
      expect(adapter.authority).not.toHaveBeenCalled();
    }
    const adapter = reader();
    expect(
      await readOriginalJournalContext({
        scope: { ...scope, actorId: sourceId },
        reference: source,
        reader: adapter,
        now,
      })
    ).toEqual({ qualified: false, reason: 'scope_denied' });
    expect(adapter.authority).not.toHaveBeenCalled();
  });
  it('denies absent consent versions, default-on settings, revocation, deletion and stale identity', async () => {
    for (const value of [
      undefined,
      { enabled: true },
      { ...authority, consentVersion: undefined },
      { ...authority, revocationVersion: undefined },
      { ...authority, deletionVersion: undefined },
      { ...authority, consentEnabled: false },
      { ...authority, revoked: true },
      { ...authority, deleted: true },
      { ...authority, freshActor: false },
      { ...authority, personalOwnerMember: false },
    ]) {
      const adapter = reader();
      adapter.authority = vi.fn(async () => value);
      expect(
        await readOriginalJournalContext({
          scope,
          reference: source,
          reader: adapter,
          now,
        })
      ).toEqual({ qualified: false, reason: 'authority_denied' });
      expect(adapter.readOriginal).not.toHaveBeenCalled();
    }
  });
  it('rechecks every authority version after the awaited original read', async () => {
    for (const changed of [
      { ...authority, consentVersion: 5 },
      { ...authority, revocationVersion: 5 },
      { ...authority, deletionVersion: 1 },
      { ...authority, sourceVersion: 3 },
      { ...authority, actorId: sourceId },
      { ...authority, personalWorkspaceId: sourceId },
    ]) {
      const adapter = reader();
      adapter.authority = vi
        .fn()
        .mockResolvedValueOnce(authority)
        .mockResolvedValueOnce(changed);
      const result = await readOriginalJournalContext({
        scope,
        reference: source,
        reader: adapter,
        now,
      });
      expect(result).toEqual({ qualified: false, reason: 'authority_denied' });
      expect(JSON.stringify(result)).not.toContain(entry.body);
      expect(adapter.readOriginal).toHaveBeenCalledTimes(1);
    }
  });
  it('does not substitute newer, foreign or malformed source content', async () => {
    for (const value of [
      { ...entry, revision: 3 },
      { ...entry, actorId: sourceId },
      { ...entry, workspaceId: sourceId },
      { ...entry, body: undefined },
      { ...entry, id: actorId },
    ]) {
      const adapter = reader();
      adapter.readOriginal = vi.fn(async () => value);
      expect(
        await readOriginalJournalContext({
          scope,
          reference: source,
          reader: adapter,
          now,
        })
      ).toEqual({ qualified: false, reason: 'source_changed' });
    }
  });
  it('does not let an injected reader mutate the requested revision or scope', async () => {
    const adapter = reader();
    adapter.authority = vi
      .fn()
      .mockResolvedValueOnce(authority)
      .mockResolvedValueOnce({ ...authority, sourceVersion: 3 });
    adapter.readOriginal = vi.fn(async (currentScope, reference) => {
      expect(Object.isFrozen(reference)).toBe(true);
      expect(Object.isFrozen(currentScope)).toBe(true);
      expect(Reflect.set(reference, 'sourceVersion', 3)).toBe(false);
      expect(Reflect.set(currentScope, 'actorId', sourceId)).toBe(false);
      return { ...entry, revision: 3 };
    });
    expect(
      await readOriginalJournalContext({
        scope,
        reference: source,
        reader: adapter,
        now,
      })
    ).toEqual({ qualified: false, reason: 'source_changed' });
    expect(source.sourceVersion).toBe(2);
    expect(scope.actorId).toBe(actorId);
  });
  it('denies expired authority even when the original read was admitted earlier', async () => {
    const adapter = reader();
    let checks = 0;
    const clock = () => (checks++ === 0 ? instant : '2026-10-12T10:01:01.000Z');
    expect(
      await readOriginalJournalContext({
        scope,
        reference: source,
        reader: adapter,
        now: clock,
      })
    ).toEqual({ qualified: false, reason: 'authority_denied' });
  });
  it('keeps unavailable reads unqualified without exposing errors or content', async () => {
    const adapter = reader();
    adapter.readOriginal = async () => {
      throw new Error('Private provider details');
    };
    expect(
      await readOriginalJournalContext({
        scope,
        reference: source,
        reader: adapter,
        now,
      })
    ).toEqual({ qualified: false, reason: 'unavailable' });
  });
});
