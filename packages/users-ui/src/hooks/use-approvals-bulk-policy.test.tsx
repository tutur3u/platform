import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
import { useApprovals } from './use-approvals';

afterEach(() => vi.unstubAllGlobals());
it.each([undefined, false, true, 'true'])(
  'uses the server policy %j to expose report bulk approval',
  async (bulkApprovalEnabled) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [],
          totalCount: 0,
          totalPages: 0,
          bulkApprovalEnabled,
        }),
      })
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(
      () => useApprovals({ wsId: 'workspace-a', kind: 'reports' }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      }
    );
    expect(result.current.bulkApprovalEnabled).toBe(false);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bulkApprovalEnabled).toBe(
      bulkApprovalEnabled === true
    );
  }
);
it('keeps the daily post bulk action independent of the report setting', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], totalCount: 0, totalPages: 0 }),
    })
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { result } = renderHook(
    () => useApprovals({ wsId: 'workspace-b', kind: 'posts' }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.bulkApprovalEnabled).toBe(true);
});
