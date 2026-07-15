import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLogExportDialogContent } from './audit-log-export-dialog-content';

const {
  listWorkspaceUserAuditLogsMock,
  toastErrorMock,
  toastInfoMock,
  toastSuccessMock,
  xlsxJsonToSheetMock,
} = vi.hoisted(() => ({
  listWorkspaceUserAuditLogsMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastInfoMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  xlsxJsonToSheetMock: vi.fn(() => ({})),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

vi.mock('@tuturuuu/internal-api', () => ({
  listWorkspaceUserAuditLogs: (
    ...args: Parameters<typeof listWorkspaceUserAuditLogsMock>
  ) => listWorkspaceUserAuditLogsMock(...args),
}));

vi.mock('@tuturuuu/ui/dialog', () => ({
  DialogClose: ({ children }: { children: ReactNode }) => children,
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: toastErrorMock,
    info: toastInfoMock,
    success: toastSuccessMock,
  },
}));

vi.mock('@tuturuuu/ui/xlsx', () => ({
  XLSX: {
    utils: {
      json_to_sheet: xlsxJsonToSheetMock,
      book_append_sheet: vi.fn(),
      book_new: vi.fn(() => ({})),
    },
    write: vi.fn(() => new ArrayBuffer(8)),
  },
}));

function renderWithQueryClient(node: ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { mutations: { retry: false } },
        })
      }
    >
      {node}
    </QueryClientProvider>
  );
}

function renderExportDialog() {
  return renderWithQueryClient(
    <AuditLogExportDialogContent
      wsId="ws-1"
      locale="en"
      period="monthly"
      month="2026-03"
      eventKind="archived"
      source="all"
      affectedUserQuery=""
      actorQuery=""
    />
  );
}

describe('AuditLogExportDialogContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => 'blob:test'),
        revokeObjectURL: vi.fn(),
      })
    );
    HTMLAnchorElement.prototype.click = vi.fn();
    listWorkspaceUserAuditLogsMock.mockResolvedValue({
      data: [
        {
          auditRecordId: 10,
          eventKind: 'archived',
          summary: 'Archived Alice',
          changedFields: ['archived'],
          fieldChanges: [],
          before: { archived: 'false' },
          after: { archived: 'true' },
          affectedUser: {
            id: 'user-1',
            name: 'Alice',
            email: 'alice@example.com',
          },
          actor: {
            authUid: 'actor-1',
            workspaceUserId: 'workspace-actor-1',
            id: 'actor-1',
            name: 'Bob',
            email: 'bob@example.com',
          },
          occurredAt: '2026-03-10T10:00:00.000Z',
          source: 'live',
          archivalNote: 'Family requested a break',
        },
      ],
      count: 1,
    });
  });

  it('includes archival notes as a first-class export column', async () => {
    renderExportDialog();

    fireEvent.click(screen.getByRole('button', { name: 'common.export' }));

    await waitFor(() => {
      expect(xlsxJsonToSheetMock).toHaveBeenCalledWith([
        expect.objectContaining({
          archival_note: 'Family requested a break',
        }),
      ]);
    });
    expect(toastSuccessMock).toHaveBeenCalledWith('common.export-success');
  });

  it('does not create an empty workbook when no audit events exist', async () => {
    listWorkspaceUserAuditLogsMock.mockResolvedValue({ data: [], count: 0 });
    renderExportDialog();

    fireEvent.click(screen.getByRole('button', { name: 'common.export' }));

    await waitFor(() => {
      expect(toastInfoMock).toHaveBeenCalledWith('no_activity');
    });
    expect(xlsxJsonToSheetMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it('shows a translated error when the audit export request fails', async () => {
    listWorkspaceUserAuditLogsMock.mockRejectedValue(new Error('Unauthorized'));
    renderExportDialog();

    fireEvent.click(screen.getByRole('button', { name: 'common.export' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('common.export-error');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('common.export-error');
    expect(xlsxJsonToSheetMock).not.toHaveBeenCalled();
  });
});
