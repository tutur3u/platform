import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  createStorageDownloadUrl,
  readStorageDownloadTicket,
} from './storage-download-token';

const upstream =
  'https://storage.example.test/storage/v1/object/sign/workspaces/ws-1/file.zip?token=private-cdn-credential';

describe('opaque workspace download tickets', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_SECRET_KEY', 'synthetic-test-secret');
    vi.stubEnv('STORAGE_DOWNLOAD_SIGNING_SECRET', 'synthetic-test-secret');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test');
    vi.stubEnv('SUPABASE_SERVER_URL', 'https://storage.example.test');
    vi.stubEnv('WEB_APP_URL', 'https://web.example.test');
    vi.stubEnv('STORAGE_DOWNLOAD_REVOKED_BEFORE', '0');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('keeps the CDN credential private and round-trips the scoped ticket', () => {
    const url = createStorageDownloadUrl(upstream, 'ws-1', 60);
    expect(url).toMatch(
      /^https:\/\/web.example.test\/api\/v1\/storage\/guarded-download\//u
    );
    expect(url).not.toContain('private-cdn-credential');
    const token = url.split('/').pop() as string;
    expect(Buffer.from(token, 'base64url').toString()).not.toContain(upstream);
    expect(readStorageDownloadTicket(token)).toMatchObject({
      url: upstream,
      wsId: 'ws-1',
    });
  });

  it('rejects tampering, expiration, revocation, and encryption-key rotation', () => {
    vi.useFakeTimers();
    const token = createStorageDownloadUrl(upstream, 'ws-1', 60)
      .split('/')
      .pop() as string;
    const bytes = Buffer.from(token, 'base64url');
    bytes[30] = (bytes[30] ?? 0) ^ 1;
    expect(() =>
      readStorageDownloadTicket(bytes.toString('base64url'))
    ).toThrow();
    vi.stubEnv(
      'STORAGE_DOWNLOAD_REVOKED_BEFORE',
      String(Math.floor(Date.now() / 1000))
    );
    expect(() => readStorageDownloadTicket(token)).toThrow();
    vi.stubEnv('STORAGE_DOWNLOAD_REVOKED_BEFORE', '0');
    vi.stubEnv('STORAGE_DOWNLOAD_SIGNING_SECRET', 'rotated-test-secret');
    expect(() => readStorageDownloadTicket(token)).toThrow();
    vi.stubEnv('STORAGE_DOWNLOAD_SIGNING_SECRET', 'synthetic-test-secret');
    vi.advanceTimersByTime(60_000);
    expect(() => readStorageDownloadTicket(token)).toThrow();
  });

  it.each([
    'https://attacker.example/storage/v1/object/sign/workspaces/ws-1/file.zip',
    'https://storage.example.test/storage/v1/object/sign/workspaces/ws-2/file.zip',
    'https://storage.example.test/storage/v1/object/public/workspaces/ws-1/file.zip',
    'https://storage.example.test/storage/v1/object/sign/workspaces/ws-1/%2e%2e%2ffile.zip',
    'https://user:password@storage.example.test/storage/v1/object/sign/workspaces/ws-1/file.zip',
  ])(
    'rejects foreign origins, cross-workspace paths and traversal: %s',
    (url) => {
      expect(() => createStorageDownloadUrl(url, 'ws-1', 60)).toThrow();
    }
  );
});
