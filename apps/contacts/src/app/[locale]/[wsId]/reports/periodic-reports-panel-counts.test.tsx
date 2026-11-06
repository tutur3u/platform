import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PeriodicReportsPanel from './periodic-reports-panel';

type QueryPage = {
  queryScope: string;
  summaryPartial?: boolean;
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
  held: vi.fn(),
  row: vi.fn(),
  resend: vi.fn(),
  list: vi.fn(),
  setFilters: vi.fn(),
  toolbar: vi.fn(),
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
vi.mock('@tuturuuu/utils/timezone', () => ({
  getBrowserTimezone: () => 'Asia/Ho_Chi_Minh',
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
  PeriodicReportRow: (props: Record<string, unknown>) => {
    state.row(props);
    return <button type="button">Row action</button>;
  },
}));
vi.mock('./periodic-resend-dialog', () => ({
  PeriodicResendDialog: (props: Record<string, unknown>) => {
    state.resend(props);
    return null;
  },
}));
vi.mock('./periodic-recipient-remediation', () => ({
  PeriodicRecipientRemediation: () => null,
}));
vi.mock('./periodic-held-reports', () => ({
  PeriodicHeldReports: (props: {
    heldCount?: number;
    canResolve: boolean;
    onReview: () => void;
  }) => {
    state.held(props);
    return (
      <button type="button" onClick={props.onReview}>
        Review held
      </button>
    );
  },
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
  PeriodicReportsToolbar: (props: Record<string, unknown>) => {
    state.toolbar(props);
    return null;
  },
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

it('sends the viewer timezone only with a month or a period range, including a cross-month one', async () => {
  state.filters = { ...state.filters, cadence: 'weekly' };
  render(<PeriodicReportsPanel wsId="workspace" permissions={permissions} />);
  await state.options.queryFn({ pageParam: 1 });
  expect(state.list.mock.lastCall?.[1].timezone).toBeUndefined();
  expect(state.list.mock.lastCall?.[1].month).toBeUndefined();

  state.filters = {
    ...state.filters,
    cadence: 'monthly',
    start: '2026-10-01',
    end: '2026-11-03',
  };
  render(<PeriodicReportsPanel wsId="workspace" permissions={permissions} />);
  await state.options.queryFn({ pageParam: 1 });
  expect(state.list.mock.lastCall?.[1]).toMatchObject({
    periodStart: '2026-10-01',
    periodEnd: '2026-11-03',
    timezone: 'Asia/Ho_Chi_Minh',
  });
  // The advanced range replaces the month; they are never sent together.
  expect(state.list.mock.lastCall?.[1].month).toBeUndefined();
});

describe('monthly worklist month', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['2026-11-02T09:00:00+07:00', '2026-10'],
    ['2026-11-11T09:00:00+07:00', '2026-11'],
  ])('on %s opens on report month %s by default', async (now, month) => {
    vi.setSystemTime(new Date(now));
    render(<PeriodicReportsPanel wsId="workspace" permissions={permissions} />);
    await state.options.queryFn({ pageParam: 1 });
    expect(state.list.mock.lastCall?.[1]).toMatchObject({
      cadence: 'monthly',
      month,
      timezone: 'Asia/Ho_Chi_Minh',
    });
    expect(state.list.mock.lastCall?.[1].periodStart).toBeUndefined();
  });

  it('reads the month from the URL and lists every month for All months', async () => {
    vi.setSystemTime(new Date('2026-11-02T09:00:00+07:00'));
    state.filters = { ...state.filters, month: '2026-09' };
    render(<PeriodicReportsPanel wsId="workspace" permissions={permissions} />);
    await state.options.queryFn({ pageParam: 1 });
    expect(state.list.mock.lastCall?.[1].month).toBe('2026-09');

    state.filters = { ...state.filters, month: 'all' };
    render(<PeriodicReportsPanel wsId="workspace" permissions={permissions} />);
    await state.options.queryFn({ pageParam: 1 });
    expect(state.list.mock.lastCall?.[1].month).toBeUndefined();
  });

  it('writes a picked month to the URL and clears any custom range', () => {
    vi.setSystemTime(new Date('2026-11-02T09:00:00+07:00'));
    render(<PeriodicReportsPanel wsId="workspace" permissions={permissions} />);
    const toolbar = state.toolbar.mock.lastCall?.[0];
    expect(toolbar).toMatchObject({ reportMonth: '2026-10' });
    toolbar.onMonthChange('2026-09');
    expect(state.setFilters).toHaveBeenLastCalledWith({
      month: '2026-09',
      start: '',
      end: '',
    });
  });

  it('shows the selected month counts on the status cards', async () => {
    vi.setSystemTime(new Date('2026-11-02T09:00:00+07:00'));
    const { rerender } = render(
      <PeriodicReportsPanel wsId="workspace" permissions={permissions} />
    );
    await ownedResult();
    rerender(
      <PeriodicReportsPanel wsId="workspace" permissions={permissions} />
    );
    // The counts come from the same month-scoped response as the list.
    expect(state.list.mock.lastCall?.[1].month).toBe('2026-10');
    expect(state.summary.mock.lastCall?.[0].counts).toEqual(counts);
  });
});

it('passes the partial-summary flag from the server to the status cards', async () => {
  const { rerender } = render(
    <PeriodicReportsPanel wsId="workspace" permissions={permissions} />
  );
  await ownedResult();
  rerender(<PeriodicReportsPanel wsId="workspace" permissions={permissions} />);
  expect(state.summary.mock.lastCall?.[0].partial).toBe(false);
  const firstPage = state.query.data?.pages[0];
  if (!firstPage) throw new Error('missing page');
  state.query.data = { pages: [{ ...firstPage, summaryPartial: true }] };
  rerender(<PeriodicReportsPanel wsId="workspace" permissions={permissions} />);
  expect(state.summary.mock.lastCall?.[0].partial).toBe(true);
});

it('keeps the held group visible from the default view and opens it on the approved stage', async () => {
  const heldPage = (queryScope: string) => ({
    ...page(queryScope),
    counts: { ...counts, held: 3 },
  });
  const { rerender } = render(
    <PeriodicReportsPanel
      wsId="workspace"
      permissions={permissions}
      canResolveHeld
    />
  );
  const result = await state.options.queryFn({ pageParam: 1 });
  state.query.data = {
    pages: [heldPage(result.queryScope) as unknown as QueryPage],
  };
  rerender(
    <PeriodicReportsPanel
      wsId="workspace"
      permissions={permissions}
      canResolveHeld
    />
  );
  expect(state.worklist.mock.lastCall?.[0]).toMatchObject({ heldCount: 3 });
  expect(state.held.mock.lastCall?.[0]).toMatchObject({
    heldCount: 3,
    canResolve: true,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review held' }));
  expect(state.setFilters).toHaveBeenCalledWith(
    expect.objectContaining({ stage: 'approved' })
  );
  await state.options.queryFn({ pageParam: 1 });
  expect(state.list.mock.lastCall?.[1]).toMatchObject({ category: 'held' });
});

it('never offers the held actions without the admin permission', async () => {
  render(<PeriodicReportsPanel wsId="workspace" permissions={permissions} />);
  expect(state.held.mock.lastCall?.[0]).toMatchObject({ canResolve: false });
});

it('offers per-row and bulk resend only to admins, for resendable rows', async () => {
  const failed = {
    id: 'failed-one',
    report_approval_status: 'APPROVED',
    generation_status: 'ready',
    delivery_status: 'failed',
    last_delivery_error: 'Email provider rejected the delivery.',
    user_email: 'learner@example.com',
  };
  const failedPage = (queryScope: string) =>
    ({ ...page(queryScope), data: [failed] }) as unknown as QueryPage;
  const show = async (canResolveHeld: boolean) => {
    state.row.mockClear();
    const view = render(
      <PeriodicReportsPanel
        wsId="workspace"
        permissions={permissions}
        canResolveHeld={canResolveHeld}
      />
    );
    const result = await state.options.queryFn({ pageParam: 1 });
    state.query.data = { pages: [failedPage(result.queryScope)] };
    view.rerender(
      <PeriodicReportsPanel
        wsId="workspace"
        permissions={permissions}
        canResolveHeld={canResolveHeld}
      />
    );
    return view;
  };

  const viewer = await show(false);
  expect(state.worklist.mock.lastCall?.[0]).toMatchObject({
    canResend: false,
    eligibleCount: 0,
  });
  expect(state.row.mock.lastCall?.[0].onResend).toBeUndefined();
  viewer.unmount();

  await show(true);
  expect(state.worklist.mock.lastCall?.[0]).toMatchObject({
    canResend: true,
    eligibleCount: 1,
    resendSelectedCount: 0,
  });
  const row = state.row.mock.lastCall?.[0] as { onResend: () => void };
  act(() => row.onResend());
  expect(state.resend.mock.lastCall?.[0]).toMatchObject({
    intent: { kind: 'selection', reportIds: ['failed-one'] },
  });
  const worklist = state.worklist.mock.lastCall?.[0] as {
    onResendScope: () => void;
  };
  act(() => worklist.onResendScope());
  expect(state.resend.mock.lastCall?.[0]).toMatchObject({
    intent: { kind: 'scope', cadence: 'monthly' },
  });
});
