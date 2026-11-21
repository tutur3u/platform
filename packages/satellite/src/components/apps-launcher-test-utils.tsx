import { cleanup, render } from '@testing-library/react';
import {
  LAUNCHABLE_APPS,
  type LaunchableWorkspace,
} from '@tuturuuu/utils/launchable-apps';
import { NextIntlClientProvider } from 'next-intl';
import { useState } from 'react';
import { vi } from 'vitest';
import { AppsLauncherDialog } from './apps-launcher';
import {
  APP_FAVORITES_PREFERENCE_KEY,
  APP_RECENT_PREFERENCE_KEY,
} from './apps-launcher-favorites';
import { APP_OPEN_MODE_PREFERENCE_KEY } from './apps-launcher-preference';

const appNames = Object.fromEntries(
  LAUNCHABLE_APPS.map((app) => [
    app.slug,
    app.slug === 'platform' ? 'Workspace Platform' : app.title,
  ])
);
const appDescriptions = Object.fromEntries(
  LAUNCHABLE_APPS.map((app) => [
    app.slug,
    app.slug === 'finance'
      ? 'Manage wallets, transactions, invoices, and budgets.'
      : `Understand what ${app.title} helps you do.`,
  ])
);
const localStorageValues = new Map<string, string>();
const localStorageMock = {
  clear: () => localStorageValues.clear(),
  getItem: (key: string) => localStorageValues.get(key) ?? null,
  key: (index: number) => [...localStorageValues.keys()][index] ?? null,
  get length() {
    return localStorageValues.size;
  },
  removeItem: (key: string) => localStorageValues.delete(key),
  setItem: (key: string, value: string) => localStorageValues.set(key, value),
} satisfies Storage;

const messages = {
  common: { close: 'Close' },
  command_launcher: {
    aliases_slot: 'Also matches: {aliases}',
    app_categories: {
      ai: 'AI',
      all: 'All',
      core: 'Core',
      developer: 'Developer',
      learning: 'Learning',
      miscellaneous: 'Miscellaneous',
      operations: 'Operations',
      productivity: 'Productivity',
    },
    app_category_descriptions: {
      ai: 'AI apps for assistants, simulations, and creative thinking.',
      all: 'Every routable Tuturuuu app available from this launcher.',
      core: 'Core entrypoints for the Tuturuuu workspace platform.',
      developer: 'Developer utilities, gateways, and technical tools.',
      learning: 'Learning apps for courses, practice, and teaching.',
      miscellaneous: 'Miscellaneous apps for docs, utilities, and shortcuts.',
      operations: 'Operations apps for money, inventory, and commerce.',
      productivity:
        'Productivity apps for schedule, tasks, messages, and meetings.',
    },
    app_descriptions: appDescriptions,
    app_names: appNames,
    apps: 'Apps',
    apps_count: '{count, plural, one {# app} other {# apps}}',
    apps_description: 'Open another Tuturuuu app from this workspace.',
    current: 'Current',
    current_workspace: 'Current workspace',
    default_destination: 'Default app home',
    favorite_add: 'Add {app} to favorites',
    favorite_remove: 'Remove {app} from favorites',
    favorites: 'Favorites',
    hint_close: 'Close',
    hint_favorite: 'Favorite',
    hint_navigate: 'Navigate',
    hint_open: 'Open',
    no_apps_found: 'No apps found',
    no_apps_found_description: 'Try a different app name or keyword.',
    navigate: 'navigate',
    no_results: 'No apps match “{query}”',
    open_apps_in: 'Open apps in',
    open_current_tab: 'This tab',
    open_here: 'Open here',
    open_in_new_tab: 'Open in new tab',
    open_new_tab: 'New tab',
    open_options: 'Open options',
    recent: 'Recent',
    results: 'Results',
    search_apps: 'Search apps',
    select: 'select',
    workspace_destination: '{workspace} workspace',
  },
};

export function renderAppsLauncherDialog({
  open = true,
  workspace = { id: 'personal-id', name: 'Personal Space', personal: true },
}: { open?: boolean; workspace?: LaunchableWorkspace } = {}) {
  const onOpenChange = vi.fn();

  function AppsLauncherHarness() {
    const [isOpen, setIsOpen] = useState(open);

    return (
      <AppsLauncherDialog
        currentWorkspace={workspace}
        onOpenChange={(nextOpen) => {
          onOpenChange(nextOpen);
          setIsOpen(nextOpen);
        }}
        open={isOpen}
      />
    );
  }

  const result = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AppsLauncherHarness />
    </NextIntlClientProvider>
  );

  return { onOpenChange, unmount: result.unmount };
}

export function clearAppsLauncherCookies() {
  for (const key of [
    APP_FAVORITES_PREFERENCE_KEY,
    APP_OPEN_MODE_PREFERENCE_KEY,
    APP_RECENT_PREFERENCE_KEY,
  ]) {
    document.cookie = `${key}=; Max-Age=0; path=/`;
  }
}

export function setupAppsLauncherTestEnvironment() {
  localStorageValues.clear();
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1024,
  });
  clearAppsLauncherCookies();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: localStorageMock,
  });
}

export function teardownAppsLauncherTestEnvironment() {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
}
