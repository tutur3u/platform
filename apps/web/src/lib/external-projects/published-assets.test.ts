import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import {
  readPublishedAssetDigest,
  isPublishedAsset,
  loadPublishedAssetManifests,
  assetPublicationProofId,
  publishedAssetManifest,
} from './published-assets';

vi.mock('server-only', () => ({}));

const updated_at = '2026-11-20T09:00:00Z';
const published_at = '2026-11-20T10:00:00Z';
const entry = {
  id: 'entry',
  published_at,
  updated_at: published_at,
  profile_data: { schema: 'fysh/1', media: { portrait: 'used' } },
};
const used = { id: 'used', entry_id: entry.id, updated_at };
const staged = {
  id: 'staged',
  entry_id: entry.id,
  updated_at: '2026-11-20T10:00:01Z',
};

function database(
  assetRevisions?: Record<string, { revision: string; sha256: string }>
) {
  const proof = {
    id: assetPublicationProofId('workspace', 'project', entry),
    entry_id: entry.id,
    published_at,
    entry_updated_at: entry.updated_at,
    asset_revisions: assetRevisions,
  };
  const query = {
    select: () => query,
    eq: () => query,
    in: async (_column: string, ids: string[]) => ({
      data: assetRevisions && ids.includes(proof.id) ? [proof] : [],
    }),
  };
  const auditTable = vi.fn();
  const from = vi.fn(() => query);
  const schema = vi.fn(() => ({ from }));
  return {
    admin: { schema, from: auditTable } as unknown as TypedSupabaseClient,
    schema,
    from,
    auditTable,
  };
}

describe('workspace asset publication', () => {
  it('admits referenced assets only at the revision captured by publish', async () => {
    const manifest = publishedAssetManifest(
      entry,
      [
        used,
        { ...used, id: 'unreferenced' },
        { ...staged, id: 'late', block_id: 'block' },
      ],
      [{ id: 'block', entry_id: entry.id, updated_at }]
    );
    expect(manifest).toEqual({ used: updated_at });
    const { admin: fake } = database({
      used: { revision: manifest.used!, sha256: 'a'.repeat(64) },
    });
    const records = await loadPublishedAssetManifests(
      fake,
      'workspace',
      'project',
      [entry]
    );
    expect(isPublishedAsset(records, used)).toBe(true);
    expect(
      isPublishedAsset(records, { ...used, updated_at: staged.updated_at })
    ).toBe(false);
    expect(isPublishedAsset(records, staged)).toBe(false);
  });

  it('requires service-owned proof even when an entry has legacy attachment references', async () => {
    const { admin, schema, from, auditTable } = database();
    const records = await loadPublishedAssetManifests(
      admin,
      'workspace',
      'project',
      [entry]
    );
    expect(isPublishedAsset(records, used)).toBe(false);
    expect(schema).toHaveBeenCalledWith('private');
    expect(from).toHaveBeenCalledWith(
      'external_project_asset_publication_proofs'
    );
    expect(auditTable).not.toHaveBeenCalled();
  });

  it('keeps a new upload private on the direct asset path for a published parent', async () => {
    const { admin: fake } = database({
      used: { revision: updated_at, sha256: 'a'.repeat(64) },
    });
    const parent = {
      published_at,
      status: 'published',
      updated_at: published_at,
      metadata: {},
      workspace_external_project_collections: {
        slug: 'characters',
        config: {},
      },
    };
    expect(
      await readPublishedAssetDigest(fake, 'workspace', 'project', used, parent)
    ).toBe('a'.repeat(64));
    expect(
      await readPublishedAssetDigest(fake, 'workspace', 'project', used, {
        ...parent,
        updated_at: '2026-11-20T10:30:00Z',
      })
    ).toBeNull();
    expect(
      await readPublishedAssetDigest(
        fake,
        'workspace',
        'project',
        staged,
        parent
      )
    ).toBeNull();
    expect(
      await readPublishedAssetDigest(fake, 'workspace', 'project', used, {
        ...parent,
        status: 'draft',
      })
    ).toBeNull();
  });
});
