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
      content: 'Content',
      core: 'Core',
      developer: 'Developer',
      learning: 'Learning',
      operations: 'Operations',
      productivity: 'Productivity',
    },
    app_category_descriptions: {
      ai: 'AI apps for assistants, simulations, and creative thinking.',
      all: 'Every routable Tuturuuu app available from this launcher.',
      content: 'Content apps for publishing, files, and delivery.',
      core: 'Core entrypoints for the Tuturuuu workspace platform.',
      developer: 'Developer utilities, gateways, and technical tools.',
      learning: 'Learning apps for courses, practice, and teaching.',
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
    expect(screen.getByText('Calendar')).toBeTruthy();
    expect(screen.getByText('Tasks')).toBeTruthy();
    expect(
      screen.getByText(
        'Every routable Tuturuuu app available from this launcher.'
      )
    ).toBeTruthy();

    const dialogContent = document.querySelector(
      '[data-slot="dialog-content"]'
    );
    expect(dialogContent?.className).toContain(
      'h-[min(760px,calc(100dvh-2rem))]'
    );
    expect(dialogContent?.className).toContain('max-h-[calc(100dvh-2rem)]');
    expect(dialogContent?.className).toContain('w-[calc(100vw-2rem)]');
    expect(dialogContent?.className).toContain('max-w-[860px]');
    expect(dialogContent?.className).toContain('grid-rows-');
    expect(dialogContent?.className).toContain('overflow-hidden');

    const tabsRoot = document.querySelector('[data-slot="tabs"]');
    expect(tabsRoot?.className).toContain('shrink-0');
    expect(tabsRoot?.className).toContain('overflow-hidden');

    const launcherBody = document.querySelector(
      '[data-slot="apps-launcher-body"]'
    );
    expect(launcherBody?.className).toContain('min-h-0');
    expect(launcherBody?.className).toContain('overflow-hidden');

    const scrollRegion = document.querySelector(
      '[data-slot="apps-launcher-scroll"]'
    );
    expect(scrollRegion?.className).toContain('h-full');
    expect(scrollRegion?.className).toContain('max-h-full');
    expect(scrollRegion?.className).toContain('min-h-0');
    expect(scrollRegion?.className).toContain('overflow-y-auto');
  });

  it('renders compact app cards and filters with tabs', async () => {
    renderDialog();

    expect(screen.getByText('Finance')).toBeTruthy();
    expect(screen.getByLabelText('Open here: Finance')).toBeTruthy();
    expect(screen.getByLabelText('Open in new tab: Finance')).toBeTruthy();
    expect(screen.queryByLabelText('Open options: Finance')).toBeNull();
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

    const developerTab = screen.getByRole('tab', { name: 'Developer' });
    fireEvent.pointerDown(developerTab, { button: 0, ctrlKey: false });
    fireEvent.mouseDown(developerTab, { button: 0, ctrlKey: false });
    fireEvent.click(developerTab);

    await waitFor(() =>
      expect(
        screen.getByText('Developer utilities, gateways, and technical tools.')
      ).toBeTruthy()
    );
    expect(screen.getByText('Tools')).toBeTruthy();
    expect(screen.queryByText('Calendar')).toBeNull();
    expect(screen.getByLabelText('Open here: Tools')).toBeTruthy();
    expect(screen.getByLabelText('Open in new tab: Tools')).toBeTruthy();
  });

  it('opens apps in a new tab from the primary icon action', () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    const { onOpenChange } = renderDialog();

    fireEvent.click(screen.getByLabelText('Open in new tab: Finance'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(open).toHaveBeenCalledWith(
      'http://localhost:7808/personal?source=sidebar-apps',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('opens apps in the current tab from the secondary icon action', () => {
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

    fireEvent.click(screen.getByLabelText('Open here: Tasks'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(assign).toHaveBeenCalledWith(
      'http://localhost:7809/personal/tasks?source=sidebar-apps'
    );
  });
});
