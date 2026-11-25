import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { LAUNCHABLE_APPS } from '@tuturuuu/utils/launchable-apps';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_FAVORITES_PREFERENCE_KEY,
  APP_RECENT_PREFERENCE_KEY,
} from './apps-launcher-favorites';
import { APP_OPEN_MODE_PREFERENCE_KEY } from './apps-launcher-preference';
import {
  renderAppsLauncherDialog as renderDialog,
  setupAppsLauncherTestEnvironment,
  teardownAppsLauncherTestEnvironment,
} from './apps-launcher-test-utils';

const currentApp = vi.hoisted(() => ({
  slug: 'platform' as string | undefined,
}));

vi.mock('./apps-launcher-current', () => ({
  getCurrentLaunchableAppSlug: () => currentApp.slug,
}));

beforeEach(() => {
  currentApp.slug = 'platform';
  setupAppsLauncherTestEnvironment();
});
afterEach(teardownAppsLauncherTestEnvironment);

const productivityApps = LAUNCHABLE_APPS.filter(
  (app) => app.category === 'productivity'
);

function search() {
  return screen.getByRole('combobox', { name: 'Search apps' });
}

function option(id: string) {
  const element = document.getElementById(`apps-launcher-${id}`);
  expect(element).toBeTruthy();
  return element as HTMLElement;
}

function activeOptionId() {
  return search().getAttribute('aria-activedescendant');
}

function openFromFreshDialog(id: string) {
  cleanup();
  renderDialog();
  fireEvent.click(option(id));
}

function sectionHeadings() {
  return Array.from(
    document.querySelectorAll('[data-slot="apps-launcher-section-heading"]')
  ).map((heading) => heading.textContent);
}

describe('AppsLauncherDialog', () => {
  it('keeps a hovered app link prefetchable and the open app excluded', async () => {
    // Mirrors the shared Speculation Rules selector in @tuturuuu/start-bridge.
    const prefetchable = 'a[data-app-slug]:not([target]):not([data-current])';
    document.cookie = `${APP_OPEN_MODE_PREFERENCE_KEY}=current-tab; path=/`;
    currentApp.slug = 'tasks';
    renderDialog();

    const links = () =>
      Array.from(document.querySelectorAll<HTMLElement>('a[data-app-slug]'));
    await waitFor(() => {
      expect(links().every((link) => !link.hasAttribute('target'))).toBe(true);
    });

    const current = links().filter(
      (link) => link.getAttribute('data-app-slug') === 'tasks'
    );
    expect(current.length).toBeGreaterThan(0);
    for (const link of current) {
      expect(link.hasAttribute('data-current')).toBe(true);
      expect(link.matches(prefetchable)).toBe(false);
    }

    const hovered = links().find(
      (link) =>
        link.getAttribute('data-app-slug') !== 'tasks' &&
        !link.hasAttribute('data-active')
    ) as HTMLElement;
    fireEvent.pointerMove(hovered);
    expect(hovered.hasAttribute('data-active')).toBe(true);
    expect(hovered.matches(prefetchable)).toBe(true);
  });

  it('opens with Cmd/Ctrl+Shift+K without accepting extra modifiers', async () => {
    const { onOpenChange } = renderDialog({ open: false });

    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(document, {
      altKey: true,
      key: 'k',
      metaKey: true,
      shiftKey: true,
    });
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'K', metaKey: true, shiftKey: true });
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.keyDown(document, { ctrlKey: true, key: 'k', shiftKey: true });
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('renders a content-sized command palette with footer key hints', () => {
    renderDialog();

    const content = document.querySelector('[data-slot="dialog-content"]');
    expect(content?.className).toContain('w-[min(640px,calc(100%-1rem))]');
    expect(content?.className).toContain('rounded-(--radius-popover)');
    expect(content?.className).toContain('bg-popover');
    expect(content?.className).not.toMatch(/(^|\s)(sm:)?h-\[/);
    expect(content?.className).not.toMatch(/d?vh/);
    expect(content?.getAttribute('style') ?? '').not.toContain('height');

    const body = document.querySelector('[data-slot="apps-launcher-body"]');
    expect(body?.className).toContain('max-h-[440px]');
    expect(body?.className).toContain('overflow-y-auto');

    expect(screen.getByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.getByRole('listbox', { name: 'Apps' })).toBeTruthy();
    expect(search().getAttribute('aria-controls')).toBe(
      'apps-launcher-results'
    );
    expect(
      document.querySelector('[data-slot="apps-launcher-esc"]')?.textContent
    ).toBe('Esc');

    const hints = document.querySelector(
      '[data-slot="apps-launcher-keyboard-hints"]'
    );
    for (const label of ['Navigate', 'Open', 'Favorite', 'Close']) {
      expect(hints?.textContent).toContain(label);
    }
    expect(sectionHeadings()).toEqual([
      'Productivity',
      'Operations',
      'Learning',
      'AI',
      'Miscellaneous',
    ]);
    expect(document.querySelectorAll('[data-slot="app-option"]')).toHaveLength(
      LAUNCHABLE_APPS.length
    );
  });

  it('marks the current app and starts on the next app for Enter', async () => {
    renderDialog();

    await waitFor(() => expect(document.activeElement).toBe(search()));
    const platformRow = option('category-productivity-platform');
    expect(platformRow.textContent).toContain('Current');
    expect(
      document.querySelectorAll('[data-slot="app-option-current"]')
    ).toHaveLength(1);

    const nextApp = productivityApps[1];
    expect(activeOptionId()).toBe(
      `apps-launcher-category-productivity-${nextApp?.slug}`
    );
    expect(
      option(`category-productivity-${nextApp?.slug}`).getAttribute(
        'aria-selected'
      )
    ).toBe('true');
    expect(
      option(`category-productivity-${nextApp?.slug}`).className
    ).toContain('bg-accent');
  });

  it('moves through one flat list with arrows, opens with Enter and closes with Esc', async () => {
    const { onOpenChange } = renderDialog();
    const input = search();

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(activeOptionId()).toBe(
      'apps-launcher-category-productivity-platform'
    );
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(activeOptionId()).toBe(
      'apps-launcher-category-productivity-platform'
    );
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(activeOptionId()).toBe(
      `apps-launcher-category-productivity-${productivityApps[2]?.slug}`
    );
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(document.cookie).toContain(
      `${APP_RECENT_PREFERENCE_KEY}=${productivityApps[2]?.slug}`
    );

    cleanup();
    const reopened = renderDialog();
    fireEvent.keyDown(search(), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(reopened.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('lists recent apps as chips with the most recently opened first', () => {
    openFromFreshDialog('category-productivity-tasks');
    openFromFreshDialog('category-operations-finance');
    openFromFreshDialog('category-productivity-tasks');
    cleanup();

    renderDialog();
    expect(sectionHeadings()[0]).toBe('Recent');
    const chips = Array.from(
      document.querySelectorAll('[data-slot="app-chip"]')
    ).map((chip) => chip.getAttribute('data-app-slug'));
    expect(chips).toEqual(['tasks', 'finance']);
    expect(activeOptionId()).toBe('apps-launcher-recent-tasks');

    fireEvent.keyDown(search(), { key: 'ArrowDown' });
    expect(activeOptionId()).toBe('apps-launcher-recent-finance');
    fireEvent.keyDown(search(), { key: 'ArrowDown' });
    expect(activeOptionId()).toBe(
      'apps-launcher-category-productivity-platform'
    );
  });

  it('keeps at most five recent apps', () => {
    for (const app of LAUNCHABLE_APPS.slice(0, 7)) {
      openFromFreshDialog(`category-${app.category}-${app.slug}`);
    }
    cleanup();

    renderDialog();
    expect(document.querySelectorAll('[data-slot="app-chip"]')).toHaveLength(5);
    expect(
      document
        .querySelector('[data-slot="app-chip"]')
        ?.getAttribute('data-app-slug')
    ).toBe(LAUNCHABLE_APPS[6]?.slug);
  });

  it('toggles favorites with the star and persists them', () => {
    renderDialog();
    const star = screen.getByRole('button', { name: 'Add Tasks to favorites' });
    expect(star.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(star);
    expect(sectionHeadings()[0]).toBe('Favorites');
    expect(option('favorites-tasks')).toBeTruthy();
    expect(
      screen
        .getAllByRole('button', { name: 'Remove Tasks from favorites' })
        .every((button) => button.getAttribute('aria-pressed') === 'true')
    ).toBe(true);
    expect(document.cookie).toContain(`${APP_FAVORITES_PREFERENCE_KEY}=tasks`);
    cleanup();

    renderDialog();
    expect(option('favorites-tasks')).toBeTruthy();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Remove Tasks from favorites' })[0]!
    );
    expect(document.getElementById('apps-launcher-favorites-tasks')).toBeNull();
    expect(sectionHeadings()).not.toContain('Favorites');
  });

  it('toggles the active app favorite with Cmd+S and Ctrl+S', () => {
    renderDialog();
    const input = search();
    const activeSlug = productivityApps[1]?.slug;

    const saveEvent = fireEvent.keyDown(input, { key: 's', metaKey: true });
    expect(saveEvent).toBe(false);
    expect(option(`favorites-${activeSlug}`)).toBeTruthy();
    expect(activeOptionId()).toBe(
      `apps-launcher-category-productivity-${activeSlug}`
    );

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(activeOptionId()).toBe(`apps-launcher-favorites-${activeSlug}`);

    fireEvent.keyDown(input, { ctrlKey: true, key: 's' });
    expect(
      document.getElementById(`apps-launcher-favorites-${activeSlug}`)
    ).toBeNull();
    expect(activeOptionId()).toBe(
      `apps-launcher-category-productivity-${activeSlug}`
    );
  });

  it('ranks matches in one list and highlights the matched text', () => {
    renderDialog();
    const input = search();

    fireEvent.change(input, { target: { value: 'Money' } });
    expect(sectionHeadings()).toEqual(['Results']);
    expect(
      Array.from(document.querySelectorAll('[data-slot="app-option"]')).map(
        (row) => row.getAttribute('data-app-slug')
      )
    ).toEqual(['finance']);

    fireEvent.change(input, { target: { value: 'budgets' } });
    expect(option('results-finance')).toBeTruthy();

    fireEvent.change(input, { target: { value: 'tas' } });
    const first = document.querySelector('[data-slot="app-option"]');
    expect(first?.getAttribute('data-app-slug')).toBe('tasks');
    expect(activeOptionId()).toBe('apps-launcher-results-tasks');
    expect(
      first?.querySelector('[data-slot="app-option-match"]')?.textContent
    ).toBe('Tas');

    fireEvent.change(input, { target: { value: 'not-a-tuturuuu-app' } });
    expect(screen.getByText('No apps match “not-a-tuturuuu-app”')).toBeTruthy();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('renders this-tab links by default and closes on click', () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    const { onOpenChange } = renderDialog();
    const financeRow = option('category-operations-finance');

    expect(financeRow.tagName).toBe('A');
    expect(financeRow.getAttribute('role')).toBe('option');
    expect(financeRow.getAttribute('href')).toBe(
      'http://localhost:7808/personal?source=sidebar-apps'
    );
    expect(financeRow.hasAttribute('target')).toBe(false);
    expect(financeRow.hasAttribute('rel')).toBe(false);
    fireEvent.click(financeRow);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('keeps new-tab links for a user who chose new tabs', async () => {
    document.cookie = `${APP_OPEN_MODE_PREFERENCE_KEY}=new-tab; path=/`;
    renderDialog();

    await waitFor(() => {
      expect(option('category-operations-finance').getAttribute('target')).toBe(
        '_blank'
      );
    });
    expect(option('category-operations-finance').getAttribute('rel')).toBe(
      'noopener noreferrer'
    );
  });
});
