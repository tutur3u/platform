// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WelcomeNudge from './welcome-nudge';

const mocks = vi.hoisted(() => ({ updateProgress: vi.fn() }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...rest }: { children: unknown; href: string }) => (
    <a href={href} {...rest}>
      {children as never}
    </a>
  ),
}));
vi.mock('@tuturuuu/internal-api/onboarding', () => ({
  updateConnectedOnboardingProgress: mocks.updateProgress,
}));

function renderNudge() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <WelcomeNudge />
    </QueryClientProvider>
  );
}

describe('WelcomeNudge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateProgress.mockResolvedValue({});
  });

  it('links to the welcome flow', () => {
    renderNudge();
    expect(screen.getByRole('link', { name: 'nudge_cta' })).toHaveAttribute(
      'href',
      '/onboarding'
    );
  });

  it('records a skip and hides itself when dismissed', async () => {
    renderNudge();
    fireEvent.click(screen.getByRole('button', { name: 'nudge_dismiss' }));
    await waitFor(() =>
      expect(screen.queryByText('nudge_title')).not.toBeInTheDocument()
    );
    expect(mocks.updateProgress).toHaveBeenCalledWith({
      dismissed_at: expect.any(String),
    });
  });

  it('hides itself even when the skip could not be saved', async () => {
    mocks.updateProgress.mockRejectedValue(new Error('offline'));
    renderNudge();
    fireEvent.click(screen.getByRole('button', { name: 'nudge_dismiss' }));
    await waitFor(() =>
      expect(screen.queryByText('nudge_title')).not.toBeInTheDocument()
    );
  });
});
