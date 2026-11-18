import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPlatformAssetRedirectOrigins,
  resolveAllowedAssetRedirectUrl,
} from './asset-redirect-policy';

const allowed = 'https://storage.example.test';

describe('CMS asset redirect policy', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_SERVER_URL', `${allowed}/`);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://public.example.test');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('derives the allowlist from the configured storage origins', () => {
    expect(getPlatformAssetRedirectOrigins()).toEqual([
      allowed,
      'https://public.example.test',
    ]);
  });

  it('allows https URLs on a platform storage origin', () => {
    for (const value of [
      `${allowed}/storage/v1/object/public/avatars/a.png`,
      'https://public.example.test/storage/v1/object/public/a.png',
      `${allowed.toUpperCase()}/storage/v1/object/public/a.png`,
      `${allowed}:443/storage/v1/object/public/a.png`,
    ]) {
      expect(resolveAllowedAssetRedirectUrl(value)?.origin, value).toBeTruthy();
    }
  });

  it('refuses foreign hosts, downgrades and non-web schemes', () => {
    for (const value of [
      'https://evil.example/a.png',
      'https://storage.example.test.evil.example/a.png',
      'https://evilstorage.example.test/a.png',
      `${allowed}:8443/storage/v1/object/public/a.png`,
      'http://storage.example.test/storage/v1/object/public/a.png',
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'ftp://storage.example.test/a.png',
      '//evil.example/a.png',
      '/storage/v1/object/public/a.png',
      'https:\\\\evil.example/a.png',
      'https:/\\evil.example',
      'malformed',
      '',
    ]) {
      expect(resolveAllowedAssetRedirectUrl(value), value).toBeNull();
    }
  });

  it('refuses non-storage paths on an allowed origin', () => {
    for (const value of [
      `${allowed}/auth/v1/verify?type=magiclink&redirect_to=https://evil.example`,
      `${allowed}/auth/v1/authorize?redirect_to=https://evil.example`,
      `${allowed}/`,
      `${allowed}/storage/v1/bucket/list`,
      `${allowed}/storage/v1/object/../../auth/v1/verify`,
      `${allowed}/storage/v1/object/%2e%2e/%2e%2e/auth/v1/verify`,
      `${allowed}/x/storage/v1/object/public/a.png`,
      `${allowed}/storage/v1/object/public/a%2f..%2f..%2fauth/v1/verify`,
      `${allowed}/storage/v1/object/public/a%5C..%5Cauth`,
    ]) {
      expect(resolveAllowedAssetRedirectUrl(value), value).toBeNull();
    }
  });

  it('refuses signed URLs that carry a token', () => {
    for (const value of [
      `${allowed}/storage/v1/object/sign/workspaces/ws-1/a.png?token=secret`,
      `${allowed}/storage/v1/render/image/sign/a.png?width=10&token=secret`,
      `${allowed}/storage/v1/object/public/a.png?%74oken=secret`,
      `${allowed}/storage/v1/object/public/a.png?Token=secret`,
      `${allowed}/storage/v1/object/public/a.png?TOKEN=secret`,
    ]) {
      expect(resolveAllowedAssetRedirectUrl(value), value).toBeNull();
    }
    expect(
      resolveAllowedAssetRedirectUrl(
        `${allowed}/storage/v1/render/image/public/a.png?width=10`
      )
    ).not.toBeNull();
  });

  it('refuses userinfo tricks in either direction', () => {
    for (const value of [
      'https://storage.example.test@evil.example/a.png',
      'https://storage.example.test:pw@evil.example/a.png',
      'https://evil.example@storage.example.test/a.png',
      'https://user:pw@storage.example.test/a.png',
    ]) {
      expect(resolveAllowedAssetRedirectUrl(value), value).toBeNull();
    }
  });

  it('allows plain HTTP only for a local development storage origin', () => {
    vi.stubEnv('SUPABASE_SERVER_URL', 'http://127.0.0.1:8001');
    const local = 'http://127.0.0.1:8001/storage/v1/object/public/a.png';

    expect(resolveAllowedAssetRedirectUrl(local)).toBeNull();
    vi.stubEnv('NODE_ENV', 'development');
    expect(resolveAllowedAssetRedirectUrl(local)?.origin).toBe(
      'http://127.0.0.1:8001'
    );
    expect(resolveAllowedAssetRedirectUrl('http://evil.example/a')).toBeNull();
  });

  it('refuses everything when no storage origin is configured', () => {
    vi.stubEnv('SUPABASE_SERVER_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'not a url');

    expect(getPlatformAssetRedirectOrigins()).toEqual([]);
    expect(
      resolveAllowedAssetRedirectUrl(`${allowed}/storage/v1/object/public/a`)
    ).toBeNull();
  });
});
