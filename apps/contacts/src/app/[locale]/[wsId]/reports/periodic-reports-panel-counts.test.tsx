import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import PeriodicReportsPanel from './periodic-reports-panel';

type QueryPage = {
  queryScope: string;
  data: { id: string }[];
  counts: typeof counts;
  categoryCounts: typeof categoryCounts;
  total: number;
};
type QueryState = {
  isLoading: boolean;
  isError: boolean;
  isPlaceholderData: boolean;
  isFetching?: boolean;
  data?: { pages: QueryPage[] };
};
type QueryOptions = {
  queryFn: (input: { pageParam: number }) => Promise<{ queryScope: string }>;
};
const state = vi.hoisted(() => ({
  query: {} as QueryState,
  options: {} as QueryOptions,
  filters: {} as Record<string, string>,
  debounced: '',
  actor: { assertActive: vi.fn() },
  summary: vi.fn(),
  worklist: vi.fn(),
  list: vi.fn(),
  setFilters: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({
  keepPreviousData: (data: unknown) => data,
  useInfiniteQuery: (options: QueryOptions) => {
    state.options = options;
    return state.query;
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({
    removeQueries: vi.fn(),
    invalidateQueries: vi.fn(),
  }),
}));
vi.mock('@tuturuuu/internal-api/reports', () => ({
  listPeriodicReports: state.list,
  MAX_PERIODIC_DELIVERY_BATCH_SIZE: 100,
  requestPeriodicReportDelivery: vi.fn(),
  requestPeriodicReportGeneration: vi.fn(),
  PERIODIC_REPORT_STAGES: [
    'draft',
    'pending',
    'approved',
    'blocked',
    'queued',
    'processing',
    'sent',
    'failed',
    'skipped',
    'rejected',
  ],
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => ({
  useWorkspaceActor: () => state.actor,
}));
vi.mock('@tuturuuu/ui/hooks/use-debounce', () => ({
  useDebounce: () => [state.debounced],
}));
vi.mock('nuqs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('nuqs')>()),
  useQueryStates: () => [state.filters, state.setFilters],
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('../users/reports/group-reports-selector', () => ({
  default: () => null,
}));
vi.mock('./periodic-email-readiness', () => ({
  PeriodicEmailReadiness: () => null,
}));
vi.mock('./periodic-report-row', () => ({
  PeriodicReportRow: () => <button type="button">Row action</button>,
}));
vi.mock('./periodic-recipient-remediation', () => ({
  PeriodicRecipientRemediation: () => null,
}));
vi.mock('./periodic-delivery-batch-dialog', () => ({
  PeriodicDeliveryBatchDialog: () => null,
}));
vi.mock('./periodic-delivery-confirmation', () => ({
  PeriodicDeliveryConfirmation: ({ canSend }: { canSend: boolean }) => (
    <button type="button" disabled={!canSend}>
      Confirm delivery
    </button>
  ),
}));
vi.mock('./periodic-report-preview-dialog', () => ({
  PeriodicReportPreviewDialog: () => null,
}));
vi.mock('./periodic-status-summary', () => ({
  PERIODIC_STAGES: [['pending', 'status_pending']],
  PeriodicStatusSummary: (props: Record<string, unknown>) => {
    state.summary(props);
    return props.toolbar as ReactNode;
  },
}));
vi.mock('./periodic-reports-toolbar', () => ({
  PeriodicReportsToolbar: () => null,
}));
vi.mock('./periodic-delivery-worklist', () => ({
  PeriodicDeliveryWorklist: (props: {
    onCategoryChange: (category: string) => void;
  }) => {
    state.worklist(props);
    return (
      <button
        type="button"
        onClick={() => props.onCategoryChange('infrastructure')}
      >
        Infrastructure
      </button>
    );
  },
}));

const permissions = {
  canApproveReports: false,
  canCheckUserAttendance: false,
  canCreateReports: false,
  canDeleteReports: false,
  canSendReports: true,
  canUpdateReports: false,
};
const counts = { total: 237, stages: { pending: 237 } };
const categoryCounts = { infrastructure: 237 };
function page(queryScope: string) {
  return {
    queryScope,
    data: [{ id: 'one' }],
    counts,
    categoryCounts,
    total: 237,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.debounced = '';
  state.filters = {
    stage: 'pending',
    cadence: 'monthly',
    query: '',
    approval: 'all',
    delivery: 'all',
    generation: 'all',
    sort: 'period',
    direction: 'desc',
    start: '',
    end: '',
  };
  state.query = { isLoading: false, isError: false, isPlaceholderData: false };
  state.list.mockResolvedValue({ data: [] });
});
async function ownedResult() {
  const result = await state.options.queryFn({ pageParam: 1 });
  state.query.data = { pages: [page(result.queryScope)] };
}
it('uses full server totals beyond the loaded page and passes category/cadence before pagination', async () => {
  const { rerender } = render(
    <PeriodicReportsPanel
      wsId="workspace"
      permissions={permissions}
      cadence="all"
    />
  );
  await ownedResult();
  rerender(
    <PeriodicReportsPanel
      wsId="workspace"
      permissions={permissions}
      cadence="all"
    />
  );
  expect(state.summary.mock.lastCall?.[0].counts).toEqual(counts);
  expect(state.worklist.mock.lastCall?.[0]).toMatchObject({
    total: 237,
    categoryCounts,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Infrastructure' }));
  await state.options.queryFn({ pageParam: 2 });
  expect(state.list.mock.lastCall?.[1]).toMatchObject({
    cadence: 'all',
    category: 'infrastructure',
    page: 2,
    pageSize: 100,
  });
});
it.each(['debounce', 'placeholder', 'error', 'workspace', 'actor'] as const)(
  'hides previous totals and row actions during %s changes',
  async (change) => {
    const { rerender } = render(
      <PeriodicReportsPanel wsId="workspace" permissions={permissions} />
    );
    await ownedResult();
    rerender(
      <PeriodicReportsPanel wsId="workspace" permissions={permissions} />
    );
    expect(state.summary.mock.lastCall?.[0].counts).toEqual(counts);
    expect(
      screen.getByRole('button', { name: 'Row action' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Confirm delivery' })
    ).not.toBeDisabled();
    if (change === 'debounce')
      state.filters = { ...state.filters, query: 'new search' };
    if (change === 'placeholder') state.query.isPlaceholderData = true;
    if (change === 'error') state.query.isError = true;
    if (change === 'actor') state.actor = { assertActive: vi.fn() };
    rerender(
      <PeriodicReportsPanel
        wsId={change === 'workspace' ? 'another-workspace' : 'workspace'}
        permissions={permissions}
      />
    );
    expect(state.summary.mock.lastCall?.[0].counts).toBeUndefined();
    expect(state.worklist.mock.lastCall?.[0].total).toBeUndefined();
    expect(state.worklist.mock.lastCall?.[0].categoryCounts).toBeUndefined();
    expect(
      screen.getByRole('button', { name: 'Confirm delivery' })
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Row action' })
    ).not.toBeInTheDocument();
  }
);

it('retains current rows and totals during same-scope background refresh', async () => {
  const { rerender } = render(
    <PeriodicReportsPanel wsId="workspace" permissions={permissions} />
  );
  await ownedResult();
  state.query.isFetching = true;
  rerender(<PeriodicReportsPanel wsId="workspace" permissions={permissions} />);
  expect(
    screen.getByRole('button', { name: 'Row action' })
  ).toBeInTheDocument();
  expect(state.summary.mock.lastCall?.[0].counts).toEqual(counts);
});
