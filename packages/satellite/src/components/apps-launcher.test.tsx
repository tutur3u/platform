import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppsLauncherDialog } from './apps-launcher';

const originalLocation = window.location;

const messages = {
  command_launcher: {
    aliases_slot: 'Also matches: {aliases}',
    apps: 'Apps',
    apps_description: 'Open another Tuturuuu app from this workspace.',
    apps_count: '{count, plural, one {# app} other {# apps}}',
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
    current_workspace: 'Current workspace',
    default_destination: 'Default app home',
    open_here: 'Open here',
    open_in_new_tab: 'Open in new tab',
    open_options: 'Open options',
    workspace_destination: '{workspace} workspace',
  },
};

function renderDialog() {
  const onOpenChange = vi.fn();

  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AppsLauncherDialog
        currentWorkspace={{
          id: 'personal-id',
          name: 'Personal Space',
          personal: true,
        }}
        onOpenChange={onOpenChange}
        open
      />
    </NextIntlClientProvider>
  );

  return { onOpenChange };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: originalLocation,
  });
});

describe('AppsLauncherDialog', () => {
  it('renders the shared launchable app catalog in a bounded dialog', () => {
    renderDialog();

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'All' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Productivity' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Operations' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Core' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Content' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Developer' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Miscellaneous' })).toBeTruthy();
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
    expect(dialogContent?.getAttribute('style')).toContain('height: 760px');
    expect(dialogContent?.getAttribute('style')).toContain(
      'max-height: calc(100vh - 2rem)'
    );
    expect(dialogContent?.getAttribute('style')).toContain('max-width: 1440px');
    expect(dialogContent?.getAttribute('style')).toContain(
      'width: calc(100vw - 2rem)'
    );

    const tabsRoot = document.querySelector('[data-slot="tabs"]');
    expect(tabsRoot?.className).toContain('w-full');
    expect(tabsRoot?.className).toContain('shrink-0');
    expect(tabsRoot?.className).toContain('overflow-hidden');

    const tabsList = document.querySelector('[data-slot="tabs-list"]');
    expect(tabsList?.className).toContain('w-full');
    expect(tabsList?.className).toContain('max-w-full');
    expect(tabsList?.className).toContain('overflow-x-auto');

    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.className).toContain('flex-1');
      expect(tab.className).toContain('min-w-max');
    }

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
    expect(launcherGrid?.className).toContain('xl:grid-cols-4');
  });

  it('groups the All tab by app category sections', () => {
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
    ).toBe('Platform');
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

    expect(getSectionTitles('Productivity')[0]).toBe('Platform');
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

  it('renders compact app cards and filters with tabs', async () => {
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
    expect(financeCard?.className).toContain('cursor-pointer');
    expect(financeCard?.className).toContain('hover:-translate-y-0.5');
    expect(financeCard?.className).toContain('focus-visible:ring-2');
    expect(financeCard?.className).toContain('motion-reduce:transition-none');
    expect(financeCard?.className).toContain('border-dynamic-green/30');
    expect(financeCard?.className).toContain('bg-dynamic-green/10');
    expect(financeCard?.className).not.toContain('grid-cols-');
    const financeIcon = financeCard.querySelector(
      '[data-slot="app-card-icon"]'
    );
    expect(financeIcon?.className).toContain('text-dynamic-green');
    expect(
      financeCard.querySelector('[data-slot="app-card-affordance"]')
    ).toBeNull();
    const tasksCard = screen.getByRole('link', { name: 'Tasks' });
    expect(tasksCard.className).toContain('border-dynamic-blue/30');
    expect(
      document.querySelector('[data-slot="app-card-affordance"]')
    ).toBeNull();
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

    const operationsTab = screen.getByRole('tab', { name: 'Operations' });
    fireEvent.pointerDown(operationsTab, { button: 0, ctrlKey: false });
    fireEvent.mouseDown(operationsTab, { button: 0, ctrlKey: false });
    fireEvent.click(operationsTab);

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Finance' })).toBeTruthy()
    );
    expect(screen.getByRole('link', { name: 'Finance' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Storefront' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Apps' })).toBeNull();
    expect(screen.queryByText('Tools')).toBeNull();
    expect(screen.queryByText('Calendar')).toBeNull();
    expect(screen.queryByLabelText('Open options: Apps')).toBeNull();
    expect(
      document.querySelector('[data-slot="apps-launcher-sections"]')
    ).toBeNull();
    expect(
      document.querySelectorAll('[data-slot="apps-launcher-grid"]')
    ).toHaveLength(1);

    const miscellaneousTab = screen.getByRole('tab', {
      name: 'Miscellaneous',
    });
    fireEvent.pointerDown(miscellaneousTab, { button: 0, ctrlKey: false });
    fireEvent.mouseDown(miscellaneousTab, { button: 0, ctrlKey: false });
    fireEvent.click(miscellaneousTab);

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Apps' })).toBeTruthy()
    );
    expect(screen.getByText('Docs')).toBeTruthy();
    expect(screen.getByText('Tools')).toBeTruthy();
    expect(screen.getByText('Shortener')).toBeTruthy();
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

  it('opens apps in the current tab when Ctrl or Cmd clicking a card', () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        assign,
        hostname: 'localhost',
        origin: 'http://localhost:3000',
      },
    });
    const { onOpenChange } = renderDialog();

    fireEvent.click(screen.getByRole('link', { name: 'Tasks' }), {
      ctrlKey: true,
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(assign).toHaveBeenCalledWith(
      'http://localhost:7809/personal/tasks?source=sidebar-apps'
    );

    assign.mockClear();
    fireEvent.click(screen.getByRole('link', { name: 'Finance' }), {
      metaKey: true,
    });
    expect(assign).toHaveBeenCalledWith(
      'http://localhost:7808/personal?source=sidebar-apps'
    );
  });
});
