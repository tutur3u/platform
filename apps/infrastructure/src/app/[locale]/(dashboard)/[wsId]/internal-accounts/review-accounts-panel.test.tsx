import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReviewAccount } from '@tuturuuu/internal-api/infrastructure';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewAccountsPanel } from './review-accounts-panel';

const api = vi.hoisted(() => ({
  createReviewAccount: vi.fn(),
  listReviewAccounts: vi.fn(),
  publishReviewerToApple: vi.fn(),
  updateReviewAccount: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/infrastructure', () => api);
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@tuturuuu/ui/hooks/use-copy-to-clipboard', () => ({
  useCopyToClipboard: () => ({ copyToClipboard: vi.fn(), isCopied: false }),
}));

const active: ReviewAccount = {
  id: 'active-ios',
  email: 'app-review-ios@tutur3u.com',
  kind: 'review',
  createdAt: '2026-09-29T00:00:00Z',
  lastSignInAt: null,
  isDisabled: false,
  emailConfirmed: true,
};
const legacy: ReviewAccount = {
  ...active,
  id: 'legacy-ios',
  email: 'app-review-ios@tuturuuu.com',
  isDisabled: true,
};
const retired: ReviewAccount = {
  ...active,
  id: 'retired-qa',
  email: 'retired-qa@tutur3u.com',
  isDisabled: true,
};
const invited: ReviewAccount = {
  ...active,
  id: 'external',
  email: 'qa@example.com',
  kind: 'external',
  emailConfirmed: false,
};

function renderPanel(accounts: ReviewAccount[]) {
  api.listReviewAccounts.mockResolvedValue({ accounts });
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ReviewAccountsPanel />
    </QueryClientProvider>
  );
}

function card(email: string) {
  return within(screen.getByText(email).parentElement!.parentElement!);
}

beforeEach(() => vi.clearAllMocks());

describe('retired review account presentation', () => {
  it('hides disabled records while keeping active reviewers and pending invitations visible', async () => {
    renderPanel([
      active,
      legacy,
      retired,
      invited,
      {
        ...invited,
        id: 'disabled-external',
        email: 'old-qa@example.com',
        isDisabled: true,
      },
    ]);
    await screen.findByText(active.email);
    expect(screen.getByText(invited.email)).toBeVisible();
    expect(screen.queryByText(legacy.email)).not.toBeInTheDocument();
    expect(screen.queryByText(retired.email)).not.toBeInTheDocument();
    expect(screen.queryByText('old-qa@example.com')).not.toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'show_retired' })
    ).not.toBeChecked();
    expect(
      card(active.email).getByRole('button', { name: 'rotate' })
    ).toBeEnabled();
    expect(
      card(active.email).getByRole('button', { name: 'disable' })
    ).toBeEnabled();
  });

  it('reveals retired records with existing control restrictions and makes no mutation', async () => {
    renderPanel([active, legacy, retired]);
    await screen.findByText(active.email);
    fireEvent.click(screen.getByRole('switch', { name: 'show_retired' }));
    expect(screen.getByText(legacy.email)).toBeVisible();
    expect(card(legacy.email).getByText(/legacy_disabled/)).toBeVisible();
    expect(card(legacy.email).queryByRole('button')).not.toBeInTheDocument();
    expect(
      card(retired.email).getByRole('button', { name: 'enable' })
    ).toBeEnabled();
    expect(
      card(retired.email).getByRole('button', { name: 'rotate' })
    ).toBeEnabled();
    expect(screen.getByText(active.email)).toBeVisible();
    fireEvent.click(screen.getByRole('switch', { name: 'show_retired' }));
    expect(screen.queryByText(legacy.email)).not.toBeInTheDocument();
    expect(api.updateReviewAccount).not.toHaveBeenCalled();
    expect(api.createReviewAccount).not.toHaveBeenCalled();
    expect(api.publishReviewerToApple).not.toHaveBeenCalled();
  });

  it('distinguishes all-retired accounts from an account directory with no records', async () => {
    renderPanel([legacy]);
    await screen.findByText('empty_active');
    expect(screen.queryByText('empty')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'show_retired' }));
    expect(screen.getByText(legacy.email)).toBeVisible();
    expect(screen.queryByText('empty_active')).not.toBeInTheDocument();
  });

  it('keeps active legacy reviewers visible and resets the retired filter on remount', async () => {
    const activeLegacy = { ...legacy, isDisabled: false };
    const view = renderPanel([active, activeLegacy, retired]);
    await screen.findByText(activeLegacy.email);
    expect(
      card(activeLegacy.email).getByRole('button', { name: 'disable' })
    ).toBeEnabled();
    expect(
      card(activeLegacy.email).queryByRole('button', { name: 'rotate' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'show_retired' }));
    expect(screen.getByText(retired.email)).toBeVisible();
    view.unmount();
    renderPanel([active, activeLegacy, retired]);
    await screen.findByText(active.email);
    expect(screen.queryByText(retired.email)).not.toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'show_retired' })
    ).not.toBeChecked();
  });
});
