import type {
  JournalDocument,
  JournalEntry,
} from '@tuturuuu/internal-api/personal-journal';
import { describe, expect, it, vi } from 'vitest';
import { getJournalStore } from './provider';
import {
  JournalForbidden,
  JournalNotFound,
  type JournalStore,
  JournalUnavailable,
  journalService,
} from './service';

const scope = {
  actorId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
};
const document: JournalDocument = {
  title: 'Reflection',
  body: 'Original source',
  occurredAt: '2026-10-12T10:00:00.000Z',
  timezone: 'Asia/Ho_Chi_Minh',
  mood: 'good',
  moodContext: 'Self reported',
  domain: 'life',
  category: 'reflection',
};
const entry: JournalEntry = {
  ...document,
  ...scope,
  id: '00000000-0000-4000-8000-000000000003',
  revision: 1,
  createdAt: document.occurredAt,
  updatedAt: document.occurredAt,
};
function store(result = entry): JournalStore {
  return {
    list: vi.fn(async () => ({ items: [result], nextBefore: null })),
    read: vi.fn(async () => result),
    create: vi.fn(async () => result),
    update: vi.fn(async () => result),
  };
}
describe('journal service scope', () => {
  it('returns actual source and binds each write to trusted actor/workspace', async () => {
    const provider = store();
    const service = journalService(provider, scope);
    expect((await service.read(entry.id)).body).toBe('Original source');
    const input = { id: entry.id, document };
    expect(await service.create(input)).toEqual(entry);
    expect(provider.create).toHaveBeenCalledWith(scope, input);
  });
  it('refuses foreign owner and workspace output on every operation', async () => {
    for (const result of [
      { ...entry, actorId: 'foreign' },
      { ...entry, workspaceId: 'team' },
    ]) {
      const service = journalService(store(result), scope);
      await expect(service.list()).rejects.toBeInstanceOf(JournalForbidden);
      await expect(service.read(entry.id)).rejects.toBeInstanceOf(
        JournalForbidden
      );
      await expect(
        service.create({ id: entry.id, document })
      ).rejects.toBeInstanceOf(JournalForbidden);
      await expect(
        service.update(entry.id, {
          expectedRevision: 1,
          operationId: entry.id,
          document,
        })
      ).rejects.toBeInstanceOf(JournalForbidden);
    }
  });
  it('does not turn missing or unqualified storage into empty or saved state', async () => {
    expect(() => getJournalStore()).toThrow(JournalUnavailable);
    const provider = store();
    provider.read = async () => null;
    await expect(
      journalService(provider, scope).read(entry.id)
    ).rejects.toBeInstanceOf(JournalNotFound);
  });
});
