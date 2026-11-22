import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DRIVE_LINK_NOTICE_STORAGE_KEY,
  DRIVE_LINK_NOTICE_UNTIL,
  shouldShowDriveLinkNotice,
} from './drive-link-notice';
import { DriveShareDialog, splitLinkLifetime } from './drive-share-dialog';

const createLink = vi.hoisted(() => vi.fn());

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

vi.mock('@tuturuuu/internal-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/internal-api')>()),
  createWorkspaceStorageShareLink: createLink,
}));

const writeText = vi.fn();

function renderDialog() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DriveShareDialog
        file={{ id: '1', name: 'report.pdf' }}
        onOpenChange={vi.fn()}
        path="docs"
        wsId="ws-1"
      />
    </QueryClientProvider>
  );
}

describe('DriveShareDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it('copies a short-lived download link and shows the lifetime the server reports', async () => {
    createLink.mockResolvedValue({ url: 'https://r2.test/x', expiresIn: 600 });
    renderDialog();

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'share.copy_download_link' })
    );

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('https://r2.test/x')
    );
    expect(createLink).toHaveBeenCalledWith(
      'ws-1',
      'docs/report.pdf',
      undefined,
      expect.anything()
    );
    expect(
      screen.getByText('share.works_for_minutes:{"count":10}')
    ).toBeInTheDocument();
  });

  it('says the link is short-lived when the server reports no lifetime', async () => {
    createLink.mockResolvedValue({ url: 'https://r2.test/y', expiresIn: null });
    renderDialog();
    fireEvent.click(
      screen.getByRole('button', { name: 'share.copy_download_link' })
    );
    expect(await screen.findByText('share.works_short')).toBeInTheDocument();
  });

  it('remembers a dismissed storage-move notice in this browser', () => {
    const { unmount } = renderDialog();
    fireEvent.click(
      screen.getByRole('button', { name: 'share.dismiss_notice' })
    );
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DRIVE_LINK_NOTICE_STORAGE_KEY)).toBe(
      '1'
    );
    unmount();

    renderDialog();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});

describe('link notice and lifetime helpers', () => {
  it('shows the notice only before its end date and until dismissed', () => {
    expect(shouldShowDriveLinkNotice(DRIVE_LINK_NOTICE_UNTIL - 1, false)).toBe(
      true
    );
    expect(shouldShowDriveLinkNotice(DRIVE_LINK_NOTICE_UNTIL, false)).toBe(
      false
    );
    expect(shouldShowDriveLinkNotice(0, true)).toBe(false);
  });

  it('rounds the lifetime to minutes below an hour and hours above', () => {
    expect(splitLinkLifetime(30)).toEqual({ unit: 'minutes', count: 1 });
    expect(splitLinkLifetime(900)).toEqual({ unit: 'minutes', count: 15 });
    expect(splitLinkLifetime(7200)).toEqual({ unit: 'hours', count: 2 });
  });
});
