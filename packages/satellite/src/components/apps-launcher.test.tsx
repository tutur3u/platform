import { fireEvent, screen, waitFor } from '@testing-library/react';
import { LAUNCHABLE_APPS } from '@tuturuuu/utils/launchable-apps';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  renderAppsLauncherDialog as renderDialog,
  setupAppsLauncherTestEnvironment,
  teardownAppsLauncherTestEnvironment,
} from './apps-launcher-test-utils';

beforeEach(setupAppsLauncherTestEnvironment);
afterEach(teardownAppsLauncherTestEnvironment);

describe('AppsLauncherDialog', () => {
  it('renders the shared launchable app catalog in a bounded dialog', () => {
    const { onOpenChange } = renderDialog();

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByText('Calendar')).toBeTruthy();
    expect(screen.getByText('Tasks')).toBeTruthy();
    expect(
      screen.queryByText(
        'Every routable Tuturuuu app available from this launcher.'
      )
    ).toBeNull();
    expect(screen.queryByText(/\d+ apps/)).toBeNull();

    const dialogContent = document.querySelector(
      '[data-slot="dialog-content"]'
    );
    expect(dialogContent?.className).not.toContain(
      'h-[min(760px,calc(100dvh-2rem))]'
    );
    expect(dialogContent?.className).not.toContain('max-h-[calc(100dvh-2rem)]');
    expect(dialogContent?.className).not.toContain('h-[calc(100dvh-2rem)]');
    expect(dialogContent?.className).not.toContain('sm:h-[calc(100dvh-3rem)]');
    expect(dialogContent?.className).not.toContain('max-h-[760px]');
    expect(dialogContent?.className).not.toContain('!top-4');
    expect(dialogContent?.className).not.toContain('!bottom-4');
    expect(dialogContent?.className).not.toContain('h-auto');
    expect(dialogContent?.className).not.toContain(
      'h-[var(--apps-launcher-height)]'
    );
    expect(dialogContent?.className).toContain('flex');
    expect(dialogContent?.className).toContain('flex-col');
    expect(dialogContent?.className).not.toContain('w-[calc(100vw-2rem)]');
    expect(dialogContent?.className).not.toContain('max-w-[1120px]');
    expect(dialogContent?.className).not.toContain('xl:max-w-[1240px]');
    expect(dialogContent?.className).toContain('max-w-none');
    expect(dialogContent?.className).toContain('sm:max-w-none');
    expect(dialogContent?.className).toContain('overflow-hidden');
    expect(dialogContent?.getAttribute('style')).not.toContain(
      '--apps-launcher-height'
    );
    expect(dialogContent?.getAttribute('style')).not.toContain(
      'grid-template-rows'
    );
    expect(dialogContent?.getAttribute('style')).toContain('height: 680px');
    expect(dialogContent?.getAttribute('style')).toContain(
      'max-height: calc(100dvh - 1rem)'
    );
    expect(dialogContent?.getAttribute('style')).toContain('max-width: 1320px');
    expect(dialogContent?.getAttribute('style')).toContain(
      'width: calc(100vw - 1rem)'
    );
    expect(
      document.querySelector('[data-slot="apps-launcher-mark"]')
    ).toBeTruthy();
    const launcherMark = document.querySelector(
      '[data-slot="apps-launcher-mark"]'
    );
    expect(launcherMark?.className).toContain('rounded-xl');
    expect(
      Array.from(launcherMark?.children ?? []).every((child) =>
        child.className.includes('rounded-[4px]')
      )
    ).toBe(true);
    expect(
      document.querySelector('[data-slot="apps-launcher-open-mode"]')
    ).toBeTruthy();
    expect(
      screen.getByRole('radiogroup', { name: 'Open options' })
    ).toBeTruthy();
    expect(
      screen.getByRole('radiogroup', { name: 'Open options' }).className
    ).toContain('gap-1');
    expect(screen.getByText('Open apps in')).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: 'Search apps' })).toBeTruthy();
    const closeButton = screen.getByRole('button', { name: 'Close' });
    expect(
      document
        .querySelector('[data-slot="dialog-header"]')
        ?.contains(closeButton)
    ).toBe(true);

    const launcherBody = document.querySelector(
      '[data-slot="apps-launcher-body"]'
    );
    expect(launcherBody?.className).toContain('min-h-0');
    expect(launcherBody?.className).toContain('w-full');
    expect(launcherBody?.className).toContain('flex-1');
    expect(launcherBody?.className).toContain('overflow-hidden');

    const launcherPanel = document.querySelector(
      '[data-slot="apps-launcher-panel"]'
    );
    expect(launcherPanel?.className).toContain('flex');
    expect(launcherPanel?.className).toContain('h-full');
    expect(launcherPanel?.className).toContain('min-h-0');
    expect(launcherPanel?.className).toContain('w-full');
    expect(launcherPanel?.className).toContain('flex-col');

    const scrollRegion = document.querySelector(
      '[data-slot="apps-launcher-scroll"]'
    );
    expect(scrollRegion?.className).toContain('min-h-0');
    expect(scrollRegion?.className).toContain('w-full');
    expect(scrollRegion?.className).toContain('flex-1');
    expect(scrollRegion?.className).toContain('overflow-y-auto');

    const launcherGrid = document.querySelector(
      '[data-slot="apps-launcher-grid"]'
    );
    expect(launcherGrid?.className).toContain('w-full');
    expect(launcherGrid?.className).toContain('grid-cols-1');
    expect(launcherGrid?.className).toContain('sm:grid-cols-2');
    expect(launcherGrid?.className).toContain('lg:grid-cols-3');
    expect(launcherGrid?.className).not.toContain('xl:grid-cols-4');

    fireEvent.click(closeButton);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('focuses app search when the dialog opens', async () => {
    renderDialog();

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('searchbox', { name: 'Search apps' })
      );
    });
  });

  it('groups apps by localized category sections', () => {
    renderDialog();

    const sections = document.querySelectorAll(
      '[data-slot="apps-launcher-section"]'
    );
    expect(sections).toHaveLength(5);
    expect(
      document.querySelector('[data-slot="apps-launcher-sections"]')
    ).toBeTruthy();
    expect(
      Array.from(sections).map(
        (section) => section.querySelector('h3')?.textContent
      )
    ).toEqual([
      'Productivity',
      'Operations',
      'Learning',
      'AI',
      'Miscellaneous',
    ]);
    expect(
      sections[0]?.querySelector('[data-slot="app-card-title"]')?.textContent
    ).toBe('Workspace Platform');
    expect(screen.queryByText('External')).toBeNull();
    expect(screen.queryByText('Playground')).toBeNull();

    const getSectionTitles = (label: string) => {
      const section = Array.from(sections).find(
        (item) => item.querySelector('h3')?.textContent === label
      );

      return Array.from(
        section?.querySelectorAll('[data-slot="app-card-title"]') ?? []
      ).map((item) => item.textContent);
    };

    expect(getSectionTitles('Productivity')[0]).toBe('Workspace Platform');
    expect(getSectionTitles('Operations')).toContain('CMS');
    expect(getSectionTitles('Operations')).not.toContain('Apps');
    expect(getSectionTitles('Operations')).toContain('Storefront');
    expect(getSectionTitles('Operations')).toContain('Pay');
    expect(getSectionTitles('AI')).toContain('Rewise');
    expect(getSectionTitles('Miscellaneous')).toEqual([
      'Apps',
      'Docs',
      'Tools',
      'Shortener',
    ]);
  });

  it('renders descriptive app cards with calmer category accents', () => {
    renderDialog();

    expect(screen.getByText('Finance')).toBeTruthy();
    expect(screen.queryByLabelText('Open options: Finance')).toBeNull();
    expect(screen.queryByLabelText('Open here: Finance')).toBeNull();
    expect(screen.queryByLabelText('Open in new tab: Finance')).toBeNull();
    const financeCard = screen.getByRole('link', { name: 'Finance' });
    expect(financeCard.getAttribute('data-slot')).toBe('app-card');
    expect(financeCard.tagName).toBe('A');
    expect(financeCard.getAttribute('href')).toBe(
      'http://localhost:7808/personal?source=sidebar-apps'
    );
    expect(financeCard.getAttribute('target')).toBe('_blank');
    expect(financeCard.getAttribute('rel')).toBe('noopener noreferrer');
    expect(financeCard?.className).toContain('flex');
    expect(financeCard?.className).toContain('flex-col');
    expect(financeCard?.className).toContain('items-center');
    expect(financeCard?.className).toContain('justify-center');
    expect(financeCard?.className).toContain('text-center');
    expect(financeCard?.className).toContain('min-h-36');
    expect(financeCard?.className).toContain('cursor-pointer');
    expect(financeCard?.className).toContain('hover:-translate-y-px');
    expect(financeCard?.className).toContain('focus-visible:ring-2');
    expect(financeCard?.className).toContain('motion-reduce:transition-none');
    expect(financeCard?.className).toContain('border-border/70');
    expect(financeCard?.className).toContain('bg-card/40');
    expect(financeCard?.className).not.toContain('border-dynamic-green/50');
    expect(financeCard?.className).not.toContain('grid-cols-');
    const financeIcon = financeCard.querySelector(
      '[data-slot="app-card-icon"]'
    );
    expect(financeIcon?.className).toContain('size-14');
    expect(financeIcon?.className).toContain('rounded-2xl');
    expect(financeIcon?.className).toContain('text-dynamic-green');
    expect(financeIcon?.querySelector('svg')?.getAttribute('class')).toContain(
      'size-7'
    );
    expect(
      financeCard.querySelector('[data-slot="app-card-title"]')?.className
    ).toContain('text-base');
    expect(
      financeCard.querySelector('[data-slot="app-card-description"]')
        ?.textContent
    ).toBe('Manage wallets, transactions, invoices, and budgets.');
    expect(
      financeCard.querySelector('[data-slot="app-card-description"]')?.className
    ).toContain('text-center');
    expect(
      document.querySelectorAll('[data-slot="app-card-description"]')
    ).toHaveLength(LAUNCHABLE_APPS.length);
    expect(
      financeCard.querySelector('[data-slot="app-card-affordance"]')
    ).toBeTruthy();
    expect(
      financeCard.querySelector('[data-slot="app-card-affordance"]')?.className
    ).toContain('absolute');
    const tasksCard = screen.getByRole('link', { name: 'Tasks' });
    expect(tasksCard.className).toContain('border-border/70');
    expect(
      screen
        .getByRole('link', { name: 'Learn' })
        .querySelector('[data-slot="app-card-icon"]')?.className
    ).toContain('text-dynamic-orange');
    expect(
      screen
        .getByRole('link', { name: 'Hive' })
        .querySelector('[data-slot="app-card-icon"]')?.className
    ).toContain('text-dynamic-cyan');
    expect(
      document.querySelector('[data-slot="app-card-affordance"]')
    ).toBeTruthy();
    expect(
      financeCard?.querySelector('[data-slot="app-card-actions"]')
    ).toBeNull();
    expect(document.querySelector('[data-slot="app-card-actions"]')).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Open here' })).toBeNull();
    expect(
      screen.queryByRole('menuitem', { name: 'Open in new tab' })
    ).toBeNull();
    expect(
      screen.queryByText('Also matches: Money, Wallets, Invoices')
    ).toBeNull();
    expect(screen.queryByText('finance.tuturuuu.com')).toBeNull();
    expect(screen.queryByText('Personal Space workspace')).toBeNull();
    expect(screen.queryByText('Default app home')).toBeNull();
    expect(
      document.querySelector('[data-slot="app-card-category"]')
    ).toBeNull();
    expect(
      document.querySelector('[data-slot="app-card-slot-text"]')
    ).toBeNull();
    expect(
      document.querySelector('[data-slot="app-card-destination"]')
    ).toBeNull();
    expect(document.querySelector('[data-slot="app-card-domain"]')).toBeNull();

    expect(screen.getByRole('link', { name: 'Finance' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Storefront' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Apps' })).toBeTruthy();
    expect(screen.getByText('Tools')).toBeTruthy();
    expect(screen.getByText('Calendar')).toBeTruthy();
    expect(screen.queryByLabelText('Open options: Apps')).toBeNull();
    expect(
      document.querySelector('[data-slot="apps-launcher-sections"]')
    ).toBeTruthy();
    expect(
      document.querySelectorAll('[data-slot="apps-launcher-grid"]')
    ).toHaveLength(5);
    expect(screen.getByText('Docs')).toBeTruthy();
    expect(screen.getByText('Tools')).toBeTruthy();
    expect(screen.getByText('Shortener')).toBeTruthy();
  });

  it('filters by app name, description, and aliases with a helpful empty state', () => {
    renderDialog();

    const search = screen.getByRole('searchbox', { name: 'Search apps' });
    fireEvent.change(search, { target: { value: 'Money' } });

    expect(screen.getByRole('link', { name: 'Finance' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Tasks' })).toBeNull();
    expect(
      document.querySelectorAll('[data-slot="apps-launcher-section"]')
    ).toHaveLength(1);

    fireEvent.change(search, { target: { value: 'budgets' } });
    expect(screen.getByRole('link', { name: 'Finance' })).toBeTruthy();

    fireEvent.change(search, { target: { value: 'not-a-tuturuuu-app' } });
    expect(screen.getByText('No apps found')).toBeTruthy();
    expect(
      screen.getByText('Try a different app name or keyword.')
    ).toBeTruthy();
    expect(
      document.querySelector('[data-slot="apps-launcher-empty"]')
    ).toBeTruthy();
  });

  it('renders new-tab links by default and closes on card click', () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    const { onOpenChange } = renderDialog();
    const financeCard = screen.getByRole('link', { name: 'Finance' });

    expect(financeCard.getAttribute('href')).toBe(
      'http://localhost:7808/personal?source=sidebar-apps'
    );
    expect(financeCard.getAttribute('target')).toBe('_blank');
    fireEvent.click(financeCard);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(open).not.toHaveBeenCalled();
  });
});
