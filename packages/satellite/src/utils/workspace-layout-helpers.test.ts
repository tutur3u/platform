import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
import { describe, expect, it, vi } from 'vitest';
import {
  getSidebarBehaviorUpdatedAt,
  getSidebarCollapsedState,
  parseSidebarBehavior,
} from './workspace-layout-helpers';

vi.mock('../constants/common', () => ({
  SIDEBAR_BEHAVIOR_COOKIE_NAME: 'sidebar-behavior',
  SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE_NAME: 'sidebar-behavior-updated-at',
  SIDEBAR_COLLAPSED_COOKIE_NAME: 'sidebar-collapsed',
}));

const SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE_NAME = 'sidebar-behavior-updated-at';
const SIDEBAR_BEHAVIOR_COOKIE_NAME = 'sidebar-behavior';
const SIDEBAR_COLLAPSED_COOKIE_NAME = 'sidebar-collapsed';

function cookieStoreWith(
  values: Record<string, string | undefined>
): ReadonlyRequestCookies {
  return {
    get: (name: string) => {
      const value = values[name];
      if (value === undefined) {
        return undefined;
      }

      return { name, value };
    },
  } as ReadonlyRequestCookies;
}

describe('getSidebarBehaviorUpdatedAt', () => {
  it('parses a valid sidebar behavior timestamp cookie', () => {
    expect(
      getSidebarBehaviorUpdatedAt(
        cookieStoreWith({
          [SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE_NAME]: '1234567890',
        })
      )
    ).toBe(1_234_567_890);
  });

  it('returns null when the timestamp cookie is missing', () => {
    expect(getSidebarBehaviorUpdatedAt(cookieStoreWith({}))).toBeNull();
  });

  it('returns null when the timestamp cookie is malformed', () => {
    expect(
      getSidebarBehaviorUpdatedAt(
        cookieStoreWith({
          [SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE_NAME]: 'not-a-number',
        })
      )
    ).toBeNull();
    expect(
      getSidebarBehaviorUpdatedAt(
        cookieStoreWith({
          [SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE_NAME]: '-1',
        })
      )
    ).toBeNull();
  });
});

describe('parseSidebarBehavior', () => {
  it('parses hidden as a valid sidebar behavior', () => {
    expect(
      parseSidebarBehavior(
        cookieStoreWith({ [SIDEBAR_BEHAVIOR_COOKIE_NAME]: 'hidden' })
      )
    ).toBe('hidden');
  });

  it('falls back to expanded by default for invalid sidebar behavior', () => {
    expect(
      parseSidebarBehavior(
        cookieStoreWith({ [SIDEBAR_BEHAVIOR_COOKIE_NAME]: 'invalid' })
      )
    ).toBe('expanded');
  });

  it('supports an app-specific fallback for invalid sidebar behavior', () => {
    expect(
      parseSidebarBehavior(
        cookieStoreWith({ [SIDEBAR_BEHAVIOR_COOKIE_NAME]: 'invalid' }),
        'collapsed'
      )
    ).toBe('collapsed');
  });
});

describe('getSidebarCollapsedState', () => {
  it('treats hidden as collapsed for initial layout state', () => {
    expect(getSidebarCollapsedState(cookieStoreWith({}), 'hidden')).toBe(true);
  });

  it('uses the collapsed cookie for expanded behavior', () => {
    expect(
      getSidebarCollapsedState(
        cookieStoreWith({ [SIDEBAR_COLLAPSED_COOKIE_NAME]: 'true' }),
        'expanded'
      )
    ).toBe(true);
  });
});
