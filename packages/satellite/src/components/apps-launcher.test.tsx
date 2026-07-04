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
    apps: 'Apps',
    apps_description: 'Open another Tuturuuu app from this workspace.',
    open_here: 'Open here',
    open_in_new_tab: 'Open in new tab',
    open_options: 'Open options',
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
    expect(screen.getByText('Calendar')).toBeTruthy();
    expect(screen.getByText('Tasks')).toBeTruthy();

    const dialogContent = document.querySelector(
      '[data-slot="dialog-content"]'
    );
    expect(dialogContent?.className).toContain(
      'h-[min(720px,calc(100dvh-2rem))]'
    );
    expect(dialogContent?.className).toContain('overflow-hidden');
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
