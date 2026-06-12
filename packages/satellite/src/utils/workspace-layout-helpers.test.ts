import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
import { describe, expect, it, vi } from 'vitest';
import { getSidebarBehaviorUpdatedAt } from './workspace-layout-helpers';

vi.mock('../constants/common', () => ({
  SIDEBAR_BEHAVIOR_COOKIE_NAME: 'sidebar-behavior',
  SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE_NAME: 'sidebar-behavior-updated-at',
  SIDEBAR_COLLAPSED_COOKIE_NAME: 'sidebar-collapsed',
}));

const SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE_NAME = 'sidebar-behavior-updated-at';

function cookieStoreWith(value: string | undefined): ReadonlyRequestCookies {
  return {
    get: (name: string) => {
      if (
        name !== SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE_NAME ||
        value === undefined
      ) {
        return undefined;
      }

      return { name, value };
    },
  } as ReadonlyRequestCookies;
}

describe('getSidebarBehaviorUpdatedAt', () => {
  it('parses a valid sidebar behavior timestamp cookie', () => {
    expect(getSidebarBehaviorUpdatedAt(cookieStoreWith('1234567890'))).toBe(
      1_234_567_890
    );
  });

  it('returns null when the timestamp cookie is missing', () => {
    expect(getSidebarBehaviorUpdatedAt(cookieStoreWith(undefined))).toBeNull();
  });

  it('returns null when the timestamp cookie is malformed', () => {
    expect(
      getSidebarBehaviorUpdatedAt(cookieStoreWith('not-a-number'))
    ).toBeNull();
    expect(getSidebarBehaviorUpdatedAt(cookieStoreWith('-1'))).toBeNull();
  });
});
