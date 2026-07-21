import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  APP_OPEN_MODE_PREFERENCE_KEY,
  getAppsLauncherPreferenceCookieOptions,
} from './apps-launcher-preference';
import {
  renderAppsLauncherDialog,
  setupAppsLauncherTestEnvironment,
  teardownAppsLauncherTestEnvironment,
} from './apps-launcher-test-utils';

beforeEach(setupAppsLauncherTestEnvironment);
afterEach(teardownAppsLauncherTestEnvironment);

describe('apps launcher opening preference', () => {
  it('persists the selected app opening mode in a shared cookie', async () => {
    renderAppsLauncherDialog();

    const currentTab = screen.getByRole('radio', { name: 'This tab' });
    const newTab = screen.getByRole('radio', { name: 'New tab' });
    expect(newTab.getAttribute('data-state')).toBe('on');
    expect(newTab.getAttribute('data-selected')).toBe('true');
    expect(newTab.className).toContain('data-[selected=true]:!bg-foreground');
    expect(currentTab.getAttribute('data-state')).toBe('off');
    expect(currentTab.getAttribute('data-selected')).toBe('false');

    fireEvent.click(currentTab);

    const financeCard = screen.getByRole('link', { name: 'Finance' });
    expect(financeCard.getAttribute('target')).toBeNull();
    expect(financeCard.getAttribute('rel')).toBeNull();
    expect(currentTab.getAttribute('data-state')).toBe('on');
    expect(currentTab.getAttribute('data-selected')).toBe('true');
    expect(newTab.getAttribute('data-selected')).toBe('false');
    expect(document.cookie).toContain(
      `${APP_OPEN_MODE_PREFERENCE_KEY}=current-tab`
    );

    cleanup();
    renderAppsLauncherDialog();

    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: 'Finance' }).getAttribute('target')
      ).toBeNull();
      expect(
        screen
          .getByRole('radio', { name: 'This tab' })
          .getAttribute('data-state')
      ).toBe('on');
    });

    fireEvent.click(screen.getByRole('radio', { name: 'New tab' }));
    expect(
      screen.getByRole('link', { name: 'Finance' }).getAttribute('target')
    ).toBe('_blank');
  }, 30_000);

  it('shares the open-mode cookie across Tuturuuu subdomains', () => {
    expect(
      getAppsLauncherPreferenceCookieOptions(
        'https://tasks.tuturuuu.com/personal'
      )
    ).toMatchObject({ domain: '.tuturuuu.com', secure: true });
    expect(
      getAppsLauncherPreferenceCookieOptions(
        'https://contacts.tuturuuu.com/personal'
      )
    ).toMatchObject({ domain: '.tuturuuu.com', secure: true });
    expect(
      getAppsLauncherPreferenceCookieOptions(
        'http://finance.tuturuuu.localhost:7808/personal'
      )
    ).toMatchObject({ domain: '.tuturuuu.localhost', secure: false });
    expect(
      getAppsLauncherPreferenceCookieOptions(
        'https://platform-git-feature.vercel.app/personal'
      )
    ).not.toHaveProperty('domain');
  });

  it('migrates the previous local preference into the shared cookie', async () => {
    window.localStorage.setItem(
      APP_OPEN_MODE_PREFERENCE_KEY,
      JSON.stringify('current-tab')
    );

    renderAppsLauncherDialog();

    await waitFor(() => {
      expect(
        screen
          .getByRole('radio', { name: 'This tab' })
          .getAttribute('data-state')
      ).toBe('on');
    });
    expect(document.cookie).toContain(
      `${APP_OPEN_MODE_PREFERENCE_KEY}=current-tab`
    );
    expect(
      window.localStorage.getItem(APP_OPEN_MODE_PREFERENCE_KEY)
    ).toBeNull();
  });
});
