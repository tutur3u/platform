import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminTaskEmbeddings from '@/app/[locale]/(dashboard)/[wsId]/(workspace-settings)/settings/admin-task-embeddings';

// Mocks
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock Activity icon specifically to have a testable role or class
vi.mock('@tuturuuu/icons', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    Activity: (props: any) => <output {...props} />,
  };
});

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('AdminTaskEmbeddings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).fetch = vi.fn();
  });

  it('renders loading initially', () => {
    (global as any).fetch = vi.fn(() => new Promise(() => {}));
    render(<AdminTaskEmbeddings />, { wrapper: createWrapper() });
    expect(screen.getByRole('status')).toBeDefined();
  });

  it('renders stats after fetch', async () => {
    const mockStats = {
      total: 100,
      withEmbeddings: 60,
      withoutEmbeddings: 40,
      percentageComplete: 60.0,
    };

    (global as any).fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/stats')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockStats,
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(<AdminTaskEmbeddings />, { wrapper: createWrapper() });

    expect(await screen.findByText('100')).toBeTruthy();
    expect(await screen.findByText('60')).toBeTruthy();
    expect(await screen.findByText('40')).toBeTruthy();
    expect(await screen.findByText('60.0%')).toBeTruthy();
  });

  it('handles fetch error', async () => {
    (global as any).fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: false,
        json: async () => ({ message: 'API Error' }),
      })
    );

    render(<AdminTaskEmbeddings />, { wrapper: createWrapper() });

    expect(await screen.findByText('API Error')).toBeTruthy();
  });
});
