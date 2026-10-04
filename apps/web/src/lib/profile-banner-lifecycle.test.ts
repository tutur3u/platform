import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  canonicalManagedBanner,
  cleanRetiredBanners,
  ownedBannerPath,
} from './profile-banner-lifecycle';

const actor = '00000000-0000-4000-8000-000000000001';
const origin = 'https://storage.example.test';
const path = `${actor}/1234567890123.png`;
const url = `${origin}/storage/v1/object/public/banners/${path}`;
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
  } as unknown as SupabaseClient<any>;
  return { admin, remove, upload, rpc };
}
describe('authenticated immutable banner retirement', () => {
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
      contentType: 'image/png',
      cacheControl: '0',
    });
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
  it('never deletes an inconsistent or foreign queue row', async () => {
    const f = fixture([
      { public_url: url, file_path: 'foreign/path.png', delete_ready: true },
    ]);
    expect(await cleanRetiredBanners(f.admin, actor, origin)).toBe(false);
    expect(f.remove).not.toHaveBeenCalled();
    expect(f.upload).not.toHaveBeenCalled();
  });
});
