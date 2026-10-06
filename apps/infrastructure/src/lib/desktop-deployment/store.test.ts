import type { SupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { listDesktopVaultState, requireDesktopResult } from './store';

function database(
  rows: Record<string, unknown[]>,
  failure: string | null = null
) {
  const selects: string[] = [];
  const from = vi.fn((table: string) => {
    const chain = {
      select: (fields: string) => {
        selects.push(fields);
        return chain;
      },
      order: () => chain,
      in: () => chain,
      limit: () => chain,
      // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are deliberately awaitable.
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          data: rows[table] ?? [],
          error: failure ? { code: failure, message: 'private failure' } : null,
        }).then(resolve),
    };
    return chain;
  });
  return {
    db: { schema: () => ({ from }) } as unknown as SupabaseClient<Database>,
    selects,
    from,
  };
}

describe('safe desktop metadata projection', () => {
  it('never serializes encrypted material, scalar suffixes or token hashes', async () => {
    const secret = {
      data_key_ciphertext: 'PRIVATE KEY',
      encrypted_value: 'PRIVATE RESOURCE',
      token_hash: 'PRIVATE HASH',
      plaintext_sha256: 'PRIVATE SHA',
      password: 'PRIVATE PASSWORD',
    };
    const { db, selects } = database({
      desktop_deployment_environments: [
        {
          platform: 'windows',
          enabled: false,
          active_version_id: null,
          ...secret,
        },
      ],
      desktop_deployment_versions: [
        {
          id: 'version',
          platform: 'windows',
          version: 1,
          status: 'draft',
          revision: 2,
          validated_revision: null,
          validation_errors: ['not_validated'],
          created_at: 'now',
          ...secret,
        },
      ],
      desktop_deployment_resources: [
        {
          version_id: 'version',
          name: 'WINDOWS_SIGNING_CERTIFICATE_PASSWORD',
          ...secret,
        },
      ],
      desktop_deployment_ci_tokens: [
        {
          id: 'token',
          platform: 'windows',
          version_id: 'version',
          token_prefix: 'prefix',
          expires_at: 'future',
          revoked_at: null,
          ...secret,
        },
      ],
    });
    const state = await listDesktopVaultState(db);
    expect(JSON.stringify(state)).not.toContain('PRIVATE');
    expect(state.deliveryEnabled).toBe(false);
    expect(state.versions[0]?.resources).toEqual([
      'WINDOWS_SIGNING_CERTIFICATE_PASSWORD',
    ]);
    expect(selects.join(',')).not.toMatch(
      /ciphertext|encrypted_value|token_hash|plaintext_sha256/
    );
  });
  it('does not enumerate resource storage with no visible versions', async () => {
    const { db, from } = database({});
    expect((await listDesktopVaultState(db)).versions).toEqual([]);
    expect(from).not.toHaveBeenCalledWith('desktop_deployment_resources');
  });
  it('fails a partial snapshot instead of pretending an inaccessible platform is empty', async () => {
    await expect(
      listDesktopVaultState(database({}, 'XX000').db)
    ).rejects.toMatchObject({
      status: 500,
      code: 'desktop_storage_unavailable',
    });
  });
  it.each([
    ['42501', 403],
    ['40001', 409],
    ['23505', 409],
    ['P0002', 404],
    ['XX000', 500],
  ])('maps database code %s without raw error text', (code, status) => {
    try {
      requireDesktopResult({ code });
    } catch (error) {
      expect(error).toMatchObject({ status });
      expect(String(error)).not.toContain(code);
    }
  });
});
