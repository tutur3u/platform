import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import { isValidEdgeSecret, resolveWorkspaceDomain } from './resolve';

const SECRET = 's'.repeat(40);

describe('isValidEdgeSecret', () => {
  it('requires a configured secret of adequate length and an exact match', () => {
    expect(isValidEdgeSecret(SECRET, SECRET)).toBe(true);
    expect(isValidEdgeSecret(`${SECRET}x`, SECRET)).toBe(false);
    expect(isValidEdgeSecret(null, SECRET)).toBe(false);
    expect(isValidEdgeSecret('short', 'short')).toBe(false);
    expect(isValidEdgeSecret(SECRET, undefined)).toBe(false);
  });
});

function fakeAdmin({
  domain,
  serving,
  workspace,
}: {
  domain: unknown;
  serving: unknown;
  workspace: unknown;
}) {
  const query = (data: unknown) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data, error: null }),
    };
    return chain;
  };
  const from = vi.fn((table: string) =>
    query(table === 'workspace_domains' ? domain : workspace)
  );
  return {
    from,
    schema: () => ({ rpc: async () => ({ data: serving, error: null }) }),
  } as unknown as TypedSupabaseClient;
}

const WORKSPACE = {
  id: 'ws-1',
  name: 'Phuc',
  avatar_url: 'http://insecure.example/a.png',
  logo_url: 'https://cdn.example/logo.png',
  deleted: false,
};

describe('resolveWorkspaceDomain', () => {
  it('returns only public facts for an active, entitled domain', async () => {
    const admin = fakeAdmin({
      domain: { id: 'd1', ws_id: 'ws-1' },
      serving: true,
      workspace: WORKSPACE,
    });
    expect(
      await resolveWorkspaceDomain(admin, 'Phuc.TTR.gg:443', async () => true)
    ).toEqual({
      wsId: 'ws-1',
      name: 'Phuc',
      avatarUrl: 'https://cdn.example/logo.png',
      siteAvailable: true,
    });
  });

  it('returns null for unknown, unentitled or unusable hosts', async () => {
    const site = async () => true;
    expect(
      await resolveWorkspaceDomain(
        fakeAdmin({ domain: null, serving: true, workspace: WORKSPACE }),
        'example.com',
        site
      )
    ).toBeNull();
    expect(
      await resolveWorkspaceDomain(
        fakeAdmin({
          domain: { id: 'd1', ws_id: 'ws-1' },
          serving: false,
          workspace: WORKSPACE,
        }),
        'example.com',
        site
      )
    ).toBeNull();
    expect(
      await resolveWorkspaceDomain(
        fakeAdmin({ domain: null, serving: true, workspace: WORKSPACE }),
        '[::1]',
        site
      )
    ).toBeNull();
  });
});
