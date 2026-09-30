import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GroupReportsClient from './client';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  navigate: vi.fn(),
  initial: {
    userId: 'student-a' as string | null,
    reportId: 'report-a' as string | null,
  },
}));

vi.mock('@tuturuuu/internal-api', () => ({
  InternalApiError: class extends Error {},
  listWorkspaceGroupReportDashboard: mocks.load,
}));
vi.mock('nuqs', () => ({
  parseAsString: {},
  useQueryStates: () => {
    const [params, setParams] = useState(mocks.initial);
    return [
      params,
      (next: Partial<typeof params>) => {
        mocks.navigate(next);
        setParams((previous) => ({ ...previous, ...next }));
      },
    ];
  },
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
  useFormatter: () => ({ dateTime: () => 'date' }),
}));
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));
vi.mock('@tuturuuu/ui/hooks/use-debounce', () => ({
  useDebounce: (value: string) => [value],
}));
vi.mock('@tuturuuu/ui/hooks/use-local-storage', () => ({
  useLocalStorage: (_: string, value: unknown) => [value],
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-config', () => ({
  useWorkspaceConfigs: () => ({ data: {}, isLoading: false, isError: false }),
}));
vi.mock('@tuturuuu/ui/badge', () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));
vi.mock('@tuturuuu/ui/skeleton', () => ({
  Skeleton: () => <span data-testid="loading" />,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@tuturuuu/icons', () => ({ AlertCircle: () => null }));
vi.mock('./components/bulk-report-exporter', () => ({
  BulkReportExporter: () => null,
}));
vi.mock('../../../reports/components/report-status-indicator', () => ({
  ReportStatusIndicator: () => null,
}));
vi.mock('../../../reports/[reportId]/editable-report-preview', () => ({
  default: ({ report, isNew }: any) => (
    <div
      data-testid="editor"
      data-user={report.user_id}
      data-report={report.id ?? 'new'}
    >
      {isNew ? 'New draft' : report.title}
      <input aria-label="Synthetic draft" defaultValue="" />
    </div>
  ),
}));
vi.mock('./components/report-workspace-toolbar', () => ({
  ReportWorkspaceToolbar: (props: any) => (
    <div>
      <button type="button" onClick={() => props.onUserChange('student-b')}>
        Student B
      </button>
      <button type="button" onClick={() => props.onUserChange('student-a')}>
        Student A
      </button>
      <button
        type="button"
        onClick={() => props.onReportChange('report-a-old')}
      >
        Older report
      </button>
      <button type="button" onClick={() => props.onCreateReport()}>
        New report
      </button>
      <input
        aria-label="Search students"
        onChange={(event) => props.onUserSearchChange(event.target.value)}
      />
      <output data-testid="report-options">
        {props.reportOptions.map((r: any) => r.value).join(',')}
      </output>
      <output data-testid="selection">
        {props.userId}/{props.reportId}
      </output>
    </div>
  ),
}));

const reportA = {
  id: 'report-a',
  user_id: 'student-a',
  group_id: 'group-a',
  title: 'September A',
  created_at: '2026-09-30T17:00:00Z',
};
const reportB = {
  id: 'report-b',
  user_id: 'student-b',
  group_id: 'group-a',
  title: 'September B',
  created_at: '2026-10-01T00:00:00+07:00',
};
function dashboard(
  reports = [reportA],
  detail: typeof reportA | null = reports[0] ?? null
) {
  return {
    group: { id: 'group-a', name: 'Synthetic class' },
    users: [
      { id: 'student-a', full_name: 'Student A' },
      { id: 'student-b', full_name: 'Student B' },
    ],
    managers: [],
    userStatusSummary: [],
    userGroupMetrics: [],
    reports,
    reportDetail: detail,
  };
}
function deferred() {
  let resolve!: (value: ReturnType<typeof dashboard>) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ReturnType<typeof dashboard>>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function mount(
  overrides: Partial<Parameters<typeof GroupReportsClient>[0]> = {}
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const props = {
    wsId: 'workspace-a',
    groupId: 'group-a',
    groupNameFallback: 'Synthetic class',
    canCheckUserAttendance: false,
    canApproveReports: false,
    canCreateReports: true,
    canUpdateReports: true,
    canDeleteReports: false,
    ...overrides,
  };
  const view = render(
    <QueryClientProvider client={client}>
      <GroupReportsClient {...props} />
    </QueryClientProvider>
  );
  return {
    client,
    ...view,
    changeScope: (scope: Partial<typeof props>) =>
      view.rerender(
        <QueryClientProvider client={client}>
          <GroupReportsClient {...props} {...scope} />
        </QueryClientProvider>
      ),
  };
}

describe('group reports request transitions', () => {
  beforeEach(() => {
    mocks.load.mockReset();
    mocks.navigate.mockReset();
    mocks.initial = { userId: 'student-a', reportId: 'report-a' };
  });

  it('does not select or edit the previous student report while the next student loads', async () => {
    const next = deferred();
    mocks.load.mockImplementation(({ userId, reportId }: any) =>
      userId === 'student-a'
        ? Promise.resolve(dashboard())
        : reportId
          ? Promise.resolve(dashboard([reportB]))
          : next.promise
    );
    mount();
    await screen.findByText('September A');
    fireEvent.click(screen.getByText('Student B'));
    await waitFor(() =>
      expect(mocks.load).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'student-b', reportId: null })
      )
    );
    expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalledWith({ reportId: 'report-a' });
    await act(async () => next.resolve(dashboard([reportB], null)));
    expect(await screen.findByText('September B')).toHaveAttribute(
      'data-user',
      'student-b'
    );
    expect(screen.getByTestId('selection')).toHaveTextContent(
      'student-b/report-b'
    );
  });

  it('does not turn an empty previous student response into a new draft for a student with saved reports', async () => {
    const next = deferred();
    mocks.initial.reportId = 'new';
    mocks.load.mockImplementation(({ userId, reportId }: any) =>
      userId === 'student-a'
        ? Promise.resolve(dashboard([], null))
        : reportId
          ? Promise.resolve(dashboard([reportB]))
          : next.promise
    );
    mount();
    await screen.findByText('New draft');
    fireEvent.click(screen.getByText('Student B'));
    await waitFor(() =>
      expect(mocks.load).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'student-b', reportId: null })
      )
    );
    expect(mocks.navigate).not.toHaveBeenCalledWith({ reportId: 'new' });
    expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
    await act(async () => next.resolve(dashboard([reportB], null)));
    expect(await screen.findByText('September B')).toHaveAttribute(
      'data-report',
      'report-b'
    );
  });

  it('does not expose the current report under a different report selection', async () => {
    const next = deferred();
    const older = { ...reportA, id: 'report-a-old', title: 'August A' };
    mocks.load.mockImplementation(({ reportId }: any) =>
      reportId === 'report-a'
        ? Promise.resolve(dashboard([reportA, older]))
        : next.promise
    );
    mount();
    await screen.findByText('September A');
    fireEvent.click(screen.getByText('Older report'));
    await waitFor(() =>
      expect(mocks.load).toHaveBeenCalledWith(
        expect.objectContaining({ reportId: 'report-a-old' })
      )
    );
    expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
    await act(async () => next.resolve(dashboard([reportA, older], older)));
    expect(await screen.findByText('August A')).toHaveAttribute(
      'data-report',
      'report-a-old'
    );
  });

  it.each([{ wsId: 'workspace-b' }, { groupId: 'group-b' }])(
    'does not expose a previous scope editor during %j',
    async (scope) => {
      const next = deferred();
      mocks.load
        .mockResolvedValueOnce(dashboard())
        .mockReturnValue(next.promise);
      const view = mount();
      await screen.findByText('September A');
      view.changeScope(scope);
      await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
      expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
    }
  );

  it.each([true, false])(
    'recovers a genuinely empty student only after success (create=%s)',
    async (canCreateReports) => {
      const next = deferred();
      mocks.load
        .mockResolvedValueOnce(dashboard())
        .mockReturnValue(next.promise);
      mount({ canCreateReports });
      await screen.findByText('September A');
      fireEvent.click(screen.getByText('Student B'));
      await act(async () => next.resolve(dashboard([], null)));
      if (canCreateReports)
        expect(await screen.findByText('New draft')).toHaveAttribute(
          'data-user',
          'student-b'
        );
      else await screen.findByText('ws-reports.no_reports_found');
      expect(mocks.navigate).not.toHaveBeenCalledWith({ reportId: 'report-a' });
    }
  );

  it('keeps selection unchanged on failed loading and recovers saved reports after retry', async () => {
    const next = deferred();
    mocks.load.mockImplementation(({ userId, reportId }: any) =>
      userId === 'student-a'
        ? Promise.resolve(dashboard())
        : reportId
          ? Promise.resolve(dashboard([reportB]))
          : next.promise
    );
    const view = mount();
    await screen.findByText('September A');
    fireEvent.click(screen.getByText('Student B'));
    await act(async () => next.reject(new Error('Synthetic unavailable')));
    await screen.findByText('ws-reports.dashboard_error_title');
    expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
    expect(screen.getByTestId('selection')).toHaveTextContent('student-b/');
    mocks.load.mockImplementation(({ reportId }: any) =>
      Promise.resolve(dashboard([reportB], reportId ? reportB : null))
    );
    await act(async () => {
      await view.client.invalidateQueries();
    });
    expect(await screen.findByText('September B')).toHaveAttribute(
      'data-user',
      'student-b'
    );
  });

  it('retains an unsaved editor during search for the same workspace, class, student and report', async () => {
    const next = deferred();
    mocks.load.mockImplementation(({ userQuery }: any) =>
      userQuery ? next.promise : Promise.resolve(dashboard())
    );
    mount();
    await screen.findByText('September A');
    fireEvent.change(screen.getByLabelText('Synthetic draft'), {
      target: { value: 'Unsaved synthetic text' },
    });
    const editor = screen.getByTestId('editor');
    fireEvent.change(screen.getByLabelText('Search students'), {
      target: { value: 'Student' },
    });
    await waitFor(() =>
      expect(mocks.load).toHaveBeenCalledWith(
        expect.objectContaining({ userQuery: 'Student' })
      )
    );
    expect(screen.getByTestId('editor')).toBe(editor);
    expect(screen.getByLabelText('Synthetic draft')).toHaveValue(
      'Unsaved synthetic text'
    );
    await act(async () => next.resolve(dashboard()));
    expect(screen.getByTestId('editor')).toBe(editor);
  });

  it('retains same-subject data during background refresh without replacing the editor', async () => {
    const next = deferred();
    mocks.load.mockResolvedValueOnce(dashboard()).mockReturnValue(next.promise);
    const view = mount();
    await screen.findByText('September A');
    const editor = screen.getByTestId('editor');
    act(() => {
      void view.client.invalidateQueries();
    });
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('editor')).toBe(editor);
    await act(async () => next.resolve(dashboard()));
    expect(screen.getByTestId('editor')).toBe(editor);
  });

  it('ignores a late next-student response after returning to a cached student', async () => {
    const next = deferred();
    mocks.load.mockImplementation(({ userId, reportId }: any) =>
      userId === 'student-a'
        ? Promise.resolve(dashboard([reportA], reportId ? reportA : null))
        : next.promise
    );
    mount();
    await screen.findByText('September A');
    fireEvent.click(screen.getByText('Student B'));
    await waitFor(() =>
      expect(mocks.load).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'student-b' })
      )
    );
    fireEvent.click(screen.getByText('Student A'));
    await screen.findByText('September A');
    await act(async () => next.resolve(dashboard([reportB], null)));
    expect(screen.getByTestId('editor')).toHaveAttribute(
      'data-user',
      'student-a'
    );
    expect(screen.getByTestId('selection')).toHaveTextContent(
      'student-a/report-a'
    );
  });
});
