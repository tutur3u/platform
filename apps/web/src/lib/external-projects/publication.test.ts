// @vitest-environment node
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { WorkspaceExternalProjectBinding } from '@tuturuuu/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assetPublicationProofId,
  isPublishedAsset,
  loadPublishedAssetManifests,
  publicationEventId,
} from './published-assets';
import { PublicationDatabaseError } from './publication';
import {
  bulkUpdateWorkspaceExternalProjectEntries,
  publishWorkspaceExternalProjectEntry,
} from './store';
import {
  buildWebglPackageArtifact,
  WEBGL_PACKAGE_ASSET_TYPE,
} from './webgl-packages';

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  deleteWorkspaceStorageObjectByPath: vi.fn(),
}));

const invalidate = vi.hoisted(() => vi.fn());
vi.mock('./cache', () => ({
  invalidateWorkspaceExternalProjectCache: invalidate,
}));

const older = '2026-11-18T09:00:00.000Z';
const beforePublication = '2026-11-18T10:00:00.000Z';
const workspaceId = 'test-workspace';
const entryId = 'game-entry';
const canonicalProjectId = 'test-project';
const binding = {
  adapter: 'custom',
  canonical_id: canonicalProjectId,
} as WorkspaceExternalProjectBinding;

type Row = Record<string, unknown>;

function database() {
  const entry = {
    id: entryId,
    ws_id: workspaceId,
    collection_id: 'games',
    created_at: older,
    profile_data: {},
    sort_order: 0,
    status: 'draft',
    updated_at: older,
    published_at: null as string | null,
  };
  const prefix = 'external-projects/custom/games/game/webgl-packages';
  const revision = '11111111-1111-4111-8111-111111111111';
  const metadata = buildWebglPackageArtifact({
    archivePath: `${prefix}/test.zip`,
    revision,
    assetId: 'webgl',
    files: [
      {
        path: `${prefix}/_revisions/${revision}/index.html`,
        size: 100,
        sha256: 'a'.repeat(64),
      },
    ],
    provider: 'supabase',
    wsId: workspaceId,
  });
  const webgl = {
    id: 'webgl',
    entry_id: entryId,
    ws_id: workspaceId,
    block_id: null,
    asset_type: WEBGL_PACKAGE_ASSET_TYPE,
    metadata,
    storage_path: metadata.rootPath,
    updated_at: beforePublication,
  };
  const staged = { ...webgl, id: 'staged', metadata: {}, asset_type: 'image' };
  const tableRows = new Map<string, Row[]>([
    [
      'workspace_external_project_entries',
      [entry, { ...entry, id: 'unrelated-draft' }],
    ],
    [
      'workspace_external_project_collections',
      [{ id: 'games', ws_id: workspaceId, slug: 'games', config: {} }],
    ],
    ['workspace_external_project_assets', [webgl, staged]],
  ]);
  const events: Row[] = [];
  const proofs: Row[] = [];
  const proofTable = 'external_project_asset_publication_proofs';
  tableRows.set(proofTable, proofs);
  tableRows.set('workspace_external_project_publish_events', events);
  const writeEvent = vi.fn(async (event: Row) => {
    if (!events.some(({ id }) => id === event.id)) events.push(event);
    return { error: null };
  });
  const updateEntry = vi.fn((values: Row) => values);
  const rpc = vi.fn((_name: string, args: Row) => ({
    async single(): Promise<{
      data: Row | null;
      error: { message: string; code: string } | null;
    }> {
      Object.assign(entry, {
        status: 'published',
        published_at: args.p_published_at,
        updated_at: '2026-11-21T20:00:01.123456+00:00',
      });
      events.push({
        id: args.p_event_id,
        ws_id: workspaceId,
        entry_id: entry.id,
        canonical_external_project_id: canonicalProjectId,
        event_kind: 'publish',
        visibility_scope: 'public',
        payload: args.p_payload,
      });
      proofs.push({
        id: assetPublicationProofId(workspaceId, canonicalProjectId, entry),
        ws_id: workspaceId,
        canonical_external_project_id: canonicalProjectId,
        entry_id: entry.id,
        published_at: entry.published_at,
        entry_updated_at: entry.updated_at,
        asset_revisions: args.p_asset_revisions,
      });
      return { data: { ...entry }, error: null };
    },
  }));
  const from = vi.fn((table: string) => {
    const rows = tableRows.get(table) ?? [];
    const conditions: ((row: Row) => boolean)[] = [];
    let patch: Row | undefined;
    const matches = () =>
      rows.filter((row) => conditions.every((test) => test(row)));
    return {
      select() {
        return this;
      },
      order() {
        return this;
      },
      eq(key: string, value: unknown) {
        conditions.push((row) => row[key] === value);
        return this;
      },
      in(key: string, values: unknown[]) {
        conditions.push((row) => values.includes(row[key]));
        return this;
      },
      update(values: Row) {
        patch = updateEntry(values);
        return this;
      },
      async single() {
        const [row] = matches();
        if (!row) return { data: null, error: { message: 'missing row' } };
        if (patch)
          Object.assign(row, patch, { updated_at: new Date().toISOString() });
        return { data: { ...row }, error: null };
      },
      async maybeSingle() {
        return { data: matches()[0] ?? null, error: null };
      },
      async range() {
        return { data: matches(), error: null };
      },
      async limit(size: number) {
        return { data: matches().slice(0, size), error: null };
      },
      then(resolve: (result: { data: Row[]; error: null }) => void) {
        resolve({ data: matches(), error: null });
      },
      upsert:
        table === proofTable
          ? async (proof: Row) => {
              proofs.push(proof);
              return { error: null };
            }
          : writeEvent,
    };
  });
  return {
    admin: {
      from,
      rpc,
      schema: () => ({ from }),
    } as unknown as TypedSupabaseClient,
    proofs,
    entry,
    events,
    writeEvent,
    webgl,
    staged,
    rpc,
    updateEntry,
  };
}

const input = {
  actorId: 'editor',
  binding,
  entryId,
  workspaceId,
  visibilityScope: 'public',
};

describe('CMS publication settlement', () => {
  beforeEach(() => invalidate.mockReset().mockResolvedValue(undefined));

  it('publishes an entry-level finalized WebGL package through bulk set-status', async () => {
    const { admin, events, proofs, webgl, staged, rpc, updateEntry } =
      database();
    const [entry] = await bulkUpdateWorkspaceExternalProjectEntries(
      {
        actorId: 'editor',
        binding,
        workspaceId,
        payload: {
          action: 'set-status',
          status: 'published',
          entryIds: [entryId, entryId],
        },
      },
      admin
    );

    expect(entry?.status).toBe('published');
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      'publish_external_project_entry',
      expect.objectContaining({
        p_actor_id: 'editor',
        p_entry_id: entryId,
        p_expected_updated_at: older,
      })
    );
    expect(updateEntry).not.toHaveBeenCalled();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event_kind: 'publish',
      visibility_scope: 'public',
    });
    expect(proofs).toMatchObject([
      {
        published_at: entry?.published_at,
        asset_revisions: {
          [webgl.id]: {
            revision: webgl.updated_at,
            sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          },
        },
      },
    ]);
    expect(events[0]?.payload).not.toHaveProperty('publishedAssetManifest');
    expect(events[0]?.payload).toMatchObject({
      collections: [
        {
          entries: [
            { id: entryId, status: 'published', assets: [{ id: webgl.id }] },
          ],
        },
      ],
    });
    const manifests = await loadPublishedAssetManifests(
      admin,
      workspaceId,
      canonicalProjectId,
      [entry!]
    );
    expect(isPublishedAsset(manifests, webgl)).toBe(true);
    expect(isPublishedAsset(manifests, staged)).toBe(false);
    expect(
      isPublishedAsset(manifests, {
        ...webgl,
        updated_at: new Date().toISOString(),
      })
    ).toBe(false);
  });

  it.each(['event', 'proof', 'both'] as const)(
    'repairs an already-published entry missing %s once',
    async (missing) => {
      const { admin, entry, events, proofs, rpc, updateEntry } = database();
      const publish = () =>
        publishWorkspaceExternalProjectEntry(
          { ...input, eventKind: 'publish' },
          admin
        );
      await publish();
      const staleDate = entry.published_at!;
      const staleRevision = entry.updated_at;
      if (missing !== 'proof') events.splice(0);
      if (missing !== 'event') proofs.splice(0);
      rpc.mockClear();

      const repaired = await publish();
      expect(repaired.id).toBe(entryId);
      expect(Date.parse(repaired.published_at!)).toBeGreaterThan(
        Date.parse(staleDate)
      );
      expect(rpc).toHaveBeenCalledExactlyOnceWith(
        'publish_external_project_entry',
        expect.objectContaining({
          p_entry_id: entryId,
          p_expected_updated_at: staleRevision,
        })
      );
      expect(
        events.filter(
          ({ id }) =>
            id ===
            publicationEventId(
              workspaceId,
              canonicalProjectId,
              entryId,
              'publish',
              repaired.published_at!
            )
        )
      ).toHaveLength(1);
      expect(
        proofs.filter(
          ({ id }) =>
            id ===
            assetPublicationProofId(workspaceId, canonicalProjectId, repaired)
        )
      ).toHaveLength(1);
      expect(await publish()).toEqual(repaired);
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(updateEntry).not.toHaveBeenCalled();
    }
  );

  it('preserves the draft when the atomic RPC refuses and retains safe diagnostics', async () => {
    const { admin, entry, events, proofs, rpc, updateEntry } = database();
    rpc.mockReturnValueOnce({
      single: async () => ({
        data: null,
        error: {
          code: 'PT409',
          message: 'Entry changed before publication for "private-value"',
        },
      }),
    });
    const failure = publishWorkspaceExternalProjectEntry(
      { ...input, eventKind: 'publish' },
      admin
    );
    await expect(failure).rejects.toBeInstanceOf(PublicationDatabaseError);
    await expect(failure).rejects.toMatchObject({
      operation: 'atomic publish',
      code: 'PT409',
      message: 'Entry changed before publication for [redacted]',
    });
    expect(entry.status).toBe('draft');
    expect(events).toEqual([]);
    expect(proofs).toEqual([]);
    expect(updateEntry).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('settles the same withdrawal after event and invalidation failures', async () => {
    const { admin, entry, events, writeEvent } = database();
    await publishWorkspaceExternalProjectEntry(
      { ...input, eventKind: 'publish' },
      admin
    );
    const withdraw = () =>
      publishWorkspaceExternalProjectEntry(
        { ...input, eventKind: 'unpublish' },
        admin
      );

    writeEvent.mockRejectedValueOnce(new Error('event write failed'));
    await expect(withdraw()).rejects.toMatchObject({
      message: 'event write failed',
    });
    expect(entry.status).toBe('draft');
    expect(invalidate).toHaveBeenCalledTimes(2);
    const draftRevision = entry.updated_at;
    const withdrawalId = publicationEventId(
      workspaceId,
      canonicalProjectId,
      entry.id,
      'unpublish',
      draftRevision
    );

    invalidate.mockRejectedValueOnce(new Error('purge failed'));
    await expect(withdraw()).rejects.toMatchObject({ message: 'purge failed' });
    expect(events.filter(({ id }) => id === withdrawalId)).toHaveLength(1);
    expect((await withdraw()).updated_at).toBe(draftRevision);
    expect(writeEvent).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledTimes(4);
  });
});
