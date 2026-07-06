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
    expect(dialogContent?.className).toContain('flex-col');
    expect(dialogContent?.className).toContain('overflow-hidden');

    const tabsRoot = document.querySelector('[data-slot="tabs"]');
    expect(tabsRoot?.className).toContain('shrink-0');
    expect(tabsRoot?.className).toContain('overflow-hidden');

    const launcherBody = document.querySelector(
      '[data-slot="apps-launcher-body"]'
    );
    expect(launcherBody?.className).toContain('flex-1');
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

  it('shows categorized card slot text and filters with tabs', async () => {
    renderDialog();

    expect(
      screen.getByText('Also matches: Money, Wallets, Invoices')
    ).toBeTruthy();
    expect(screen.getByText('finance.tuturuuu.com')).toBeTruthy();
    expect(
      screen.getAllByText('Personal Space workspace').length
    ).toBeGreaterThan(0);

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
  });

  it('opens app cards in a new tab by default', () => {
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

  it('keeps the compact settings menu available for each app', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    renderDialog();

    fireEvent.pointerDown(screen.getByLabelText('Open options: Tasks'));
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Open in new tab' })
    );

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        'http://localhost:7809/personal/tasks?source=sidebar-apps',
        '_blank',
        'noopener,noreferrer'
      )
    );
  });
});
