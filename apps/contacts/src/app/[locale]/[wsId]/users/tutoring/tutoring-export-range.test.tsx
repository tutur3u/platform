import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { STANDARD_TUTORING_POLICY } from '@tuturuuu/internal-api/tutoring-policy';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../../../messages/en.json';
import {
  buildTutoringSessionQuery,
  DEFAULT_SESSION_FILTERS,
  type TutoringDateRange,
} from './tutoring-filters';
import { DEFAULT_FORM } from './tutoring-types';

const { exportRun } = vi.hoisted(() => ({ exportRun: vi.fn() }));
vi.mock('./tutoring-export', () => ({ runTutoringExport: exportRun }));
vi.mock('@tuturuuu/internal-api', () => ({ updateTutoringSession: vi.fn() }));
vi.mock('@tuturuuu/internal-api/tutoring', () => ({
  deleteTutoringSession: vi.fn(),
}));
vi.mock('@tuturuuu/ui/custom/tables/data-table', () => ({
  DataTable: () => null,
}));
vi.mock('./tutoring-session-filters', () => ({
  TutoringSessionFiltersBar: () => null,
}));
vi.mock('./tutoring-create-card', () => ({ TutoringCreateCard: () => null }));
vi.mock('./tutoring-parent-message-dialog', () => ({
  TutoringParentMessageDialog: () => null,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { TutoringSessionsCard } from './tutoring-sessions-card';

const actions = {
  onCreate: vi.fn(),
  onCreateDialogOpenChange: vi.fn(),
  onCreateFormChange: vi.fn(),
  onFiltersChange: vi.fn(),
  onMark: vi.fn(),
  onParamsChange: vi.fn(),
  onResetFilters: vi.fn(),
};
const clients: QueryClient[] = [];
const labels = [
  messages['ws-tutoring'].export_detailed_csv,
  messages['ws-tutoring'].export_detailed_xlsx,
  messages['ws-tutoring'].export_payroll_csv,
  messages['ws-tutoring'].export_payroll_xlsx,
];
function mount(
  dateRange: TutoringDateRange,
  fromDate?: string,
  toDate?: string
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { gcTime: 0 },
    },
  });
  clients.push(client);
  const filters = {
    ...DEFAULT_SESSION_FILTERS,
    dateRange,
    fromDate,
    toDate,
    groupId: 'synthetic-group',
  };
  const query = buildTutoringSessionQuery(filters, '2030-01-15');
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
        <TutoringSessionsCard
          actions={actions}
          canManage={false}
          create={{ form: DEFAULT_FORM, isSubmitting: false, open: false }}
          exportQuery={query}
          error={null}
          filters={filters}
          groups={[]}
          isLoading={false}
          isRefreshing={false}
          isMarking={false}
          onRetry={vi.fn()}
          locale="en"
          pagination={{ count: 0, page: 1, pageSize: 20 }}
          policy={STANDARD_TUTORING_POLICY}
          sessions={[]}
          students={[]}
          wsId="synthetic-workspace"
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  fireEvent.keyDown(
    screen.getByRole('button', { name: messages.common.export }),
    { key: 'Enter' }
  );
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2030, 0, 15, 12));
  exportRun.mockResolvedValue(0);
});
afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('schedule export ranges', () => {
  it.each([
    ['today', '2030-01-15', '2030-01-15'],
    ['tomorrow', '2030-01-16', '2030-01-16'],
    ['week', '2030-01-15', '2030-01-21'],
    ['month', '2030-01-01', '2030-01-31'],
    ['lastMonth', '2029-12-01', '2029-12-31'],
  ] as const)(
    'enables every format for %s and exports its exact range',
    async (range, fromDate, toDate) => {
      mount(range);
      for (const name of labels)
        expect(
          await screen.findByRole('menuitem', { name })
        ).not.toHaveAttribute('data-disabled');
      fireEvent.click(screen.getByRole('menuitem', { name: labels[0] }));
      await waitFor(() =>
        expect(exportRun).toHaveBeenCalledExactlyOnceWith({
          format: 'detailed-csv',
          wsId: 'synthetic-workspace',
          query: expect.objectContaining({
            fromDate,
            toDate,
            groupId: 'synthetic-group',
          }),
        })
      );
      expect(actions.onFiltersChange).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['upcoming', '2030-01-15', '2030-02-14'],
    ['past', '2029-12-16', '2030-01-14'],
    ['all', '2030-01-15', '2030-02-14'],
  ] as const)(
    'offers an explicit custom-range action for %s',
    async (range, fromDate, toDate) => {
      mount(range);
      for (const name of labels)
        expect(await screen.findByRole('menuitem', { name })).toHaveAttribute(
          'data-disabled'
        );
      fireEvent.click(
        screen.getByRole('menuitem', { name: 'Choose date range' })
      );
      expect(actions.onFiltersChange).toHaveBeenCalledExactlyOnceWith({
        dateRange: 'custom',
        fromDate,
        toDate,
      });
      expect(exportRun).not.toHaveBeenCalled();
      expect(actions.onCreate).not.toHaveBeenCalled();
      expect(actions.onMark).not.toHaveBeenCalled();
    }
  );

  it('keeps an over-366-day custom range disabled without silently replacing it', async () => {
    mount('custom', '2029-01-01', '2030-01-15');
    for (const name of labels)
      expect(await screen.findByRole('menuitem', { name })).toHaveAttribute(
        'data-disabled'
      );
    expect(
      screen.queryByRole('menuitem', { name: 'Choose date range' })
    ).not.toBeInTheDocument();
    expect(exportRun).not.toHaveBeenCalled();
    expect(actions.onFiltersChange).not.toHaveBeenCalled();
  });
});
