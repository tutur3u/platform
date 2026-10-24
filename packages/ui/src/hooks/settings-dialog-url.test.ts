import { describe, expect, it } from 'vitest';
import {
  buildSettingsDialogHref,
  CLOSED_SETTINGS_DIALOG_QUERY,
  getSettingsDialogHistoryMode,
  parseSettingsDialogQuery,
  resolveSettingsTab,
  sanitizeSettingsTabId,
  serializeSettingsDialogQuery,
} from './settings-dialog-url';

describe('settings dialog URL contract', () => {
  it('opens from a bare settingsTab deep link', () => {
    expect(parseSettingsDialogQuery({ settingsTab: 'security' })).toEqual({
      open: true,
      tab: 'security',
    });
  });

  it('keeps the legacy settingsDialog=open flag working', () => {
    expect(parseSettingsDialogQuery({ settingsDialog: 'open' })).toEqual({
      open: true,
      tab: null,
    });
    expect(
      parseSettingsDialogQuery({
        settingsDialog: 'open',
        settingsTab: 'sessions',
      })
    ).toEqual({ open: true, tab: 'sessions' });
  });

  it('stays closed without either param or with malformed tabs', () => {
    expect(parseSettingsDialogQuery({})).toEqual({ open: false, tab: null });
    expect(
      parseSettingsDialogQuery({ settingsDialog: 'closed', settingsTab: '' })
    ).toEqual({ open: false, tab: null });
    expect(parseSettingsDialogQuery({ settingsTab: '<script>' }).open).toBe(
      false
    );
  });

  it('sanitizes tab ids', () => {
    expect(sanitizeSettingsTabId(' Security ')).toBe('security');
    expect(sanitizeSettingsTabId('workspace_billing')).toBe(
      'workspace_billing'
    );
    expect(sanitizeSettingsTabId('../profile')).toBeNull();
    expect(sanitizeSettingsTabId('a'.repeat(65))).toBeNull();
    expect(sanitizeSettingsTabId(undefined)).toBeNull();
  });

  it('serializes open and closed states symmetrically', () => {
    expect(serializeSettingsDialogQuery('accounts')).toEqual({
      settingsDialog: 'open',
      settingsTab: 'accounts',
    });
    expect(serializeSettingsDialogQuery()).toEqual({
      settingsDialog: 'open',
      settingsTab: null,
    });
    expect(
      parseSettingsDialogQuery(serializeSettingsDialogQuery('profile'))
    ).toEqual({ open: true, tab: 'profile' });
    expect(parseSettingsDialogQuery(CLOSED_SETTINGS_DIALOG_QUERY)).toEqual({
      open: false,
      tab: null,
    });
  });

  it('falls back to the default tab for unknown tabs', () => {
    const tabs = ['profile', 'security', 'appearance'];
    expect(resolveSettingsTab('security', tabs, 'profile')).toBe('security');
    expect(resolveSettingsTab('not_a_tab', tabs, 'profile')).toBe('profile');
    expect(resolveSettingsTab('not_a_tab', tabs, 'missing')).toBe('profile');
    expect(resolveSettingsTab(null, ['appearance'])).toBe('appearance');
    expect(resolveSettingsTab('x', [])).toBeUndefined();
  });

  it('builds hrefs that preserve existing query and hash', () => {
    expect(buildSettingsDialogHref('/personal', 'security')).toBe(
      '/personal?settingsDialog=open&settingsTab=security'
    );
    expect(
      buildSettingsDialogHref('/ws?view=kanban&settingsTab=old#top', null, {
        settingsBoardId: 'b1',
      })
    ).toBe('/ws?view=kanban&settingsDialog=open&settingsBoardId=b1#top');
  });

  it('pushes history only when opening a closed dialog', () => {
    expect(getSettingsDialogHistoryMode('open', false)).toBe('push');
    expect(getSettingsDialogHistoryMode('open', true)).toBe('replace');
    expect(getSettingsDialogHistoryMode('tab', true)).toBe('replace');
    expect(getSettingsDialogHistoryMode('close', true)).toBe('replace');
  });
});
