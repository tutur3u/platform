// @vitest-environment node
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { WorkspaceExternalProjectBinding } from '@tuturuuu/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isPublishedAsset,
  loadPublishedAssetManifests,
  publicationEventId,
} from './published-assets';
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
    profile_data: {},
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
    ['workspace_external_project_entries', [entry]],
    [
      'workspace_external_project_collections',
      [{ id: 'games', ws_id: workspaceId, slug: 'games', config: {} }],
    ],
    ['workspace_external_project_assets', [webgl, staged]],
  ]);
  const events: Row[] = [];
  tableRows.set('workspace_external_project_publish_events', events);
  const writeEvent = vi.fn(async (event: Row) => {
    if (!events.some(({ id }) => id === event.id)) events.push(event);
    return { error: null };
  });
  const from = vi.fn((table: string) => {
    const rows = tableRows.get(table) ?? [];
    const conditions: ((row: Row) => boolean)[] = [];
    let projection: string | undefined;
    let patch: Row | undefined;
    const matches = () =>
      rows.filter((row) => conditions.every((test) => test(row)));
    return {
      select(columns: string) {
        projection = columns;
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
        patch = values;
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
        const data = projection?.includes(':payload->')
          ? matches().map(({ id, entry_id, payload }) => ({
              id,
              entry_id,
              ...(payload as Row),
            }))
          : matches();
        resolve({ data, error: null });
      },
      upsert: writeEvent,
    };
  });
  return {
    admin: { from } as unknown as TypedSupabaseClient,
    entry,
    events,
    writeEvent,
    webgl,
    staged,
  };
}

describe('CMS publication settlement', () => {
  beforeEach(() => invalidate.mockReset().mockResolvedValue(undefined));

  it('publishes an entry-level finalized WebGL package through bulk set-status', async () => {
    const { admin, events, webgl, staged } = database();
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
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event_kind: 'publish',
      visibility_scope: 'public',
      payload: {
        assetPublicationAt: entry?.published_at,
        publishedAssetManifest: { [webgl.id]: webgl.updated_at },
      },
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

  it('settles the same withdrawal after event and invalidation failures', async () => {
    const { admin, entry, events, writeEvent } = database();
    const input = {
      actorId: 'editor',
      binding,
      entryId,
      workspaceId,
      visibilityScope: 'public',
    };
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
    await expect(withdraw()).rejects.toThrow('event write failed');
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
    await expect(withdraw()).rejects.toThrow('purge failed');
    expect(events.filter(({ id }) => id === withdrawalId)).toHaveLength(1);
    expect((await withdraw()).updated_at).toBe(draftRevision);
    expect(writeEvent).toHaveBeenCalledTimes(3);
    expect(invalidate).toHaveBeenCalledTimes(4);
  });
});
