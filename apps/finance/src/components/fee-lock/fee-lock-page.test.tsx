// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exportDialog: vi.fn((_props: unknown) => null),
  list: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/finance-fee-lock', () => ({
  listFeeLocks: mocks.list,
}));
vi.mock('./fee-lock-export-dialog', () => ({
  FeeLockExportDialog: mocks.exportDialog,
}));
vi.mock('@/hooks/use-workspace-user-groups', () => ({
  useWorkspaceUserGroups: () => ({ data: [] }),
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'vi',
  useTranslations:
    () => (key: string, values?: { count?: number; revision?: number }) =>
      values ? `${key}:${values.revision ?? values.count}` : key,
}));
vi.mock(
  '@tuturuuu/ui/finance/shared/charts/use-finance-confidential-visibility',
  () => ({
    FINANCE_HIDDEN_AMOUNT: '••••',
    useFinanceConfidentialVisibility: () => ({ isConfidential: false }),
  })
);

import { FeeLockPage } from './fee-lock-page';

const WS_ID = '00000000-0000-4000-8000-00000000f1c0';
const row = (status: 'none' | 'locked', name: string) => ({
  baseline_total: 1_200_000,
  classes: [{ group_id: 'g-1', group_name: 'Lớp A1' }],
  lock:
    status === 'none'
      ? null
      : { id: 'lock-1', revision: 2, status, total_amount: 1_100_000 },
  student_id: name,
  student_name: name,
});
const lastQuery = () => mocks.list.mock.lastCall?.[1];
const renderPage = (canExport?: boolean) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <FeeLockPage
        wsId={WS_ID}
        currency="VND"
        initialMonth="2026-12"
        canExport={canExport}
      />
    </QueryClientProvider>
  );

describe('FeeLockPage', () => {
  afterEach(() => {
    cleanup();
    mocks.exportDialog.mockClear();
  });

  it('refetches by page, month, search and retry', async () => {
    mocks.list.mockResolvedValue({
      count: 120,
      currency: 'VND',
      data: [row('locked', 'Học viên Một'), row('none', 'Học viên Hai')],
    });
    renderPage();
    await screen.findByText('status_locked:2');
    expect(screen.getByText('status_none')).toBeTruthy();
    expect(lastQuery()).toEqual({
      groupId: undefined,
      month: '2026-12',
      page: 1,
      pageSize: 50,
      q: undefined,
      status: undefined,
    });
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 2 }));

    mocks.list.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'next_month' }));
    await screen.findByRole('alert');
    expect(screen.getByText('01/2027')).toBeTruthy();

    mocks.list.mockResolvedValue({ count: 0, data: [] });
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await screen.findByText('no_students');
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: '  Một ' },
    });
    fireEvent.submit(screen.getByRole('searchbox'));
    await waitFor(() => expect(lastQuery()).toMatchObject({ q: 'Một' }));
    expect(lastQuery()).toMatchObject({ month: '2027-01', page: 1 });
  });

  it('mounts the export dialog only when canExport, on the page filters', async () => {
    mocks.list.mockResolvedValue({ count: 0, data: [] });
    renderPage();
    await screen.findByText('no_students');
    expect(mocks.exportDialog).not.toHaveBeenCalled();
    cleanup();

    renderPage(true);
    await screen.findByText('no_students');
    const props = mocks.exportDialog.mock.lastCall?.[0] as {
      labels: Record<string, string | ((count: number) => string)>;
    };
    expect(props).toMatchObject({
      groupId: undefined,
      month: '2026-12',
      wsId: WS_ID,
    });
    const { export_done, export_too_many, ...text } = props.labels;
    expect(typeof export_done === 'function' && export_done(3)).toBe(
      'export_done:3'
    );
    expect(typeof export_too_many === 'function' && export_too_many(2001)).toBe(
      'export_too_many:2001'
    );
    expect(text).toEqual({
      cancel: 'cancel',
      export: 'export',
      export_all: 'export_all',
      export_failed: 'export_failed',
      export_locked_only: 'export_locked_only',
      export_title: 'export_title',
    });
    fireEvent.click(screen.getByRole('button', { name: 'next_month' }));
    await waitFor(() =>
      expect(mocks.exportDialog.mock.lastCall?.[0]).toMatchObject({
        month: '2027-01',
      })
    );
  });
});
