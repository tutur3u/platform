/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import vi_ from '../../messages/vi.json';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/workspace-1/users/reports/new',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useReportMutations } from '@/app/[locale]/[wsId]/users/reports/[reportId]/hooks/use-report-mutations';
import { useSetReportMonth } from '@/app/[locale]/[wsId]/users/reports/[reportId]/hooks/use-set-report-month';
import { useNewReportMonth } from '@/app/[locale]/[wsId]/users/reports/[reportId]/report-month-field';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      new Response('{"success":true,"id":"report-1"}', { status: 200 })
    )
  );
});
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

it('saves the chosen report month as the period when a teacher creates a report', async () => {
  const { result } = renderHook(
    () =>
      useReportMutations({
        wsId: 'workspace-1',
        report: { user_id: 'student-1', group_id: 'group-1' },
        isNew: true,
        reportMonth: '2026-10',
      }),
    { wrapper }
  );
  await act(async () => {
    await result.current.createMutation.mutateAsync({
      title: 'Báo cáo 10/2026',
      content: 'Observation',
      feedback: 'Next step',
    });
  });
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(String(url)).toBe('/api/v1/workspaces/workspace-1/users/reports');
  expect(JSON.parse(init.body)).toMatchObject({
    cadence: 'monthly',
    period_start: '2026-10-01',
    period_end: '2026-10-31',
  });
});

it('edits only the report month on an existing report', async () => {
  const { result } = renderHook(() => useSetReportMonth('workspace-1'), {
    wrapper,
  });
  await act(async () => {
    await result.current.mutateAsync({
      reportId: 'report-1',
      month: '2026-09',
    });
  });
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(String(url)).toContain(
    '/api/v1/workspaces/workspace-1/users/reports/report-1'
  );
  expect(init.method).toBe('PUT');
  // Period only: no content field, so the review decision is kept.
  expect(JSON.parse(init.body)).toEqual({
    period_start: '2026-09-01',
    period_end: '2026-09-30',
  });
});

it('titles a new report written on 2 Nov for October and follows a month change', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-02T09:00:00Z'));
  try {
    const { result } = renderHook(() => useNewReportMonth(true, ' Báo cáo '));
    expect(result.current.month).toBe('2026-10');
    expect(result.current.defaultTitle).toBe('Báo cáo 10/2026');
    const form = { getValues: () => 'Báo cáo 10/2026', setValue: vi.fn() };
    act(() => result.current.change('2026-09', form));
    expect(form.setValue).toHaveBeenCalledWith('title', 'Báo cáo 09/2026', {
      shouldDirty: true,
    });
    expect(result.current.month).toBe('2026-09');
    // A title the teacher typed is kept.
    const edited = { getValues: () => 'Báo cáo riêng', setValue: vi.fn() };
    act(() => result.current.change('2026-08', edited));
    expect(edited.setValue).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

describe('report month strings', () => {
  const hub = [
    'month_label',
    'month_option',
    'all_months',
    'custom_range',
    'month_scope',
    'estimated_month',
    'estimated_month_hint',
    'set_month',
    'month_saved',
  ];
  const reports = [
    'report_month',
    'report_month_estimated',
    'save_report_month',
    'report_month_saved',
  ];
  it.each([
    ['en', en],
    ['vi', vi_],
  ])('has every month string in %s', (_locale, messages) => {
    const bundle = messages as unknown as Record<
      string,
      Record<string, string>
    >;
    for (const key of hub) expect(bundle['reports-hub']?.[key]).toBeTruthy();
    for (const key of reports) expect(bundle['ws-reports']?.[key]).toBeTruthy();
  });
  it('uses the requested Vietnamese wording', () => {
    expect(vi_['reports-hub'].month_option).toBe('Tháng {month}');
    expect(vi_['reports-hub'].estimated_month).toBe('tháng ước tính');
    expect(en['reports-hub'].month_option).toBe('Month {month}');
    expect(en['reports-hub'].estimated_month).toBe('estimated month');
  });
});
