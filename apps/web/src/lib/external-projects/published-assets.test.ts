import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import {
  canReadPublishedAsset,
  isPublishedAsset,
  loadPublishedAssetManifests,
  publishedAssetManifest,
} from './published-assets';

const updated_at = '2026-11-20T09:00:00Z';
const published_at = '2026-11-20T10:00:00Z';
const entry = { id: 'entry', published_at, profile_data: { schema: 'fysh/1', media: { portrait: 'used' } } };
const used = { id: 'used', entry_id: entry.id, updated_at };
const staged = { id: 'staged', entry_id: entry.id, updated_at: '2026-11-20T10:00:01Z' };

function fixture(payload: unknown) {
  const result = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [{ entry_id: entry.id, payload }] }),
  };
  return { from: () => result } as unknown as TypedSupabaseClient;
}

describe('workspace asset publication', () => {
  it('admits referenced assets only at the revision captured by publish', async () => {
    const manifest = publishedAssetManifest(entry, [
      used,
      { ...used, id: 'unreferenced' },
      { ...staged, id: 'late', block_id: 'block' },
    ], [{ id: 'block', entry_id: entry.id, updated_at }]);
    expect(manifest).toEqual({ used: updated_at });
    const fake = fixture({ assetPublicationAt: published_at, publishedAssetManifest: manifest });
    const records = await loadPublishedAssetManifests(fake, 'workspace', 'project', [entry]);
    expect(isPublishedAsset(records, used)).toBe(true);
    expect(isPublishedAsset(records, { ...used, updated_at: staged.updated_at })).toBe(false);
    expect(isPublishedAsset(records, staged)).toBe(false);
  });

  it('keeps a new upload private on the direct asset path for a published parent', async () => {
    const fake = fixture({ assetPublicationAt: published_at, publishedAssetManifest: { used: updated_at } });
    const parent = {
      published_at,
      status: 'published',
      metadata: {},
      workspace_external_project_collections: { slug: 'characters', config: {} },
    };
    expect(await canReadPublishedAsset(fake, 'workspace', 'project', used, parent)).toBe(true);
    expect(await canReadPublishedAsset(fake, 'workspace', 'project', staged, parent)).toBe(false);
    expect(await canReadPublishedAsset(fake, 'workspace', 'project', used, { ...parent, status: 'draft' })).toBe(false);
  });
});
