import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InviteLinksSection from '@/app/[locale]/(dashboard)/[wsId]/(workspace-settings)/members/_components/invite-links-section';

// Mocks
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('InviteLinksSection', () => {
  const wsId = 'test-ws';

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  it('renders loading initially', () => {
    globalThis.fetch = vi.fn(
      () => new Promise(() => {})
    ) as unknown as typeof fetch;
    render(<InviteLinksSection wsId={wsId} canManageMembers={true} />, {
      wrapper: createWrapper(),
    });
    expect(screen.getByText('common.loading')).toBeTruthy();
  });

  it('renders links after fetch', async () => {
    const mockLinks = [
      {
        id: 'link-1',
        ws_id: wsId,
        code: 'CODE1',
        creator_id: 'user-1',
        max_uses: 10,
        expires_at: null,
        created_at: new Date().toISOString(),
        current_uses: 2,
        is_expired: false,
        is_full: false,
        type: 'MEMBER',
      },
    ];

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/invite-links')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockLinks,
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    }) as unknown as typeof fetch;

    render(<InviteLinksSection wsId={wsId} canManageMembers={true} />, {
      wrapper: createWrapper(),
    });

    expect(await screen.findByText(/CODE1/)).toBeTruthy();
    expect(await screen.findByText('2/10')).toBeTruthy(); // Uses count
  });

  it('renders empty state when no links', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => [],
      })
    ) as unknown as typeof fetch;

    render(<InviteLinksSection wsId={wsId} canManageMembers={true} />, {
      wrapper: createWrapper(),
    });

    expect(await screen.findByText('ws-invite-links.no-links')).toBeTruthy();
  });
});
