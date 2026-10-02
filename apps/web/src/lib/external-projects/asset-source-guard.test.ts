// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { readStorageDownloadTicket } from '@tuturuuu/storage-core/storage-download-token';
import {
  guardExternalProjectAssetSourceUrl,
  safeExternalProjectDeliverySourceUrl,
} from './asset-source-guard';

beforeEach(() => {
  vi.stubEnv('SECURITY_EGRESS_ENFORCEMENT_ENABLED', 'true');
  vi.stubEnv('SUPABASE_SERVER_URL', 'https://storage.example.test');
  vi.stubEnv('WEB_APP_URL', 'https://web.example.test');
  vi.stubEnv('STORAGE_DOWNLOAD_SIGNING_SECRET', 'test-only-secret');
});
afterEach(() => vi.unstubAllEnvs());
it('wraps existing signed CMS sources without exposing the CDN bearer URL', () => {
  const source =
    'https://storage.example.test/storage/v1/object/sign/workspaces/ws-1/external-projects/file.png?token=private';
  const guarded = guardExternalProjectAssetSourceUrl(source, 'ws-1');
  expect(guarded).not.toContain('token=private');
  expect(
    readStorageDownloadTicket(new URL(guarded).pathname.split('/').at(-1)!).url
  ).toBe(source);
});
it('preserves public sources and refuses cross-workspace signed sources', () => {
  const publicUrl =
    'https://storage.example.test/storage/v1/object/public/avatars/a.png';
  expect(guardExternalProjectAssetSourceUrl(publicUrl, 'ws-1')).toBe(publicUrl);
  expect(safeExternalProjectDeliverySourceUrl(publicUrl, '/api/asset')).toBe(
    publicUrl
  );
  expect(() =>
    guardExternalProjectAssetSourceUrl(
      'https://storage.example.test/storage/v1/object/sign/workspaces/ws-2/a.png?token=private',
      'ws-1'
    )
  ).toThrow();
});
it('preserves external sources', () => {
  expect(
    guardExternalProjectAssetSourceUrl('https://cdn.example.test/a.png', 'ws-1')
  ).toBe('https://cdn.example.test/a.png');
});

it('removes direct Supabase source links from public delivery JSON', () => {
  expect(
    safeExternalProjectDeliverySourceUrl(
      'https://storage.example.test/storage/v1/object/sign/workspaces/ws-1/a?token=private',
      '/api/asset'
    )
  ).toBe('/api/asset');
  expect(
    safeExternalProjectDeliverySourceUrl(
      'https://cdn.example.test/a',
      '/api/asset'
    )
  ).toBe('https://cdn.example.test/a');
});

it('removes nested Supabase provenance links from public asset metadata', async () => {
  const { safeExternalProjectDeliveryMetadata } = await import(
    './asset-delivery-url'
  );
  const source =
    'https://storage.example.test/storage/v1/object/sign/workspaces/ws-1/a?token=private';
  expect(
    safeExternalProjectDeliveryMetadata(
      {
        import: {
          sourceUrl: source,
          finalSourceUrl: source,
          checksumSha256: 'checksum',
        },
        caption: 'a caption',
        external: 'https://cdn.example.test/a',
      },
      '/api/asset'
    )
  ).toEqual({
    import: {
      sourceUrl: '/api/asset',
      finalSourceUrl: '/api/asset',
      checksumSha256: 'checksum',
    },
    caption: 'a caption',
    external: 'https://cdn.example.test/a',
  });
});
