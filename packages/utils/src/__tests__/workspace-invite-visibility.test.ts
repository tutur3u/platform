import { describe, expect, it } from 'vitest';
import { canShowWorkspaceInviteForNonMember } from '../workspace-helper';

describe('workspace invite visibility', () => {
  it.each([
    [false, true, false],
    [false, false, false],
    [true, true, true],
    [true, false, true],
  ])(
    'with pending invite %s and guest email match %s, visibility is %s',
    (hasPendingInvite, allowGuestSelfJoin, visible) => {
      expect(
        canShowWorkspaceInviteForNonMember({
          hasPendingInvite,
          allowGuestSelfJoin,
        })
      ).toBe(visible);
    }
  );
});
