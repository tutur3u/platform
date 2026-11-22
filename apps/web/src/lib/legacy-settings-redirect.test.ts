import { describe, expect, it } from 'vitest';
import { legacySettingsTab } from './legacy-settings-redirect';

describe('legacySettingsTab', () => {
  it.each([
    ['/settings', '', 'profile'],
    ['/settings/', '?settingsTab=appearance', 'appearance'],
    ['/settings', '?settingsTab=%3Cscript%3E', 'profile'],
    ['/settings/%2Fsecurity', '', 'profile'],
    ['/settings/account', '', 'profile'],
    ['/settings/account/notifications', '', 'notifications'],
    ['/personal/settings/SeCuRiTy', '', 'security'],
    ['/workspace/settings/account/sessions', '', 'sessions'],
    ['/workspace/settings', '', null],
    ['/settings/settings', '', null],
    ['/settings/tasks', '', null],
    ['/settings/members', '', null],
    ['/settings/notifications', '', 'notifications'],
    ['/settings/settings/notifications', '', null],
    ['/workspace/settings/notifications', '', null],
    ['/workspace/settings/reports', '', null],
    ['/workspace/settings/account/profile/extra', '', null],
    ['/share/settings/profile', '', null],
    ['/api/v1/settings/profile', '', null],
  ])('maps %s with query %s to %s', (path, query, tab) => {
    expect(legacySettingsTab(path, new URLSearchParams(query))).toBe(tab);
  });
});
