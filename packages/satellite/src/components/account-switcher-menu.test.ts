import { describe, expect, it } from 'vitest';
import { webAccountSettingsUrl } from './account-switcher-menu';

describe('webAccountSettingsUrl', () => {
  it('opens account settings inside the current accepted workspace', () => {
    expect(
      webAccountSettingsUrl('https://tuturuuu.com/', 'invited workspace/member')
    ).toBe(
      'https://tuturuuu.com/invited%20workspace%2Fmember?settingsDialog=open&settingsTab=accounts'
    );
  });

  it('falls back to an existing account route without a workspace context', () => {
    expect(webAccountSettingsUrl('https://tuturuuu.com///')).toBe(
      'https://tuturuuu.com/add-account'
    );
  });
});
