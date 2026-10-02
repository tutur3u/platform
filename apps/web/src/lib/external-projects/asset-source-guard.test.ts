import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { readStorageDownloadTicket } from '@tuturuuu/storage-core/storage-download-token';
import {
  guardExternalProjectAssetSourceUrl,
  safeExternalProjectDeliverySourceUrl,
} from './asset-source-guard';

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVER_URL', 'https://storage.example.test');
  vi.stubEnv('WEB_APP_URL', 'https://web.example.test');
  vi.stubEnv('STORAGE_DOWNLOAD_SIGNING_SECRET', 'test-only-secret');
});
it('wraps existing signed CMS sources without exposing the CDN bearer URL', () => {
  const source =
    'https://storage.example.test/storage/v1/object/sign/workspaces/ws-1/external-projects/file.png?token=private';
  const guarded = guardExternalProjectAssetSourceUrl(source, 'ws-1');
  expect(guarded).not.toContain('token=private');
  expect(
    readStorageDownloadTicket(new URL(guarded).pathname.split('/').at(-1)!).url
  ).toBe(source);
});
it('refuses public Supabase sources and cross-workspace signed sources', () => {
  expect(() =>
    guardExternalProjectAssetSourceUrl(
      'https://storage.example.test/storage/v1/object/public/avatars/a.png',
      'ws-1'
    )
  ).toThrow();
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
