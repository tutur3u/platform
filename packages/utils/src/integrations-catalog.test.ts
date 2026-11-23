import { describe, expect, it } from 'vitest';
import {
  getCatalogIntegrationStatus,
  getVisibleIntegrationStatus,
  integrationsCatalog,
  resolveIntegrationDestinationUrl,
  UPSKII_LOGO_PATH,
} from './integrations-catalog';

describe('integration status visibility', () => {
  it.each(integrationsCatalog)(
    'projects $id status for visitors and verified staff',
    (entry) => {
      expect(getVisibleIntegrationStatus(entry.status, false)).toBe(
        entry.status === 'early_access' ? 'coming_soon' : entry.status
      );
      expect(getVisibleIntegrationStatus(entry.status, true)).toBe(
        entry.status
      );
    }
  );
});

describe('Upskii catalog entry', () => {
  it('leads the catalog with the official mark in internal early access', () => {
    expect(integrationsCatalog[0]).toMatchObject({
      id: 'upskii',
      group: 'featured',
      category: 'education',
      logo: UPSKII_LOGO_PATH,
      status: 'early_access',
      destination: 'account_integrations',
    });
    expect(getVisibleIntegrationStatus('early_access', false)).toBe(
      'coming_soon'
    );
  });
});

describe('integration destination URLs', () => {
  it.each([
    [
      'account_integrations',
      '/personal',
      { settingsDialog: 'open', settingsTab: 'account_integrations' },
    ],
    [
      'calendar',
      '/personal',
      { settingsDialog: 'open', settingsTab: 'calendar_integrations' },
    ],
    [
      'mail',
      '/personal/inbox',
      { mailSettings: 'open', mailSettingsTab: 'source' },
    ],
  ] as const)(
    'opens the existing %s panel in production',
    (destination, path, params) => {
      const url = new URL(
        resolveIntegrationDestinationUrl(destination, {
          environment: 'production',
          locale: 'vi',
        }) ?? ''
      );
      expect(url.protocol).toBe('https:');
      expect(url.pathname.endsWith(`/vi${path}`)).toBe(true);
      expect(Object.fromEntries(url.searchParams)).toEqual(params);
    }
  );

  it('serves account integrations from the web origin', () => {
    expect(
      resolveIntegrationDestinationUrl('account_integrations', {
        environment: 'production',
      })
    ).toBe(
      'https://tuturuuu.com/personal?settingsDialog=open&settingsTab=account_integrations'
    );
  });
});

describe('catalog status lookup', () => {
  it('reads a listed status and answers null for an unlisted id', () => {
    expect(getCatalogIntegrationStatus('upskii')).toBe('early_access');
    expect(getCatalogIntegrationStatus('gmail')).toBe('early_access');
    expect(getCatalogIntegrationStatus('google_calendar')).toBe('available');
    expect(getCatalogIntegrationStatus('not-listed')).toBeNull();
  });
});
