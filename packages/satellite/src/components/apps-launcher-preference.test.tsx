import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  APP_FAVORITES_PREFERENCE_KEY,
  APP_RECENT_PREFERENCE_KEY,
  parseAppsLauncherSlugs,
} from './apps-launcher-favorites';
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

function financeLink() {
  return document.getElementById(
    'apps-launcher-category-operations-finance'
  ) as HTMLElement;
}

async function openPreferenceMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Open options' }));
  return screen.findByRole('radiogroup', { name: 'Open options' });
}

describe('apps launcher opening preference', () => {
  it('persists the selected app opening mode in a shared cookie', async () => {
    renderAppsLauncherDialog();

    const trigger = screen.getByRole('button', { name: 'Open options' });
    expect(trigger.textContent).toBe('New tab');
    await openPreferenceMenu();
    expect(screen.getByText('Open apps in')).toBeTruthy();
    const currentTab = screen.getByRole('radio', { name: 'This tab' });
    const newTab = screen.getByRole('radio', { name: 'New tab' });
    expect(newTab.getAttribute('data-state')).toBe('on');
    expect(newTab.getAttribute('data-selected')).toBe('true');
    expect(newTab.className).toContain('data-[selected=true]:!bg-accent');
    expect(currentTab.getAttribute('data-state')).toBe('off');
    expect(currentTab.getAttribute('data-selected')).toBe('false');

    fireEvent.click(currentTab);

    expect(financeLink().getAttribute('target')).toBeNull();
    expect(financeLink().getAttribute('rel')).toBeNull();
    expect(trigger.textContent).toBe('This tab');
    expect(currentTab.getAttribute('data-state')).toBe('on');
    expect(currentTab.getAttribute('data-selected')).toBe('true');
    expect(newTab.getAttribute('data-selected')).toBe('false');
    expect(document.cookie).toContain(
      `${APP_OPEN_MODE_PREFERENCE_KEY}=current-tab`
    );

    cleanup();
    renderAppsLauncherDialog();

    await waitFor(() => {
      expect(financeLink().getAttribute('target')).toBeNull();
    });
    await openPreferenceMenu();
    expect(
      screen.getByRole('radio', { name: 'This tab' }).getAttribute('data-state')
    ).toBe('on');

    fireEvent.click(screen.getByRole('radio', { name: 'New tab' }));
    expect(financeLink().getAttribute('target')).toBe('_blank');
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

  it('persists favorites and recent apps in shared cookies', () => {
    renderAppsLauncherDialog();
    fireEvent.click(
      screen.getByRole('button', { name: 'Add Finance to favorites' })
    );
    fireEvent.click(financeLink());
    expect(document.cookie).toContain(
      `${APP_FAVORITES_PREFERENCE_KEY}=finance`
    );
    expect(document.cookie).toContain(`${APP_RECENT_PREFERENCE_KEY}=finance`);

    cleanup();
    renderAppsLauncherDialog();
    expect(
      document.getElementById('apps-launcher-recent-finance')
    ).toBeTruthy();
    expect(
      document.getElementById('apps-launcher-favorites-finance')
    ).toBeTruthy();
  });

  it('ignores unknown and duplicate slugs in stored lists', () => {
    expect(parseAppsLauncherSlugs('tasks,unknown,tasks, finance')).toEqual([
      'tasks',
      'finance',
    ]);
    expect(parseAppsLauncherSlugs(null)).toEqual([]);
  });

  it('migrates the previous local preference into the shared cookie', async () => {
    window.localStorage.setItem(
      APP_OPEN_MODE_PREFERENCE_KEY,
      JSON.stringify('current-tab')
    );

    renderAppsLauncherDialog();

    await waitFor(() => {
      expect(financeLink().getAttribute('target')).toBeNull();
    });
    await openPreferenceMenu();
    expect(
      screen.getByRole('radio', { name: 'This tab' }).getAttribute('data-state')
    ).toBe('on');
    expect(document.cookie).toContain(
      `${APP_OPEN_MODE_PREFERENCE_KEY}=current-tab`
    );
    expect(
      window.localStorage.getItem(APP_OPEN_MODE_PREFERENCE_KEY)
    ).toBeNull();
  });
});
