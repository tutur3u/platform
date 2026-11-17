// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  isMailSharedSettingsTab,
  useMailSharedSettingsNav,
} from './mail-settings-shared';

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    return Object.assign(t, { has: () => true, rich: t, raw: t, markup: t });
  },
}));

describe('Mail shared settings groups', () => {
  it('adds the shared account, workspace and appearance tabs', () => {
    const { result } = renderHook(() => useMailSharedSettingsNav());
    const names = result.current.flatMap((group) =>
      group.items.map((item) => item.name)
    );

    expect(names).toEqual(
      expect.arrayContaining([
        'profile',
        'security',
        'workspace_general',
        'workspace_members',
        'appearance',
      ])
    );
  });

  it('tells shared tabs apart from Mail tabs', () => {
    const { result } = renderHook(() => useMailSharedSettingsNav());

    expect(isMailSharedSettingsTab(result.current, 'profile')).toBe(true);
    expect(isMailSharedSettingsTab(result.current, 'appearance')).toBe(true);
    expect(isMailSharedSettingsTab(result.current, 'delivery')).toBe(false);
    expect(isMailSharedSettingsTab(result.current, 'identity')).toBe(false);
  });
});
