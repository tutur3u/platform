import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The URL helper needs the genuine error class, not server-only budget services.
vi.mock(
  '@tuturuuu/storage-core/profile-upload-budget',
  async () => import('@tuturuuu/storage-core/profile-upload-error')
);

import {
  type BannerLifecycleAdmin,
  bannerStorageOrigin,
  canonicalManagedBanner,
  cleanRetiredBanners,
  ownedBannerPath,
} from './profile-banner-lifecycle';

const actor = '00000000-0000-4000-8000-000000000001';
const origin = 'https://storage.example.test';
const path = `${actor}/1234567890123.png`;
const url = `${origin}/storage/v1/object/public/banners/${path}`;
beforeEach(() => vi.stubEnv('SUPABASE_PUBLIC_STORAGE_ORIGIN', ''));
afterEach(() => vi.unstubAllEnvs());
function fixture(rows: unknown[]) {
  const remove = vi.fn().mockResolvedValue({ error: null });
  const upload = vi.fn().mockResolvedValue({ error: null });
  const rpc = vi.fn().mockImplementation(async (name: string) => ({
    data: name === 'pending_profile_banner_retirements' ? rows : null,
    error: null,
  }));
  const admin = {
    rpc,
    storage: { from: vi.fn().mockReturnValue({ remove, upload }) },
  } satisfies BannerLifecycleAdmin;
  return { admin, remove, upload, rpc };
}
describe('authenticated immutable banner retirement', () => {
  it('uses the secure public origin for ownership and retirement with HTTP internal connectivity', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:8001');
    vi.stubEnv('SUPABASE_PUBLIC_STORAGE_ORIGIN', origin);
    expect(bannerStorageOrigin()).toBe(origin);
    expect(canonicalManagedBanner(url, actor)).toBe(true);
    expect(canonicalManagedBanner(`${url}?alias=1`, actor)).toBe(false);
    const f = fixture([
      { public_url: url, file_path: path, delete_ready: true },
    ]);
    expect(await cleanRetiredBanners(f.admin, actor)).toBe(true);
    expect(f.remove).toHaveBeenCalledWith([path]);
    expect(f.rpc).toHaveBeenCalledWith('expire_profile_banner_operations', {
      p_user_id: actor,
      p_storage_origin: origin,
    });
    expect(
      ownedBannerPath(
        url.replace(actor, 'foreign'),
        actor,
        bannerStorageOrigin()
      )
    ).toBeNull();
  });
  it('retains HTTPS Storage configuration when no public override is supplied', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', origin);
    expect(bannerStorageOrigin()).toBe(origin);
  });
  it('rejects insecure internal-only public storage', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:8001');
    expect(() => bannerStorageOrigin()).toThrow();
  });
  it('rejects missing Storage configuration', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(() => bannerStorageOrigin()).toThrow(
      'Storage configuration is unavailable'
    );
  });
  it('redacts malformed configuration from the thrown error', () => {
    const malformed = 'https://[synthetic-sensitive-origin';
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', malformed);
    try {
      bannerStorageOrigin();
      expect.fail('Malformed configuration was accepted');
    } catch (error) {
      expect(error).toMatchObject({
        message: 'Invalid Storage configuration',
        status: 503,
      });
      expect(error).not.toHaveProperty('input');
      expect(String(error)).not.toContain(malformed);
    }
  });
  it.each([
    'file:///',
    'https://user@storage.example.test',
    'https://storage.example.test/path',
    'https://storage.example.test?query=1',
    'https://storage.example.test#fragment',
  ])(
    'rejects malformed internal configuration even with public override %s',
    (value) => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', value);
      vi.stubEnv('SUPABASE_PUBLIC_STORAGE_ORIGIN', origin);
      expect(() => bannerStorageOrigin()).toThrow(
        'Invalid Storage configuration'
      );
    }
  );
  it.each([
    ' ',
    'http://untrusted.example.test',
    'https://user@storage.example.test',
    'https://storage.example.test/path',
    'https://storage.example.test?query=1',
    'https://storage.example.test#fragment',
  ])('rejects malformed or insecure public override %s', (value) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', origin);
    vi.stubEnv('SUPABASE_PUBLIC_STORAGE_ORIGIN', value);
    expect(() => bannerStorageOrigin()).toThrow();
  });
  it('managed aliases are rejected while external and foreign URLs are preserved', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', origin);
    for (const alias of [
      `${url}?x=1`,
      `${url}#fragment`,
      url.replace('1234567890123', '%31234567890123'),
      url.replace('/banners/', '/banners/fake/%2e%2e/'),
    ]) {
      expect(canonicalManagedBanner(alias, actor)).toBe(false);
    }
    expect(canonicalManagedBanner(url, actor)).toBe(true);
    expect(
      canonicalManagedBanner(
        'https://external.example.test/banner.png?size=large',
        actor
      )
    ).toBe(true);
    expect(
      canonicalManagedBanner(
        url.replace(actor, '00000000-0000-4000-8000-000000000002'),
        actor
      )
    ).toBe(true);
  });
  it.each([
    `${url}?token=synthetic`,
    `${url}/extra`,
    url.replace(actor, '00000000-0000-4000-8000-000000000002'),
    url.replace(origin, 'https://foreign.example.test'),
    url.replace('/123', '/%2e%2e/123'),
  ])('rejects foreign or noncanonical path %s', (value) =>
    expect(ownedBannerPath(value, actor, origin)).toBeNull()
  );
  it('scrubs the image before token expiry, retaining the immutable upload slot', async () => {
    const f = fixture([
      { public_url: url, file_path: path, delete_ready: false },
    ]);
    expect(await cleanRetiredBanners(f.admin, actor, origin)).toBe(true);
    expect(f.upload).toHaveBeenCalledWith(path, expect.any(Buffer), {
      upsert: true,
      contentType: 'image/webp',
      cacheControl: '0',
    });
    const metadata = await sharp(f.upload.mock.calls[0]![1]).metadata();
    expect(metadata).toMatchObject({ format: 'webp', width: 1, height: 1 });
    expect(f.remove).not.toHaveBeenCalled();
    expect(f.rpc).toHaveBeenCalledWith('complete_profile_banner_retirement', {
      p_user_id: actor,
      p_public_url: url,
      p_deleted: false,
    });
  });
  it('deletes only the matching actor-owned immutable path after expiry', async () => {
    const f = fixture([
      { public_url: url, file_path: path, delete_ready: true },
    ]);
    expect(await cleanRetiredBanners(f.admin, actor, origin)).toBe(true);
    expect(f.remove).toHaveBeenCalledWith([path]);
  });
  it('never acknowledges storage failure, allowing the durable retirement to retry', async () => {
    const f = fixture([
      { public_url: url, file_path: path, delete_ready: true },
    ]);
    f.remove.mockResolvedValue({ error: { message: 'Synthetic failure' } });
    expect(await cleanRetiredBanners(f.admin, actor, origin)).toBe(false);
    expect(f.rpc).not.toHaveBeenCalledWith(
      'complete_profile_banner_retirement',
      expect.anything()
    );
    f.remove.mockResolvedValue({ error: null });
    expect(await cleanRetiredBanners(f.admin, actor, origin)).toBe(true);
  });
  it.each([
    null,
    {},
    { public_url: url, file_path: path, delete_ready: 'true' },
  ])(
    'never performs Storage writes for malformed retirement row %j',
    async (row) => {
      const f = fixture([row]);
      expect(await cleanRetiredBanners(f.admin, actor, origin)).toBe(false);
      expect(f.remove).not.toHaveBeenCalled();
      expect(f.upload).not.toHaveBeenCalled();
    }
  );
  it('never deletes an inconsistent or foreign queue row', async () => {
    const f = fixture([
      { public_url: url, file_path: 'foreign/path.png', delete_ready: true },
    ]);
    expect(await cleanRetiredBanners(f.admin, actor, origin)).toBe(false);
    expect(f.remove).not.toHaveBeenCalled();
    expect(f.upload).not.toHaveBeenCalled();
  });
});
