import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createGuardedSupabaseStorageReadUrl } from './storage-download-sign';
import { readStorageDownloadTicket } from './storage-download-token';

describe('private Storage URL issuance', () => {
  const sign = vi.fn();
  const supabase = {
    storage: { from: () => ({ createSignedUrl: sign }) },
  } as unknown as TypedSupabaseClient;
  beforeEach(() => {
    vi.stubEnv('SECURITY_EGRESS_ENFORCEMENT_ENABLED', 'true');
    vi.stubEnv('STORAGE_DOWNLOAD_SIGNING_SECRET', 'synthetic-test-secret');
    vi.stubEnv('STORAGE_DOWNLOAD_REVOKED_BEFORE', '0');
    vi.stubEnv('STORAGE_DOWNLOADS_DISABLED', 'false');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test');
    vi.stubEnv('SUPABASE_SERVER_URL', 'https://storage.example.test');
    vi.stubEnv('WEB_APP_URL', 'https://web.example.test');
    sign.mockReset().mockResolvedValue({
      data: {
        signedUrl:
          'https://storage.example.test/storage/v1/object/sign/workspaces/ws-1/file.zip?token=private-cdn-credential',
      },
      error: null,
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns the relay instead of the underlying bearer URL and preserves transforms and expiry', async () => {
    const url = await createGuardedSupabaseStorageReadUrl(
      supabase,
      'ws-1',
      'ws-1/file.zip',
      60,
      { width: 100 }
    );
    expect(sign).toHaveBeenCalledWith('ws-1/file.zip', 60, {
      transform: { width: 100 },
    });
    expect(url).not.toContain('private-cdn-credential');
    const ticket = readStorageDownloadTicket(url.split('/').pop() as string);
    expect(ticket.expiresAt - ticket.issuedAt).toBe(60);
  });

  it('does not issue a direct URL as a fallback after failure or emergency disable', async () => {
    sign.mockRejectedValue(
      new Error('request failed with private-cdn-credential')
    );
    await expect(
      createGuardedSupabaseStorageReadUrl(supabase, 'ws-1', 'ws-1/file.zip')
    ).rejects.toMatchObject({
      message: 'Failed to generate download URL',
      status: 502,
    });
    vi.stubEnv('STORAGE_DOWNLOADS_DISABLED', 'true');
    sign.mockClear();
    await expect(
      createGuardedSupabaseStorageReadUrl(supabase, 'ws-1', 'ws-1/file.zip')
    ).rejects.toMatchObject({ status: 503 });
    expect(sign).not.toHaveBeenCalled();
  });
  it('preserves legacy URLs before explicit migration activation', async () => {
    vi.stubEnv('SECURITY_EGRESS_ENFORCEMENT_ENABLED', 'false');
    await expect(
      createGuardedSupabaseStorageReadUrl(supabase, 'ws-1', 'ws-1/file.zip')
    ).resolves.toContain('token=private-cdn-credential');
  });
});

it('preserves missing-object status without exposing provider details', async () => {
  const client = {
    storage: {
      from: () => ({
        createSignedUrl: async () => ({
          data: null,
          error: { status: 404, message: 'Object not found' },
        }),
      }),
    },
  } as unknown as TypedSupabaseClient;
  await expect(
    createGuardedSupabaseStorageReadUrl(client, 'ws-1', 'ws-1/missing')
  ).rejects.toMatchObject({ status: 404 });
});
