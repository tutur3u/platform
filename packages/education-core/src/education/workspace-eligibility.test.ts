import { describe, expect, it, vi } from 'vitest';
import { checkEducationWorkspaceEligibility } from './workspace-eligibility';

vi.mock('next/server', () => {
  throw new Error('Portable education policy must not load Next');
});
vi.mock('@tuturuuu/utils/workspace-helper', () => {
  throw new Error(
    'Portable education policy must not load the workspace framework adapter'
  );
});

describe('portable education workspace eligibility', () => {
  it.each(['GUEST', null, undefined] as const)(
    'rejects %s before reading the feature flag',
    async (membershipType) => {
      const readEducationSecret = vi.fn();
      await expect(
        checkEducationWorkspaceEligibility({
          membershipType,
          readEducationSecret,
        })
      ).resolves.toEqual({
        ok: false,
        message: "You don't have access to this workspace",
        status: 403,
      });
      expect(readEducationSecret).not.toHaveBeenCalled();
    }
  );

  it.each(['true', ' TRUE ', '\tTrue\n'])(
    'accepts an enabled full member with flag %j',
    async (value) => {
      await expect(
        checkEducationWorkspaceEligibility({
          membershipType: 'MEMBER',
          readEducationSecret: async () => ({ data: { value }, error: null }),
        })
      ).resolves.toEqual({ ok: true });
    }
  );

  it.each(['false', '', null, '1'])(
    'rejects a disabled flag %j',
    async (value) => {
      await expect(
        checkEducationWorkspaceEligibility({
          membershipType: 'MEMBER',
          readEducationSecret: async () => ({ data: { value }, error: null }),
        })
      ).resolves.toEqual({
        ok: false,
        message: 'Education is not enabled for this workspace',
        status: 404,
      });
    }
  );

  it('rejects a missing feature flag', async () => {
    await expect(
      checkEducationWorkspaceEligibility({
        membershipType: 'MEMBER',
        readEducationSecret: async () => ({ data: null, error: null }),
      })
    ).resolves.toEqual({
      ok: false,
      message: 'Education is not enabled for this workspace',
      status: 404,
    });
  });

  it('fails closed on a flag lookup error even when data says true', async () => {
    await expect(
      checkEducationWorkspaceEligibility({
        membershipType: 'MEMBER',
        readEducationSecret: async () => ({
          data: { value: 'true' },
          error: new Error('unavailable'),
        }),
      })
    ).resolves.toEqual({
      ok: false,
      message: 'Failed to verify education access',
      status: 500,
    });
  });
});
