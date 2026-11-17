import { createClient } from '@supabase/supabase-js';
import { CiteWorkSchema } from '@tuturuuu/cite';
import { describe, expect, it, vi } from 'vitest';
import { type CitationLibraryDatabase, getCitationLibraryStore } from './store';

vi.mock('server-only', () => ({}));

const wsId = '00000000-0000-4000-8000-00000000c201';
const otherWs = '00000000-0000-4000-8000-00000000c202';
const actorId = '00000000-0000-4000-8000-00000000c203';
const itemId = '00000000-0000-4000-8000-00000000c204';
const scope = { wsId, actorId };
const work = CiteWorkSchema.parse({
  id: 'test-work',
  type: 'book',
  title: 'Maps of invented rivers',
  authors: [{ kind: 'person', family: 'Vale' }],
  issued: { year: 2024 },
  provenance: { sourceCaptureMethod: 'manual', verificationStatus: 'manual' },
});
const fingerprint = 'a'.repeat(64);
const write = { work, fingerprint, tags: ['draft'] };
const row = {
  ...write,
  id: itemId,
  ws_id: wsId,
  owner_user_id: actorId,
  version: 1,
  created_at: '2026-11-18T04:10:12.123456+07:00',
  updated_at: '2026-11-18T04:10:12.123456+07:00',
};
const scopeArgs = { p_ws_id: wsId, p_actor_id: actorId };

function fixture(result: unknown, status = 200) {
  const calls: { path: string; profile: string | null; args: unknown }[] = [];
  const client = createClient<CitationLibraryDatabase>(
    'https://example.test',
    'test-key',
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: async (input, init) => {
          const request = new Request(input, init);
          calls.push({
            path: new URL(request.url).pathname,
            profile: request.headers.get('content-profile'),
            args: await request.json(),
          });
          return Response.json(result, { status });
        },
      },
    }
  );
  return { store: getCitationLibraryStore(client, scope), calls };
}

describe('citation library store', () => {
  it('lists mapped rows through the private RPC with literal search and pagination arguments', async () => {
    const { store, calls } = fixture([row]);
    await expect(
      store.list(wsId, { offset: 10, limit: 25, search: 'River_%' })
    ).resolves.toEqual([
      {
        ...write,
        id: itemId,
        wsId,
        ownerUserId: actorId,
        version: 1,
        createdAt: '2026-11-17T21:10:12.123Z',
        updatedAt: '2026-11-17T21:10:12.123Z',
      },
    ]);
    expect(calls).toEqual([
      {
        path: '/rest/v1/rpc/list_citation_library_items',
        profile: 'private',
        args: { ...scopeArgs, p_offset: 10, p_limit: 25, p_search: 'River_%' },
      },
    ]);
  });

  it('uses workspace-scoped lookup for item IDs and fingerprints', async () => {
    const { store, calls } = fixture([]);
    await expect(store.get(wsId, itemId)).resolves.toBeNull();
    await expect(store.getMany(wsId, [itemId, otherWs])).resolves.toEqual([]);
    await expect(store.findFingerprint(wsId, fingerprint)).resolves.toBeNull();
    expect(calls).toEqual(
      [
        { p_ids: [itemId] },
        { p_ids: [itemId, otherWs] },
        { p_fingerprint: fingerprint },
      ].map((filter) => ({
        path: '/rest/v1/rpc/lookup_citation_library_items',
        profile: 'private',
        args: { ...scopeArgs, ...filter },
      }))
    );
  });

  it('passes only the verified actor and explicitly selected work fields to insert', async () => {
    const { store, calls } = fixture([row]);
    const attempted = { ...write, id: itemId, ownerUserId: otherWs };
    await expect(store.insert(scope, attempted)).resolves.toMatchObject({
      ownerUserId: actorId,
      version: 1,
    });
    expect(calls).toEqual([
      {
        path: '/rest/v1/rpc/insert_citation_library_item',
        profile: 'private',
        args: {
          ...scopeArgs,
          p_id: itemId,
          p_work: work,
          p_fingerprint: fingerprint,
          p_tags: write.tags,
        },
      },
    ]);
  });

  it('uses a version condition in each mutation and returns an unmatched result', async () => {
    const update = fixture([]);
    const remove = fixture(false);
    await expect(
      update.store.update(wsId, itemId, { ...write, expectedVersion: 4 })
    ).resolves.toBeNull();
    await expect(remove.store.remove(wsId, itemId, 5)).resolves.toBe(false);
    expect(update.calls[0]).toMatchObject({
      path: '/rest/v1/rpc/update_citation_library_item',
      args: { ...scopeArgs, p_id: itemId, p_expected_version: 4 },
    });
    expect(remove.calls[0]).toMatchObject({
      path: '/rest/v1/rpc/delete_citation_library_item',
      args: { ...scopeArgs, p_id: itemId, p_expected_version: 5 },
    });
  });

  it('rejects a foreign workspace or actor before issuing a request', async () => {
    const { store, calls } = fixture([]);
    await expect(store.get(otherWs, itemId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      store.insert({ ...scope, actorId: otherWs }, { ...write, id: itemId })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(calls).toEqual([]);
  });

  it.each([
    [
      23505,
      'citation_library_items_workspace_fingerprint_key',
      'DUPLICATE_SOURCE',
      409,
    ],
    [23505, 'citation_library_items_pkey', 'VERSION_CONFLICT', 409],
    [23514, 'citation_library_items_work_size_check', 'INVALID_INPUT', 413],
    [42501, 'access denied', 'FORBIDDEN', 403],
    ['PGRST202', 'missing RPC', 'LIBRARY_UNAVAILABLE', 503],
  ])(
    'maps database error %s (%s)',
    async (code, message, expectedCode, status) => {
      const { store } = fixture(
        { code: String(code), message: `"${message}"` },
        400
      );
      await expect(
        store.insert(scope, { ...write, id: itemId })
      ).rejects.toMatchObject({ code: expectedCode, status });
    }
  );

  it.each([
    { name: 'foreign workspace', rows: [{ ...row, ws_id: otherWs }] },
    { name: 'invalid work', rows: [{ ...row, work: null }] },
    { name: 'multiple matches', rows: [row, row] },
  ])('rejects invalid single-item results ($name)', async ({ rows }) => {
    const { store } = fixture(rows);
    await expect(store.get(wsId, itemId)).rejects.toMatchObject({
      code: 'LIBRARY_UNAVAILABLE',
    });
  });
});
