import { describe, expect, it } from 'vitest';
import { buildCmsSiteManifest, normalizeCmsSiteDelivery } from './cms-site';

describe('CMS site v1 helpers', () => {
  it('builds the standard global CMS contract', () => {
    const manifest = buildCmsSiteManifest();

    expect(manifest).toMatchObject({
      adapter: 'cms_site',
      canonicalProjectId: 'cms_site-main',
      template: { kind: 'standard-site', version: 1 },
      version: 1,
    });
    expect(manifest.schema.collections.map((item) => item.slug)).toEqual([
      'site-settings',
      'navigation',
      'pages',
      'posts',
      'taxonomies',
      'landing-sections',
      'redirects',
      'media-assets',
    ]);
  });

  it('indexes delivery by collection and resolves relative asset URLs', () => {
    const result = normalizeCmsSiteDelivery(
      {
        adapter: 'cms_site',
        canonicalProjectId: 'cms_site-main',
        collections: [
          {
            collection_type: 'page',
            config: {},
            description: null,
            entries: [
              {
                assets: [
                  {
                    alt_text: null,
                    asset_type: 'image',
                    assetUrl: '/media/hero.jpg',
                    assetRevision: 'asset-r1',
                    block_id: null,
                    entry_id: 'entry-1',
                    id: 'asset-1',
                    metadata: {},
                    sort_order: 0,
                    source_url: null,
                    storage_path: null,
                    updated_at: '2026-08-01T00:00:00.000Z',
                  },
                ],
                blocks: [],
                id: 'entry-1',
                metadata: {},
                profile_data: {},
                published_at: null,
                relations: [],
                slug: 'home',
                status: 'published',
                subtitle: null,
                summary: null,
                title: 'Home',
              },
            ],
            id: 'collection-1',
            slug: 'pages',
            title: 'Pages',
          },
        ],
        generatedAt: '2026-08-01T00:00:00.000Z',
        loadingData: null,
        profileData: {},
        revision: 'r1',
        workspaceId: 'workspace-1',
      },
      'https://site.example'
    );

    expect(result.collections.pages?.entries[0]?.assets[0]?.assetUrl).toBe(
      'https://site.example/media/hero.jpg'
    );
  });
});
