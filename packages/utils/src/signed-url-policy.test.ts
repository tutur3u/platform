import { describe, expect, it } from 'vitest';
import {
  buildWorkspaceStorageShareUrl,
  clampSignedUrlTtl,
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  MAX_SIGNED_URL_TTL_SECONDS,
  parseSupabaseSignedObjectUrl,
  resolveStoredWorkspaceStorageUrl,
} from './signed-url-policy';

const WS = '11111111-1111-4111-8111-111111111111';
const signed = (bucket: string, path: string) =>
  `https://project.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=legacy-token`;

describe('clampSignedUrlTtl', () => {
  it('defaults to one hour and caps at seven days', () => {
    expect(DEFAULT_SIGNED_URL_TTL_SECONDS).toBe(3600);
    expect(MAX_SIGNED_URL_TTL_SECONDS).toBe(604_800);
    expect(clampSignedUrlTtl(undefined)).toBe(3600);
    expect(clampSignedUrlTtl(null)).toBe(3600);
    expect(clampSignedUrlTtl(Number.NaN)).toBe(3600);
    expect(clampSignedUrlTtl(31_536_000)).toBe(604_800);
    expect(clampSignedUrlTtl(Number.POSITIVE_INFINITY)).toBe(3600);
    expect(clampSignedUrlTtl(7200.9)).toBe(7200);
    expect(clampSignedUrlTtl(1)).toBe(60);
    expect(clampSignedUrlTtl(undefined, 900)).toBe(900);
    expect(clampSignedUrlTtl(undefined, 31_536_000)).toBe(604_800);
  });
});

describe('parseSupabaseSignedObjectUrl', () => {
  it('extracts bucket and decoded path', () => {
    expect(
      parseSupabaseSignedObjectUrl(
        signed('workspaces', `${WS}/documents/a%20b.png`)
      )
    ).toEqual({ bucket: 'workspaces', path: `${WS}/documents/a b.png` });
  });

  it.each([
    ['not a URL', 'documents/a.png'],
    [
      'public object URL',
      `https://p.supabase.co/storage/v1/object/public/avatars/${WS}/a.png`,
    ],
    [
      'missing token',
      `https://p.supabase.co/storage/v1/object/sign/workspaces/${WS}/a.png`,
    ],
    ['traversal', signed('workspaces', `${WS}/documents/%2e%2e/x.png`)],
    [
      'bucket only',
      'https://p.supabase.co/storage/v1/object/sign/workspaces?token=t',
    ],
  ])('rejects %s', (_, value) => {
    expect(parseSupabaseSignedObjectUrl(value)).toBeNull();
  });
});

describe('resolveStoredWorkspaceStorageUrl', () => {
  it('turns a stored signed workspaces URL into the sign-on-read share URL', () => {
    expect(
      resolveStoredWorkspaceStorageUrl(
        signed('workspaces', `${WS}/documents/a.png`)
      )
    ).toBe(buildWorkspaceStorageShareUrl(WS, 'documents/a.png'));
    expect(buildWorkspaceStorageShareUrl(WS, 'documents/a b.png')).toBe(
      `/api/v1/workspaces/${WS}/storage/share?path=documents%2Fa+b.png`
    );
  });

  it.each([
    ['other buckets', signed('avatars', `${WS}/users/a.png`)],
    ['non-workspace paths', signed('workspaces', 'documents/a.png')],
    ['workspace folder only', signed('workspaces', WS)],
    ['plain URLs', 'https://example.com/a.png'],
    ['share URLs', buildWorkspaceStorageShareUrl(WS, 'documents/a.png')],
  ])('leaves %s unchanged', (_, value) => {
    expect(resolveStoredWorkspaceStorageUrl(value)).toBe(value);
  });
});
