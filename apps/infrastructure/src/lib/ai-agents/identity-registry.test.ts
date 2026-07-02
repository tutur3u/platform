import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import {
  listZaloIdentityLinks,
  resolveZaloIdentity,
} from './identity-registry';

function createWorkspaceSecretsDb(
  rows: Array<{ name: string; value: string }>
) {
  const builder: {
    eq: ReturnType<typeof vi.fn>;
    like: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
  } = {
    eq: vi.fn(),
    like: vi.fn(),
    maybeSingle: vi.fn(),
    select: vi.fn(),
  };
  builder.eq.mockReturnValue(builder);
  builder.like.mockResolvedValue({ data: rows, error: null });
  builder.maybeSingle.mockResolvedValue({ data: rows[0] ?? null, error: null });
  builder.select.mockReturnValue(builder);

  return {
    builder,
    db: {
      from: vi.fn(() => builder),
    } as unknown as TypedSupabaseClient,
  };
}

describe('AI agent identity registry', () => {
  it('lists Zalo identity links from root workspace secrets', async () => {
    const { db } = createWorkspaceSecretsDb([
      {
        name: 'AI_AGENT_IDENTITY:workspace-1:zalo:oa-1:zalo-user-1',
        value: 'platform-user-1',
      },
      {
        name: 'AI_AGENT_IDENTITY:workspace-1:discord:guild:user',
        value: 'ignored',
      },
    ]);

    await expect(listZaloIdentityLinks(db)).resolves.toEqual([
      {
        externalUserId: 'zalo-user-1',
        platformUserId: 'platform-user-1',
        provider: 'zalo',
        providerAccountId: 'oa-1',
        workspaceId: 'workspace-1',
      },
    ]);
  });

  it('resolves one Zalo external user to a platform user id', async () => {
    const { builder, db } = createWorkspaceSecretsDb([
      {
        name: 'AI_AGENT_IDENTITY:workspace-1:zalo:oa-1:zalo-user-1',
        value: 'platform-user-1',
      },
    ]);

    await expect(
      resolveZaloIdentity({
        db,
        externalUserId: 'zalo-user-1',
        providerAccountId: 'oa-1',
        workspaceId: 'workspace-1',
      })
    ).resolves.toBe('platform-user-1');
    expect(builder.eq).toHaveBeenCalledWith(
      'name',
      'AI_AGENT_IDENTITY:workspace-1:zalo:oa-1:zalo-user-1'
    );
  });
});
