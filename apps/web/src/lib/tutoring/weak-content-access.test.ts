// @vitest-environment node
import {
  STANDARD_TUTORING_POLICY,
  serializeTutoringPolicyConfigRows,
} from '@tuturuuu/internal-api/tutoring-policy';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import { denyWeakContentEdit } from './weak-content-access';

vi.mock('next/server', () => ({
  NextResponse: { json: Response.json },
}));

function client(restrict: boolean) {
  const rows = serializeTutoringPolicyConfigRows({
    ...STANDARD_TUTORING_POLICY,
    restrictWeakContentEditors: restrict,
  });
  const query = {
    eq: vi.fn(() => query),
    like: vi.fn(async () => ({ data: rows, error: null })),
    select: vi.fn(() => query),
  };
  return {
    from: vi.fn(() => query),
  } as unknown as TypedSupabaseClient & { from: ReturnType<typeof vi.fn> };
}

const manager = { withoutPermission: () => false };
const scorer = { withoutPermission: () => true };

describe('weak-support tutoring content access', () => {
  it('lets anyone with feedback access edit while the policy is off', async () => {
    await expect(
      denyWeakContentEdit({
        permissions: scorer,
        sbAdmin: client(false),
        touchesWeakContent: true,
        wsId: 'ws',
      })
    ).resolves.toBeNull();
  });

  it('limits weak-support content to class managers when on', async () => {
    const denied = await denyWeakContentEdit({
      permissions: scorer,
      sbAdmin: client(true),
      touchesWeakContent: true,
      wsId: 'ws',
    });
    expect(denied?.status).toBe(403);
    await expect(denied?.json()).resolves.toMatchObject({
      code: 'TUTORING_CONTENT_RESTRICTED',
    });

    await expect(
      denyWeakContentEdit({
        permissions: manager,
        sbAdmin: client(true),
        touchesWeakContent: true,
        wsId: 'ws',
      })
    ).resolves.toBeNull();
  });

  it('never restricts ordinary feedback or reads the policy for it', async () => {
    const sbAdmin = client(true);
    await expect(
      denyWeakContentEdit({
        permissions: scorer,
        sbAdmin,
        touchesWeakContent: false,
        wsId: 'ws',
      })
    ).resolves.toBeNull();
    expect(sbAdmin.from).not.toHaveBeenCalled();
  });
});
