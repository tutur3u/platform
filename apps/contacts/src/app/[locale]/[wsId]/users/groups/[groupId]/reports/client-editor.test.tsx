import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import GroupReportsClient from './client';

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  InternalApiError: class extends Error {},
  listWorkspaceGroupReportDashboard: mocks.load,
}));
vi.mock('nuqs', () => ({
  parseAsString: {},
  useQueryStates: () => {
    const [params, setParams] = useState({
      userId: 'student-a',
      reportId: 'report-a' as string | null,
    });
    return [
      params,
      (next: Partial<typeof params>) =>
        setParams((previous) => ({ ...previous, ...next })),
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
  useLocalStorage: (_: string, value: unknown) => useState(value),
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-config', () => ({
  useWorkspaceConfigs: () => ({ data: {}, isLoading: false, isError: false }),
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@tuturuuu/icons', () =>
  Object.fromEntries(
    [
      'AlertCircle',
      'Archive',
      'ChevronDown',
      'ChevronLeft',
      'ChevronRight',
      'Shield',
      'TriangleAlert',
      'Undo',
      'CheckCircle2',
      'Loader2',
      'Lock',
      'FileText',
      'Pencil',
      'Trash2',
      'Check',
      'ChevronUp',
      'X',
      'XIcon',
    ].map((name) => [name, () => null])
  )
);
vi.mock('./components/bulk-report-exporter', () => ({
  BulkReportExporter: () => null,
}));
vi.mock('../../../reports/components/report-status-indicator', () => ({
  ReportStatusIndicator: () => null,
}));
vi.mock('./components/report-workspace-toolbar', () => ({
  ReportWorkspaceToolbar: ({
    onUserChange,
  }: {
    onUserChange: (id: string) => void;
  }) => (
    <button type="button" onClick={() => onUserChange('student-b')}>
      Student B
    </button>
  ),
}));

// Mount the real EditableReportPreview, BasicInfoDialog and UserReportForm,
// including React Hook Form, useWatch, dirty tracking, validation and form.reset.
// Only unrelated history/export/attendance/print leaves and network writes are mocked.
vi.mock('../../../reports/[reportId]/hooks/use-report-history', () => ({
  useReportHistory: () => ({
    logsQuery: { data: [] },
    selectedLog: null,
    setSelectedLog: vi.fn(),
    formatRelativeTime: () => '',
  }),
}));
vi.mock('../../../reports/[reportId]/hooks/use-report-export', () => ({
  useReportExport: () => ({ isExporting: false }),
}));
vi.mock('../../../reports/[reportId]/hooks/use-report-mutations', () => ({
  useReportMutations: ({
    report,
  }: {
    report: { id: string; user_id: string };
  }) => {
    const idle = { isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() };
    return {
      createMutation: idle,
      deleteMutation: idle,
      updateScoresMutation: idle,
      approveMutation: idle,
      rejectMutation: idle,
      updateMutation: {
        isPending: false,
        mutate: (values: unknown) =>
          mocks.save(report.id, report.user_id, values),
      },
    };
  },
}));
vi.mock('@tuturuuu/ui/custom/report-preview', () => ({ default: () => null }));
vi.mock('@tuturuuu/users-ui/components/reject-dialog', () => ({
  RejectDialog: () => null,
}));
vi.mock('@tuturuuu/users-ui/components/score-display', () => ({
  default: () => null,
}));
vi.mock('@tuturuuu/users-ui/components/user-month-attendance', () => ({
  default: () => null,
}));
vi.mock('./user-feedback-section', () => ({ default: () => null }));
vi.mock('../../../reports/[reportId]/components/delete-report-dialog', () => ({
  DeleteReportDialog: () => null,
}));
vi.mock('../../../reports/[reportId]/components/report-history', () => ({
  ReportHistory: () => null,
}));
vi.mock('../../../reports/[reportId]/components/report-actions', () => ({
  ReportActions: () => null,
}));

const reportA = {
  id: 'report-a',
  user_id: 'student-a',
  group_id: 'group-a',
  title: 'Saved A',
  content: 'Saved content A',
  feedback: 'Saved feedback A',
};
const reportB = {
  id: 'report-b',
  user_id: 'student-b',
  group_id: 'group-a',
  title: 'Saved B',
  content: 'Saved content B',
  feedback: 'Saved feedback B',
};
function dashboard(report: typeof reportA, selected = true) {
  return {
    group: { id: 'group-a', name: 'Synthetic class' },
    users: [
      { id: 'student-a', full_name: 'Student A' },
      { id: 'student-b', full_name: 'Student B' },
    ],
    managers: [],
    userStatusSummary: [],
    userGroupMetrics: [],
    reports: [report],
    reportDetail: selected ? report : null,
    userSearchHasMore: false,
    userSearchTotal: 2,
  };
}
function deferred() {
  let resolve!: (value: ReturnType<typeof dashboard>) => void;
  const promise = new Promise<ReturnType<typeof dashboard>>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

describe('group report dashboard with the mounted editor', () => {
  it('retains a dirty real form on unchanged refresh and never carries that form into another student', async () => {
    const refresh = deferred();
    const nextStudent = deferred();
    let studentALoads = 0;
    mocks.load.mockImplementation(
      ({ userId, reportId }: { userId: string; reportId: string | null }) => {
        if (userId === 'student-a')
          return ++studentALoads === 1
            ? Promise.resolve(dashboard(reportA))
            : refresh.promise;
        return reportId === 'report-b'
          ? Promise.resolve(dashboard(reportB))
          : nextStudent.promise;
      }
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    render(
      <QueryClientProvider client={client}>
        <GroupReportsClient
          wsId="workspace-a"
          groupId="group-a"
          groupNameFallback="Synthetic class"
          canCreateReports
          canUpdateReports
          canDeleteReports={false}
          canApproveReports={false}
          canCheckUserAttendance={false}
        />
      </QueryClientProvider>
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'ws-reports.edit_report' })
    );
    const title = await screen.findByLabelText('user-report-data-table.title');
    const content = screen.getByLabelText('user-report-data-table.content');
    const feedback = screen.getByLabelText('user-report-data-table.feedback');
    fireEvent.change(title, { target: { value: 'Dirty A title' } });
    fireEvent.change(content, { target: { value: 'Dirty A content' } });
    fireEvent.change(feedback, { target: { value: 'Dirty A feedback' } });
    expect(screen.getByText('ws-reports.unsaved_changes')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ws-reports.save_report' })
    ).toBeEnabled();

    act(() => {
      void client.invalidateQueries();
    });
    await waitFor(() => expect(studentALoads).toBe(2));
    await act(async () => refresh.resolve(dashboard({ ...reportA })));
    expect(screen.getByLabelText('user-report-data-table.title')).toBe(title);
    expect(title).toHaveValue('Dirty A title');
    expect(content).toHaveValue('Dirty A content');
    expect(feedback).toHaveValue('Dirty A feedback');
    expect(
      screen.getByRole('button', { name: 'ws-reports.save_report' })
    ).toBeEnabled();

    // Close the real dialog before using the outside dashboard selector.
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
      code: 'Escape',
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /^Student B$/ }));
    await waitFor(() =>
      expect(mocks.load).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'student-b', reportId: null })
      )
    );
    expect(
      screen.queryByRole('button', { name: 'ws-reports.edit_report' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'ws-reports.save_report' })
    ).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
    await act(async () => nextStudent.resolve(dashboard(reportB, false)));
    fireEvent.click(
      await screen.findByRole('button', { name: 'ws-reports.edit_report' })
    );
    expect(
      await screen.findByLabelText('user-report-data-table.title')
    ).toHaveValue('Saved B');
    expect(screen.getByLabelText('user-report-data-table.content')).toHaveValue(
      'Saved content B'
    );
    expect(
      screen.getByLabelText('user-report-data-table.feedback')
    ).toHaveValue('Saved feedback B');
    expect(
      screen.getByRole('button', { name: 'ws-reports.save_report' })
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('user-report-data-table.content'), {
      target: { value: 'Edited B content' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'ws-reports.save_report' })
    );
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledExactlyOnceWith(
        'report-b',
        'student-b',
        expect.objectContaining({
          title: 'Saved B',
          content: 'Edited B content',
          feedback: 'Saved feedback B',
        })
      )
    );
  });
});
