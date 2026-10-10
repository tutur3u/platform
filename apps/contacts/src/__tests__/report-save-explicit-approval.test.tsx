/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/workspace-1/reports/report-1',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useReportMutations } from '@/app/[locale]/[wsId]/users/reports/[reportId]/hooks/use-report-mutations';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
});
function hook() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return renderHook(
    () =>
      useReportMutations({
        wsId: 'workspace-1',
        report: {
          id: 'report-1',
          user_id: 'student-1',
          group_id: 'group-1',
          report_approval_status: 'PENDING',
        },
        isNew: false,
        canApproveReports: true,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }
  );
}
it('does not turn an ordinary approver Save into an explicit approval request', async () => {
  const { result } = hook();
  await act(async () => {
    await result.current.updateMutation.mutateAsync({
      title: 'Teacher report',
      content: 'Observation',
      feedback: 'Human line one\nHuman line two',
    });
  });
  expect(fetchMock).toHaveBeenCalledOnce();
  const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
  expect(body.feedback).toBe('Human line one\nHuman line two');
  expect(body).not.toHaveProperty('report_approval_status');
  expect(body).not.toHaveProperty('approved_at');
});
it('retains explicit Approve as a distinct action', async () => {
  const { result } = hook();
  await act(async () => {
    await result.current.approveMutation.mutateAsync();
  });
  expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
    action: 'approve',
    kind: 'reports',
    itemId: 'report-1',
  });
});

it('does not mint approval when an approver updates calculated scores', async () => {
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve(
      new Response(
        JSON.stringify(
          url.includes('/dashboard?')
            ? {
                userGroupMetrics: [
                  {
                    id: 'metric-1',
                    value: 4,
                    factor: 1,
                    name: 'Score',
                    unit: 'points',
                  },
                  {
                    id: 'metric-2',
                    value: 6,
                    factor: 1,
                    name: 'Score',
                    unit: 'points',
                  },
                ],
              }
            : {}
        ),
        { status: 200 }
      )
    )
  );
  const { result } = hook();
  await act(async () => {
    await result.current.updateScoresMutation.mutateAsync({
      force: true,
    });
  });
  const update = fetchMock.mock.calls.find(([url]) =>
    String(url).endsWith('/users/reports/report-1')
  );
  expect(update).toBeDefined();
  const body = JSON.parse(update![1].body);
  expect(body.scores).toEqual([4, 6]);
  expect(body.score).toBe(6);
  expect(body).not.toHaveProperty('report_approval_status');
  expect(body).not.toHaveProperty('approved_at');
});
