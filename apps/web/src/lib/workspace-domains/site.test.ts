import type { ExternalProjectDeliveryPayload } from '@tuturuuu/types';
import { describe, expect, it, vi } from 'vitest';
import { buildWorkspaceDomainSite, toPublicSitePayload } from './site';

const workspace = {
  wsId: 'ws-1',
  name: 'Phuc',
  avatarUrl: null,
  siteAvailable: true,
};

const payload = {
  workspaceId: 'ws-1',
  canonicalProjectId: 'p1',
  revision: 'r1',
  generatedAt: '2026-11-11T00:00:00.000Z',
  profileData: { secretNote: 'private' },
  loadingData: null,
  collections: [
    {
      id: 'c1',
      slug: 'pages',
      title: 'Pages',
      collection_type: 'pages',
      description: null,
      config: { internal: true },
      entries: [
        {
          id: 'e1',
          slug: 'home',
          title: 'Home',
          subtitle: null,
          summary: null,
          status: 'published',
          published_at: '2026-11-01T00:00:00.000Z',
          profile_data: { owner: 'private' },
          metadata: { reviewer: 'private' },
          relations: [{ id: 'r' }],
          blocks: [
            {
              id: 'b1',
              block_type: 'markdown',
              title: null,
              sort_order: 0,
              content: { markdown: 'Hello' },
              created_by: 'user-1',
              entry_id: 'e1',
              ws_id: 'ws-1',
            },
          ],
          assets: [
            {
              id: 'a1',
              asset_type: 'image',
              assetUrl:
                '/api/v1/workspaces/ws-1/external-projects/assets/a1?v=1',
              alt_text: 'Logo',
              sort_order: 0,
              storage_path: 'ws-1/private/path.png',
              source_url: null,
            },
          ],
        },
        {
          id: 'e2',
          slug: 'draft',
          title: 'Draft',
          status: 'draft',
          blocks: [],
          assets: [],
        },
      ],
    },
  ],
} as unknown as ExternalProjectDeliveryPayload;

describe('toPublicSitePayload', () => {
  it('keeps only published entries and allowlisted fields', () => {
    const site = toPublicSitePayload(
      workspace,
      payload,
      'https://tuturuuu.com'
    );
    const serialized = JSON.stringify(site);
    for (const leaked of [
      'private',
      'storage_path',
      'profile_data',
      'metadata',
      'relations',
      'created_by',
      'config',
      'draft',
    ]) {
      expect(serialized).not.toContain(leaked);
    }
    expect(site.collections[0]?.entries).toHaveLength(1);
    expect(site.collections[0]?.entries[0]?.assets[0]?.assetUrl).toBe(
      'https://tuturuuu.com/api/v1/workspaces/ws-1/external-projects/assets/a1?v=1'
    );
    expect(site.workspace).toEqual({
      wsId: 'ws-1',
      name: 'Phuc',
      avatarUrl: null,
    });
  });
});

describe('buildWorkspaceDomainSite', () => {
  it('returns null for unknown hosts or workspaces without a site', async () => {
    const publishedPayload = vi.fn(async () => payload);
    const assetOrigin = 'https://tuturuuu.com';
    expect(
      await buildWorkspaceDomainSite(
        { resolve: async () => null, publishedPayload, assetOrigin },
        'unknown.example'
      )
    ).toBeNull();
    expect(
      await buildWorkspaceDomainSite(
        {
          resolve: async () => ({ ...workspace, siteAvailable: false }),
          publishedPayload,
          assetOrigin,
        },
        'example.com'
      )
    ).toBeNull();
    expect(publishedPayload).not.toHaveBeenCalled();
    expect(
      await buildWorkspaceDomainSite(
        { resolve: async () => workspace, publishedPayload, assetOrigin },
        'example.com'
      )
    ).toMatchObject({ revision: 'r1' });
  });
});
