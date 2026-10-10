/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../messages/en.json';
import viMessages from '../../messages/vi.json';

let locale: 'en' | 'vi' = 'en';

type LatestApprovedLog = {
  title?: string;
  content?: string;
  feedback?: string;
} | null;

let latestApprovedLogState: LatestApprovedLog = null;
let selectedLogState: LatestApprovedLog = null;

const transport = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/workspace-1/users/reports/report-1',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const messages = locale === 'vi' ? viMessages : en;
    return key.startsWith('ws-reports.approval_')
      ? messages['ws-reports'][
          key.slice(
            'ws-reports.'.length
          ) as keyof (typeof messages)['ws-reports']
        ]
      : key;
  },
  useLocale: () => 'en',
  useFormatter: () => ({
    dateTime: (value: Date) => value.toISOString(),
  }),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

vi.mock('@tuturuuu/users-ui/hooks/use-config-map', () => ({
  useConfigMap: () => ({
    getConfig: () => null,
  }),
}));

vi.mock(
  '@/app/[locale]/[wsId]/users/reports/[reportId]/hooks/use-report-history',
  () => ({
    useReportHistory: () => ({
      logsQuery: { data: [] },
      selectedLog: selectedLogState,
      setSelectedLog: vi.fn(),
      formatRelativeTime: vi.fn(),
      latestApprovedLog: latestApprovedLogState,
      isLoadingRejectedBase: false,
    }),
  })
);

vi.mock(
  '@/app/[locale]/[wsId]/users/reports/[reportId]/hooks/use-report-export',
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
  '@/app/[locale]/[wsId]/users/reports/[reportId]/hooks/use-report-dynamic-text',
  () => ({
    useReportDynamicText: () => (text: string) => text,
  })
);

vi.mock('@tuturuuu/ui/custom/report-preview', () => ({
  default: () => <div data-testid="report-preview" />,
}));

vi.mock(
  '@/app/[locale]/[wsId]/users/reports/[reportId]/components/report-history',
  () => ({
    ReportHistory: () => null,
  })
);

vi.mock(
  '@/app/[locale]/[wsId]/users/reports/[reportId]/components/delete-report-dialog',
  () => ({
    DeleteReportDialog: () => null,
  })
);

vi.mock('@tuturuuu/users-ui/components/reject-dialog', () => ({
  RejectDialog: () => null,
}));

vi.mock('@tuturuuu/users-ui/components/score-display', () => ({
  default: () => null,
}));

vi.mock('@tuturuuu/users-ui/components/user-month-attendance', () => ({
  default: () => null,
}));
vi.mock(
  '@/app/[locale]/[wsId]/users/groups/[groupId]/reports/user-feedback-section',
  () => ({ default: () => null })
);

import EditableReportPreview from '@/app/[locale]/[wsId]/users/reports/[reportId]/editable-report-preview';

const savedReport = {
  id: 'report-1',
  user_id: 'student-1',
  group_id: 'group-1',
  title: 'Saved monthly report',
  content: 'Saved evidence',
  feedback: 'Saved teacher feedback',
  report_approval_status: 'PENDING' as const,
  scores: [],
};
let client: QueryClient;
function editor(report = savedReport, canUpdateReports = true) {
  return (
    <QueryClientProvider client={client}>
      <EditableReportPreview
        wsId="workspace-1"
        report={report}
        configs={[]}
        isNew={false}
        canUpdateReports={canUpdateReports}
        canApproveReports
      />
    </QueryClientProvider>
  );
}
async function editAndClose(value: string) {
  fireEvent.click(
    screen.getByRole('button', { name: 'ws-reports.edit_report' })
  );
  fireEvent.change(screen.getByLabelText('user-report-data-table.feedback'), {
    target: { value },
  });
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  );
}
function approvalRequests() {
  return transport.fetch.mock.calls.filter(([url]) =>
    String(url).endsWith('/users/approvals')
  );
}
function saveRequests() {
  return transport.fetch.mock.calls.filter(([url]) =>
    String(url).endsWith('/users/reports/report-1')
  );
}
describe('Monthly report approval represents saved current content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    locale = 'en';
    latestApprovedLogState = null;
    selectedLogState = null;
    client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    transport.fetch.mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', transport.fetch);
  });
  it.each(['en', 'vi'] as const)(
    'explains the unsaved approval block in %s',
    async (language) => {
      locale = language;
      render(editor());
      await editAndClose('Human teacher feedback');
      expect(screen.getByRole('status')).toHaveTextContent(
        (language === 'vi' ? viMessages : en)['ws-reports']
          .approval_save_changes
      );
      expect(
        screen.getByRole('button', { name: 'ws-reports.approve' })
      ).toBeDisabled();
    }
  );
  it('blocks approval after a human edits multiline feedback and closes the editor', async () => {
    render(editor());
    await editAndClose('Human observation\nHuman next step');
    fireEvent.click(screen.getByRole('button', { name: 'ws-reports.approve' }));
    expect(approvalRequests()).toHaveLength(0);
  });
  it('blocks approval of a historical preview rather than the current report', () => {
    selectedLogState = {
      title: 'Old title',
      content: 'Old text',
      feedback: 'Old feedback',
    };
    render(editor());
    fireEvent.click(screen.getByRole('button', { name: 'ws-reports.approve' }));
    expect(approvalRequests()).toHaveLength(0);
  });
  it('keeps a failed-save draft and blocks approving older persisted content', async () => {
    transport.fetch.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Save rejected' }), {
        status: 503,
      })
    );
    render(editor());
    fireEvent.click(
      screen.getByRole('button', { name: 'ws-reports.edit_report' })
    );
    const feedback = screen.getByLabelText('user-report-data-table.feedback');
    fireEvent.change(feedback, {
      target: { value: 'Human line one\nHuman line two' },
    });
    fireEvent.submit(
      screen
        .getByRole('button', { name: 'ws-reports.save_report' })
        .closest('form')!
    );
    await waitFor(() => expect(saveRequests()).toHaveLength(1));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'ws-reports.save_report' })
      ).not.toBeDisabled()
    );
    expect(JSON.parse(saveRequests()[0]![1].body).feedback).toBe(
      'Human line one\nHuman line two'
    );
    expect(feedback).toHaveValue('Human line one\nHuman line two');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: 'ws-reports.approve' }));
    expect(approvalRequests()).toHaveLength(0);
  });
  it('allows approval of unedited authoritative current content', async () => {
    render(editor());
    fireEvent.click(screen.getByRole('button', { name: 'ws-reports.approve' }));
    await waitFor(() => expect(approvalRequests()).toHaveLength(1));
  });
  it('blocks approving a local draft without update permission', async () => {
    render(editor(savedReport, false));
    await editAndClose('Local unsavable human draft');
    fireEvent.click(screen.getByRole('button', { name: 'ws-reports.approve' }));
    expect(approvalRequests()).toHaveLength(0);
  });
});

describe('Authoritative save refresh admission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    locale = 'en';
    selectedLogState = null;
    latestApprovedLogState = null;
    client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.stubGlobal('fetch', transport.fetch);
  });
  it('waits for the pending save and matching authoritative refresh, retaining intentional empty fields', async () => {
    let finish!: (value: Response) => void;
    transport.fetch.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        })
    );
    const view = render(editor());
    fireEvent.click(
      screen.getByRole('button', { name: 'ws-reports.edit_report' })
    );
    fireEvent.change(screen.getByLabelText('user-report-data-table.feedback'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('user-report-data-table.content'), {
      target: { value: 'Human evidence\nMore evidence' },
    });
    fireEvent.submit(
      screen
        .getByRole('button', { name: 'ws-reports.save_report' })
        .closest('form')!
    );
    await waitFor(() => expect(saveRequests()).toHaveLength(1));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(
      screen.getByRole('button', { name: 'ws-reports.approve' })
    ).toBeDisabled();
    await act(async () => {
      finish(new Response('{}', { status: 200 }));
    });
    expect(
      screen.getByRole('button', { name: 'ws-reports.approve' })
    ).toBeDisabled();
    view.rerender(
      editor({ ...savedReport, feedback: 'A different saved revision' })
    );
    expect(
      screen.getByRole('button', { name: 'ws-reports.approve' })
    ).toBeDisabled();
    view.rerender(
      editor({
        ...savedReport,
        feedback: '',
        content: 'Human evidence\nMore evidence',
      })
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'ws-reports.approve' })
      ).not.toBeDisabled()
    );
    transport.fetch.mockResolvedValue(new Response('{}', { status: 200 }));
    fireEvent.click(screen.getByRole('button', { name: 'ws-reports.approve' }));
    await waitFor(() => expect(approvalRequests()).toHaveLength(1));
  });
});
