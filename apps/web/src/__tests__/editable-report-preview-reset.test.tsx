/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type LatestApprovedLog = {
  title?: string;
  content?: string;
  feedback?: string;
} | null;

let latestApprovedLogState: LatestApprovedLog = null;

const mutationMocks = vi.hoisted(() => ({
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
  useFormatter: () => ({
    dateTime: (value: Date) => value.toISOString(),
  }),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

vi.mock('@/hooks/use-config-map', () => ({
  useConfigMap: () => ({
    getConfig: () => null,
  }),
}));

vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/users/reports/[reportId]/hooks/use-report-history',
  () => ({
    useReportHistory: () => ({
      logsQuery: { data: [] },
      selectedLog: null,
      setSelectedLog: vi.fn(),
      formatRelativeTime: vi.fn(),
      latestApprovedLog: latestApprovedLogState,
      isLoadingRejectedBase: false,
    }),
  })
);

vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/users/reports/[reportId]/hooks/use-report-mutations',
  () => ({
    useReportMutations: () => ({
      createMutation: { mutate: mutationMocks.createMutate, isPending: false },
      updateMutation: { mutate: mutationMocks.updateMutate, isPending: false },
      deleteMutation: { mutate: vi.fn(), isPending: false },
      updateScoresMutation: { mutateAsync: vi.fn(), isPending: false },
      approveMutation: { mutate: vi.fn(), isPending: false },
      rejectMutation: { mutate: vi.fn(), isPending: false },
    }),
  })
);

vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/users/reports/[reportId]/hooks/use-report-export',
  () => ({
    useReportExport: () => ({
      handlePdfExport: vi.fn(),
      handlePrintExport: vi.fn(),
      handlePngExport: vi.fn(),
      isExporting: false,
      defaultExportType: 'pdf',
      setDefaultExportType: vi.fn(),
      printAfterExport: false,
      setPrintAfterExport: vi.fn(),
    }),
  })
);

vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/users/reports/[reportId]/hooks/use-report-dynamic-text',
  () => ({
    useReportDynamicText: () => (text: string) => text,
  })
);

vi.mock('@tuturuuu/ui/custom/report-preview', () => ({
  default: () => <div data-testid="report-preview" />,
}));

vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/users/reports/[reportId]/components/report-history',
  () => ({
    ReportHistory: () => null,
  })
);

vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/users/reports/[reportId]/components/report-actions',
  () => ({
    ReportActions: () => null,
  })
);

vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/users/reports/[reportId]/components/delete-report-dialog',
  () => ({
    DeleteReportDialog: () => null,
  })
);

vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/approvals/components/reject-dialog',
  () => ({
    RejectDialog: () => null,
  })
);

vi.mock('@tuturuuu/users-ui/components/score-display', () => ({
  default: () => null,
}));

import EditableReportPreview from '@/app/[locale]/(dashboard)/[wsId]/users/reports/[reportId]/editable-report-preview';

function openBasicInfoDialog() {
  expect(
    screen.queryByLabelText('user-report-data-table.title')
  ).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'common.edit' }));
}

describe('EditableReportPreview form reset behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestApprovedLogState = {
      title: 'Approved title',
      content: 'Approved content',
      feedback: 'Approved feedback',
    };
  });

  it('does not overwrite typed title when approved snapshot object identity changes', () => {
    const report = {
      id: 'report-1',
      user_id: 'user-1',
      user_name: 'Test User',
      group_id: 'group-1',
      group_name: 'Test Group',
      creator_name: 'Manager',
      title: 'Current title',
      content: 'Current content',
      feedback: 'Current feedback',
      report_approval_status: 'REJECTED' as const,
      scores: [],
    };

    const { rerender } = render(
      <EditableReportPreview
        wsId="ws-1"
        report={report}
        configs={[]}
        isNew={false}
        canUpdateReports
      />
    );

    openBasicInfoDialog();

    const titleInput = screen.getByLabelText('user-report-data-table.title');

    expect(titleInput).not.toBeDisabled();

    fireEvent.change(titleInput, { target: { value: 'Typed by user' } });
    expect(titleInput).toHaveValue('Typed by user');

    latestApprovedLogState = {
      title: 'Approved title',
      content: 'Approved content',
      feedback: 'Approved feedback',
    };

    rerender(
      <EditableReportPreview
        wsId="ws-1"
        report={{ ...report }}
        configs={[]}
        isNew={false}
        canUpdateReports
      />
    );

    expect(screen.getByLabelText('user-report-data-table.title')).toHaveValue(
      'Typed by user'
    );
  });

  it('lets create-only members create a new report', async () => {
    render(
      <EditableReportPreview
        wsId="ws-1"
        report={{
          user_id: 'user-1',
          user_name: 'Test User',
          group_id: 'group-1',
          group_name: 'Test Group',
          creator_name: 'Manager',
          title: '',
          content: '',
          feedback: '',
          scores: [],
        }}
        configs={[]}
        isNew
        canCreateReports
      />
    );

    openBasicInfoDialog();

    const titleInput = screen.getByLabelText('user-report-data-table.title');
    const contentInput = screen.getByLabelText(
      'user-report-data-table.content'
    );
    const feedbackInput = screen.getByLabelText(
      'user-report-data-table.feedback'
    );

    expect(titleInput).not.toBeDisabled();
    expect(contentInput).not.toBeDisabled();
    expect(feedbackInput).not.toBeDisabled();

    fireEvent.change(titleInput, {
      target: { value: 'May report' },
    });
    fireEvent.change(contentInput, {
      target: { value: 'Progress notes' },
    });
    fireEvent.change(feedbackInput, {
      target: { value: 'Family feedback' },
    });

    const createButton = screen.getByRole('button', { name: 'common.create' });
    expect(createButton).not.toBeDisabled();

    fireEvent.submit(createButton.closest('form')!);

    await waitFor(() => {
      expect(mutationMocks.createMutate).toHaveBeenCalledWith({
        title: 'May report',
        content: 'Progress notes',
        feedback: 'Family feedback',
      });
    });
    expect(mutationMocks.updateMutate).not.toHaveBeenCalled();
  });

  it('keeps field keyboard input away from page-level shortcut handlers', () => {
    render(
      <EditableReportPreview
        wsId="ws-1"
        report={{
          user_id: 'user-1',
          user_name: 'Test User',
          group_id: 'group-1',
          group_name: 'Test Group',
          creator_name: 'Manager',
          title: '',
          content: '',
          feedback: '',
          scores: [],
        }}
        configs={[]}
        isNew
        canCreateReports
      />
    );

    openBasicInfoDialog();

    const pageShortcutHandler = vi.fn((event: KeyboardEvent) => {
      event.preventDefault();
    });
    document.addEventListener('keydown', pageShortcutHandler);

    const titleInput = screen.getByLabelText('user-report-data-table.title');
    const contentInput = screen.getByLabelText(
      'user-report-data-table.content'
    );
    const feedbackInput = screen.getByLabelText(
      'user-report-data-table.feedback'
    );

    fireEvent.keyDown(titleInput, { key: 'a' });
    fireEvent.keyDown(contentInput, { key: 'b' });
    fireEvent.keyDown(feedbackInput, { key: 'c' });

    document.removeEventListener('keydown', pageShortcutHandler);

    expect(pageShortcutHandler).not.toHaveBeenCalled();
  });

  it('keeps new report fields editable even when create submit is blocked', () => {
    render(
      <EditableReportPreview
        wsId="ws-1"
        report={{
          user_id: 'user-1',
          user_name: 'Test User',
          group_id: 'group-1',
          group_name: 'Test Group',
          creator_name: 'Manager',
          title: '',
          content: '',
          feedback: '',
          scores: [],
        }}
        configs={[]}
        isNew
      />
    );

    openBasicInfoDialog();

    const titleInput = screen.getByLabelText('user-report-data-table.title');
    const contentInput = screen.getByLabelText(
      'user-report-data-table.content'
    );
    const feedbackInput = screen.getByLabelText(
      'user-report-data-table.feedback'
    );

    expect(titleInput).not.toBeDisabled();
    expect(contentInput).not.toBeDisabled();
    expect(feedbackInput).not.toBeDisabled();

    fireEvent.change(titleInput, {
      target: { value: 'Draft report title' },
    });
    fireEvent.change(contentInput, {
      target: { value: 'Draft report content' },
    });
    fireEvent.change(feedbackInput, {
      target: { value: 'Draft report feedback' },
    });

    expect(screen.getByLabelText('user-report-data-table.title')).toHaveValue(
      'Draft report title'
    );
    expect(screen.getByLabelText('user-report-data-table.content')).toHaveValue(
      'Draft report content'
    );
    expect(
      screen.getByLabelText('user-report-data-table.feedback')
    ).toHaveValue('Draft report feedback');
    expect(
      screen.getByRole('button', { name: 'common.create' })
    ).toBeDisabled();
    expect(
      screen.getByText('ws-reports.create_permission_required')
    ).toBeInTheDocument();
  });

  it('keeps basic fields editable but blocks saving without update permission', () => {
    render(
      <EditableReportPreview
        wsId="ws-1"
        report={{
          id: 'report-1',
          user_id: 'user-1',
          user_name: 'Test User',
          group_id: 'group-1',
          group_name: 'Test Group',
          creator_name: 'Manager',
          title: 'Current title',
          content: 'Current content',
          feedback: '',
          report_approval_status: 'PENDING',
          scores: [],
        }}
        configs={[]}
        isNew={false}
      />
    );

    openBasicInfoDialog();

    const titleInput = screen.getByLabelText('user-report-data-table.title');
    const contentInput = screen.getByLabelText(
      'user-report-data-table.content'
    );
    const feedbackInput = screen.getByLabelText(
      'user-report-data-table.feedback'
    );

    expect(titleInput).not.toBeDisabled();
    expect(contentInput).not.toBeDisabled();
    expect(feedbackInput).not.toBeDisabled();

    fireEvent.change(titleInput, {
      target: { value: 'Local title draft' },
    });
    fireEvent.change(contentInput, {
      target: { value: 'Local content draft' },
    });
    fireEvent.change(feedbackInput, {
      target: { value: 'Local feedback draft' },
    });

    expect(screen.getByLabelText('user-report-data-table.title')).toHaveValue(
      'Local title draft'
    );
    expect(screen.getByLabelText('user-report-data-table.content')).toHaveValue(
      'Local content draft'
    );
    expect(
      screen.getByLabelText('user-report-data-table.feedback')
    ).toHaveValue('Local feedback draft');
    expect(screen.getByRole('button', { name: 'common.save' })).toBeDisabled();
    expect(
      screen.getByText('ws-reports.update_permission_required')
    ).toBeInTheDocument();
  });
});
