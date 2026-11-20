import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import {
  canReadPublishedAsset,
  isPublishedAsset,
  loadPublishedAssetManifests,
  publicationEventId,
  publishedAssetManifest,
} from './published-assets';

vi.mock('server-only', () => ({}));

const updated_at = '2026-11-20T09:00:00Z';
const published_at = '2026-11-20T10:00:00Z';
const entry = {
  id: 'entry',
  published_at,
  profile_data: { schema: 'fysh/1', media: { portrait: 'used' } },
};
const used = { id: 'used', entry_id: entry.id, updated_at };
const staged = {
  id: 'staged',
  entry_id: entry.id,
  updated_at: '2026-11-20T10:00:01Z',
};

type Event = { id?: string; entry_id: string; payload: unknown };

function database(events: Event[]) {
  const from = vi.fn(() => {
    let entryId: string | undefined;
    return {
      select() {
        return this;
      },
      eq(key: string, value: string) {
        if (key === 'entry_id') entryId = value;
        return this;
      },
      async in(_key: string, ids: string[]) {
        return {
          data: events.filter((event) => event.id && ids.includes(event.id)),
        };
      },
      order() {
        return this;
      },
      async limit(size: number) {
        return {
          data: events
            .filter((event) => event.entry_id === entryId)
            .slice(0, size),
        };
      },
    };
  });
  return { from } as unknown as TypedSupabaseClient;
}

const fixture = (payload: unknown) =>
  database([{ entry_id: entry.id, payload }]);

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
    const fake = fixture({
      assetPublicationAt: published_at,
      publishedAssetManifest: manifest,
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

  it('finds the exact current proof without a shared event-history budget', async () => {
    const quiet = { ...entry, id: 'quiet' };
    const noisy = { ...entry, id: 'noisy' };
    const revision = {
      assetPublicationAt: published_at,
      publishedAssetManifest: { used: updated_at },
    };
    const fake = database([
      ...Array.from({ length: 110 }, () => ({
        entry_id: noisy.id,
        payload: {},
      })),
      { entry_id: quiet.id, payload: revision },
      {
        id: publicationEventId(
          'workspace',
          'project',
          noisy.id,
          'publish',
          published_at
        ),
        entry_id: noisy.id,
        payload: revision,
      },
    ]);
    const records = await loadPublishedAssetManifests(
      fake,
      'workspace',
      'project',
      [noisy, quiet]
    );
    expect(records.get(noisy.id)).toEqual({ used: updated_at });
    expect(records.get(quiet.id)).toEqual({ used: updated_at });
  });

  it('keeps a new upload private on the direct asset path for a published parent', async () => {
    const fake = fixture({
      assetPublicationAt: published_at,
      publishedAssetManifest: { used: updated_at },
    });
    const parent = {
      published_at,
      status: 'published',
      metadata: {},
      workspace_external_project_collections: {
        slug: 'characters',
        config: {},
      },
    };
    expect(
      await canReadPublishedAsset(fake, 'workspace', 'project', used, parent)
    ).toBe(true);
    expect(
      await canReadPublishedAsset(fake, 'workspace', 'project', staged, parent)
    ).toBe(false);
    expect(
      await canReadPublishedAsset(fake, 'workspace', 'project', used, {
        ...parent,
        status: 'draft',
      })
    ).toBe(false);
  });
});
