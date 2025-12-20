import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import UncrawledUrlsCount from '@/app/[locale]/(dashboard)/[wsId]/crawlers/uncrawled-urls-count';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the Link component since it's used in the component
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('UncrawledUrlsCount', () => {
  const wsId = 'test-workspace-id';

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders loading skeleton initially', () => {
    // Mock fetch to never resolve immediately to test loading state
    (global as any).fetch = vi.fn(() => new Promise(() => {}));
    
    const { container } = render(<UncrawledUrlsCount wsId={wsId} />, { wrapper: createWrapper() });
    // Look for the skeleton class or structure
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders data correctly after fetch', async () => {
    // Mock successful fetch responses based on URL
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/uncrawled')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pagination: { totalItems: 42 } }),
        });
      }
      if (url.includes('/domains')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ domains: ['example.com', 'test.com'] }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(<UncrawledUrlsCount wsId={wsId} />, { wrapper: createWrapper() });

    expect(await screen.findByText('42')).toBeTruthy();
    expect(await screen.findByText('2')).toBeTruthy(); // domains count
    expect(await screen.findByText('Waiting to be crawled')).toBeTruthy();
    expect(await screen.findByText('Unique domains discovered')).toBeTruthy();
  });

  it('handles error state', async () => {
    // Mock fetch error
    (global.fetch as any).mockRejectedValue(new Error('Network error'));

    render(<UncrawledUrlsCount wsId={wsId} />, { wrapper: createWrapper() });

    expect(await screen.findByText('Network error')).toBeTruthy();
  });

  it('renders "All caught up!" when count is 0', async () => {
    (global as any).fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/uncrawled')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pagination: { totalItems: 0 } }),
        });
      }
      if (url.includes('/domains')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ domains: [] }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(<UncrawledUrlsCount wsId={wsId} />, { wrapper: createWrapper() });

    expect(await screen.findByText('0')).toBeTruthy();
    expect(await screen.findByText(/All caught up/i)).toBeTruthy();
  });
});
