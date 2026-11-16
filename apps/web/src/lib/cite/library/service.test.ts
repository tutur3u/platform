import { CiteWorkSchema } from '@tuturuuu/cite';
import { describe, expect, it } from 'vitest';
import type { CitationLibraryItem, CitationLibraryStore } from './contracts';
import { createCitationLibraryService } from './service';

const wsId = '00000000-0000-4000-8000-00000000c101';
const otherWsId = '00000000-0000-4000-8000-00000000c102';
const actorId = '00000000-0000-4000-8000-00000000c103';
const itemId = '00000000-0000-4000-8000-00000000c104';
const scope = { wsId, actorId };
const work = CiteWorkSchema.parse({
  id: 'synthetic-1',
  type: 'book',
  title: 'Maps of invented rivers',
  authors: [{ kind: 'person', family: 'Vale', given: 'Mira' }],
  issued: { year: 2024 },
  provenance: { sourceCaptureMethod: 'manual', verificationStatus: 'manual' },
});

function fixture() {
  const rows = new Map<string, CitationLibraryItem>();
  const inScope = (workspace: string, id: string) => {
    const row = rows.get(id);
    return row?.wsId === workspace ? row : null;
  };
  const store: CitationLibraryStore = {
    list: async (workspace, query) =>
      [...rows.values()]
        .filter((row) => row.wsId === workspace)
        .slice(query.offset, query.offset + query.limit),
    get: async (workspace, id) => inScope(workspace, id),
    getMany: async (workspace, ids) =>
      [...rows.values()].filter(
        (row) => row.wsId === workspace && ids.includes(row.id)
      ),
    findFingerprint: async (workspace, fingerprint) =>
      [...rows.values()].find(
        (row) => row.wsId === workspace && row.fingerprint === fingerprint
      ) ?? null,
    insert: async (owner, input) => {
      const row = {
        ...input,
        wsId: owner.wsId,
        ownerUserId: owner.actorId,
        version: 1,
        createdAt: '2026-11-16T00:00:00Z',
        updatedAt: '2026-11-16T00:00:00Z',
      };
      rows.set(row.id, row);
      return row;
    },
    update: async (workspace, id, input) => {
      const row = inScope(workspace, id);
      if (!row || row.version !== input.expectedVersion) return null;
      const next = { ...row, ...input, version: row.version + 1 };
      rows.set(id, next);
      return next;
    },
    remove: async (workspace, id, expectedVersion) => {
      const row = inScope(workspace, id);
      return !!row && row.version === expectedVersion && rows.delete(id);
    },
  };
  return { rows, store, service: createCitationLibraryService(store) };
}

describe('citation library service boundaries', () => {
  it('stamps workspace and actor from the authorized scope', async () => {
    const { service } = fixture();
    const result = await service.create(scope, {
      id: itemId,
      work,
      tags: ['draft'],
    });
    expect(result.created).toBe(true);
    expect(result.item).toMatchObject({
      id: itemId,
      wsId,
      ownerUserId: actorId,
      version: 1,
    });
    expect(result.item.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects injected ownership and unbounded records before writing', async () => {
    const { service, rows } = fixture();
    await expect(
      service.create(scope, { id: itemId, work, ownerUserId: actorId })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      service.create(scope, {
        id: itemId,
        work,
        tags: Array.from({ length: 31 }, () => 'x'),
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      service.create(scope, {
        id: itemId,
        work,
        tags: Array.from({ length: 30 }, () => '界'.repeat(100)),
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(rows.size).toBe(0);
  });

  it('replays a create idempotently without rewriting the saved item', async () => {
    const { service } = fixture();
    const input = { id: itemId, work, tags: ['draft'] };
    const first = await service.create(scope, input);
    const second = await service.create(scope, input);
    expect(second).toEqual({ item: first.item, created: false });
  });

  it('does not change an existing operation id to different input', async () => {
    const { service } = fixture();
    await service.create(scope, { id: itemId, work });
    await expect(
      service.create(scope, {
        id: itemId,
        work: { ...work, title: 'Different source' },
      })
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('returns the scoped duplicate id without silently merging metadata', async () => {
    const { service } = fixture();
    await service.create(scope, { id: itemId, work });
    await expect(
      service.create(scope, {
        id: '00000000-0000-4000-8000-00000000c105',
        work,
      })
    ).rejects.toMatchObject({ code: 'DUPLICATE_SOURCE', existingId: itemId });
  });

  it('does not return another workspace item', async () => {
    const { service } = fixture();
    await service.create(scope, { id: itemId, work });
    await expect(
      service.get({ ...scope, wsId: otherWsId }, itemId)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(
      (await service.list({ ...scope, wsId: otherWsId }, {})).items
    ).toEqual([]);
  });

  it('preserves the first update when a second writer has the same version', async () => {
    const { service } = fixture();
    await service.create(scope, { id: itemId, work });
    const results = await Promise.allSettled([
      service.update(scope, itemId, {
        expectedVersion: 1,
        work: { ...work, title: 'First edit' },
      }),
      service.update(scope, itemId, {
        expectedVersion: 1,
        work: { ...work, title: 'Second edit' },
      }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected')
    ).toHaveLength(1);
    expect(await service.get(scope, itemId)).toMatchObject({ version: 2 });
  });

  it('refuses a stale delete and treats repeated confirmed deletion as absent', async () => {
    const { service } = fixture();
    await service.create(scope, { id: itemId, work });
    await expect(service.remove(scope, itemId, 2)).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
    });
    await service.remove(scope, itemId, 1);
    await service.remove(scope, itemId, 1);
    await expect(service.get(scope, itemId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('fails closed if storage returns an out-of-scope row', async () => {
    const { service, store } = fixture();
    const created = await service.create(scope, { id: itemId, work });
    store.list = async () => [{ ...created.item, wsId: otherWsId }];
    await expect(service.list(scope, {})).rejects.toMatchObject({
      code: 'LIBRARY_UNAVAILABLE',
    });
  });

  it('keeps shared library records readable after creator attribution is removed', async () => {
    const { service, rows } = fixture();
    const created = await service.create(scope, { id: itemId, work });
    rows.set(itemId, { ...created.item, ownerUserId: null, version: 2 });
    expect(await service.get(scope, itemId)).toMatchObject({
      id: itemId,
      ownerUserId: null,
      work: { title: work.title },
    });
  });

  it('loads a bounded batch in scope and reports only missing requested IDs', async () => {
    const { service } = fixture();
    await service.create(scope, { id: itemId, work });
    expect(
      await service.getMany(scope, { ids: [itemId, otherWsId] })
    ).toMatchObject({
      items: [{ id: itemId }],
      missingIds: [otherWsId],
    });
    expect(
      await service.getMany({ ...scope, wsId: otherWsId }, { ids: [itemId] })
    ).toEqual({ items: [], missingIds: [itemId] });
    await expect(
      service.getMany(scope, { ids: [itemId, itemId] })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      service.getMany(scope, { ids: Array.from({ length: 51 }, () => itemId) })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('bounds pagination instead of accepting arbitrary list queries', async () => {
    const { service } = fixture();
    await expect(service.list(scope, { limit: 101 })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    await expect(service.list(scope, { offset: -1 })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    await expect(
      service.list(scope, { wsId: otherWsId })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
