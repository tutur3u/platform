import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import UncrawledUrls from '@/app/[locale]/(dashboard)/[wsId]/crawlers/uncrawled-urls';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mocks
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/test-path',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('./[crawlerId]/crawl-button', () => ({
  default: () => <button>Crawl</button>,
}));

// Mock the Link component (if used internally by Pagination or others)
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('UncrawledUrls', () => {
  const wsId = 'test-ws';

  beforeEach(() => {
    vi.clearAllMocks();
    class MockEventSource {
      onmessage = null;
      close = vi.fn();
      constructor() {}
    }
    (global as any).EventSource = MockEventSource;
    (window as any).EventSource = MockEventSource;
    (global as any).fetch = vi.fn();
  });

  it('renders loading skeleton initially', () => {
    // Mock fetch to pending
    (global as any).fetch = vi.fn(() => new Promise(() => {}));

    // We don't need wrapper yet as we are testing the component BEFORE refactor
    // (which uses useEffect), but adding it doesn't hurt.
    // However, for the BEFORE state, I should NOT use the wrapper if I want to match exactly,
    // but I'll use it to be ready for AFTER.

    const { container } = render(<UncrawledUrls wsId={wsId} />, {
      wrapper: createWrapper(),
    });

    // Check for skeleton elements
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders list of urls after fetch', async () => {
    const mockDomains = { domains: ['example.com'] };
    const mockUrls = {
      urls: [
        {
          url: 'https://example.com/page1',
          origin_url: 'https://example.com',
          created_at: '2023-01-01',
          skipped: false,
          origin_id: '1',
        },
      ],
      pagination: { totalItems: 1, totalPages: 1, page: 1, pageSize: 20 },
    };
    const mockStatus = { crawledUrls: [] };

    global.fetch = vi.fn().mockImplementation((url: string | Request) => {
      const urlStr = typeof url === 'string' ? url : url.url;
      if (urlStr.includes('/domains'))
        return Promise.resolve({ ok: true, json: async () => mockDomains });
      if (urlStr.includes('/uncrawled'))
        return Promise.resolve({ ok: true, json: async () => mockUrls });
      if (urlStr.includes('/status'))
        return Promise.resolve({ ok: true, json: async () => mockStatus });
      return Promise.reject(new Error(`Unknown URL: ${urlStr}`));
    });

    render(<UncrawledUrls wsId={wsId} />, { wrapper: createWrapper() });

    expect(await screen.findByText('https://example.com/page1')).toBeTruthy();
    expect(await screen.findByText('example.com')).toBeTruthy();
  });
});
