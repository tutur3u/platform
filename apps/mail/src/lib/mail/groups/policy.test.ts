import { describe, expect, it } from 'vitest';
import {
  canSendAsGroup,
  DEFAULT_GROUP_POLICY,
  permitsGroupScope,
  readGroupPolicy,
} from './policy';

describe('group policy', () => {
  it('fails closed for malformed or history-enabled configuration', () => {
    expect(readGroupPolicy({})).toBeNull();
    expect(() =>
      readGroupPolicy({
        mail_group: { ...DEFAULT_GROUP_POLICY, historyEnabled: true },
      })
    ).toThrow();
    expect(() => readGroupPolicy({ mail_group: {} })).toThrow();
  });
  it('distinguishes organization users, members and managers', () => {
    expect(permitsGroupScope('organization', { activeInternal: true })).toBe(
      true
    );
    expect(permitsGroupScope('members', { activeInternal: true })).toBe(false);
    expect(
      permitsGroupScope('members', { activeInternal: true, role: 'viewer' })
    ).toBe(true);
    expect(
      permitsGroupScope('managers', { activeInternal: true, role: 'sender' })
    ).toBe(false);
    expect(
      permitsGroupScope('managers', { activeInternal: true, role: 'admin' })
    ).toBe(true);
    expect(
      permitsGroupScope('organization', {
        activeInternal: false,
        role: 'owner',
      })
    ).toBe(false);
  });
  it('grants send-as only under the configured role policy', () => {
    expect(canSendAsGroup(DEFAULT_GROUP_POLICY, 'sender')).toBe(false);
    expect(canSendAsGroup(DEFAULT_GROUP_POLICY, 'owner')).toBe(true);
    expect(
      canSendAsGroup({ ...DEFAULT_GROUP_POLICY, sendAs: 'members' }, 'viewer')
    ).toBe(true);
  });
});
