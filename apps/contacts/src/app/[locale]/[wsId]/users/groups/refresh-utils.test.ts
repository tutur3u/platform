import { describe, expect, it } from 'vitest';
import {
  shouldRefreshUserGroups,
  USER_GROUPS_REFRESH_COOLDOWN_MS,
} from './refresh-utils';

describe('shouldRefreshUserGroups', () => {
  it('allows the first refresh', () => {
    expect(shouldRefreshUserGroups(1000, null)).toBe(true);
  });

  it('blocks refreshes inside the cooldown window', () => {
    expect(
      shouldRefreshUserGroups(1000 + USER_GROUPS_REFRESH_COOLDOWN_MS - 1, 1000)
    ).toBe(false);
  });

  it('allows refreshes after the cooldown window', () => {
    expect(
      shouldRefreshUserGroups(1000 + USER_GROUPS_REFRESH_COOLDOWN_MS, 1000)
    ).toBe(true);
  });
});
