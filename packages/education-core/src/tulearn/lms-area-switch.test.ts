import { describe, expect, it, vi } from 'vitest';
import {
  lmsAreaSwitchHref,
  lmsAreaWorkspaceOrder,
  resolveLmsAreaSwitchHref,
} from './lms-area-switch';

describe('lms area switch', () => {
  it('hides the switch from a single-role teacher', () => {
    expect(
      lmsAreaSwitchHref({
        current: 'teach',
        locale: 'en',
        otherAreaAllowed: false,
      })
    ).toBeNull();
  });

  it('hides the switch from a single-role learner', () => {
    expect(
      lmsAreaSwitchHref({
        current: 'learn',
        locale: 'vi',
        otherAreaAllowed: false,
      })
    ).toBeNull();
  });

  it.each([
    ['teach', 'en', '/lms/learn/en/dashboard'],
    ['teach', 'vi', '/lms/learn/vi/dashboard'],
    ['learn', 'en', '/lms/teach/en/dashboard'],
    ['learn', 'vi', '/lms/teach/vi/dashboard'],
  ] as const)(
    'links a dual-role %s user to the %s home',
    (current, locale, href) => {
      expect(
        lmsAreaSwitchHref({
          current,
          locale,
          otherAreaAllowed: true,
        })
      ).toBe(href);
    }
  );

  it('drops a locale the shells do not store', () => {
    expect(
      lmsAreaSwitchHref({
        current: 'teach',
        locale: 'fr',
        otherAreaAllowed: true,
      })
    ).toBeNull();
  });

  it('checks the open workspace before the rest of the account', () => {
    expect(lmsAreaWorkspaceOrder('current', ['other', 'current', ''])).toEqual([
      'current',
      'other',
    ]);
  });

  it('returns no link when every workspace denies the other area', async () => {
    const hasOtherAreaAccess = vi.fn(async () => false);
    await expect(
      resolveLmsAreaSwitchHref({
        current: 'learn',
        locale: 'en',
        workspaceIds: ['class-a', 'class-b'],
        hasOtherAreaAccess,
      })
    ).resolves.toBeNull();
    expect(hasOtherAreaAccess).toHaveBeenCalledTimes(2);
  });

  it('stops at the first workspace that allows the other area', async () => {
    const hasOtherAreaAccess = vi.fn(
      async (wsId: string) => wsId === 'class-b'
    );
    await expect(
      resolveLmsAreaSwitchHref({
        current: 'teach',
        locale: 'vi',
        workspaceIds: ['class-a', 'class-b', 'class-c'],
        hasOtherAreaAccess,
      })
    ).resolves.toBe('/lms/learn/vi/dashboard');
    expect(hasOtherAreaAccess.mock.calls.map(([wsId]) => wsId)).toEqual([
      'class-a',
      'class-b',
    ]);
  });
});
