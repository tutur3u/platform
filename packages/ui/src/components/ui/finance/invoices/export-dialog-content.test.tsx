import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExportDialogContent from './export-dialog-content';

const mocks = vi.hoisted(() => ({
  listPending: vi.fn(),
  listCreated: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  retry: vi.fn(),
  sheet: vi.fn(),
  csv: vi.fn(),
  click: vi.fn(),
  config: { data: 'false', isLoading: false, isError: false },
}));
vi.mock('@tuturuuu/internal-api/finance', () => ({
  listPendingFinanceInvoices: mocks.listPending,
  listFinanceInvoices: mocks.listCreated,
}));
vi.mock('../../../../hooks/use-workspace-config', () => ({
  useWorkspaceConfig: () => ({ ...mocks.config, refetch: mocks.retry }),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: mocks.success, error: mocks.error },
}));
vi.mock('react-papaparse', () => ({ jsonToCSV: mocks.csv }));
vi.mock('../../../../xlsx', () => ({
  XLSX: {
    utils: {
      json_to_sheet: mocks.sheet,
      book_new: vi.fn(),
      book_append_sheet: vi.fn(),
    },
    write: () => new Uint8Array([1]),
  },
}));
vi.mock('@tuturuuu/ui/dialog', () => {
  const Wrapper = ({ children }: PropsWithChildren) => <div>{children}</div>;
  return {
    DialogClose: Wrapper,
    DialogDescription: Wrapper,
    DialogFooter: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper,
  };
});
vi.mock('@tuturuuu/ui/select', () => ({
  Select: ({
    onValueChange,
    disabled,
  }: {
    onValueChange: (value: string) => void;
    disabled?: boolean;
  }) => (
    <select
      aria-label="Format"
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
    >
      <option value="excel">Excel</option>
      <option value="csv">CSV</option>
    </select>
  ),
  SelectContent: () => null,
  SelectItem: () => null,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

const pendingRows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    user_id: `student-${i}`,
    user_name: `Student ${i}`,
    group_id: `class-${i % 3}`,
    group_name: `Class ${i % 3}`,
    months_owed: ['2026-08', '2026-09'],
    attendance_days: 0,
    total_sessions: 8,
    potential_total: 800,
  }));
const props = {
  wsId: 'ws',
  exportType: 'invoices',
  invoiceType: 'pending' as const,
  searchParams: { q: 'Class', userIds: ['student-filter'] },
};
const exportButton = () =>
  screen.getByRole('button', { name: 'common.export' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config = { data: 'false', isLoading: false, isError: false };
  mocks.listPending.mockResolvedValue({ count: 1, data: pendingRows(1) });
  mocks.listCreated.mockResolvedValue({
    count: 1,
    data: [
      {
        id: 'invoice',
        ws_id: 'ws',
        created_at: '2026-09-01',
        customer: { full_name: 'Student' },
        wallet: { name: 'Cash' },
      },
    ],
  });
  mocks.csv.mockReturnValue('csv');
  URL.createObjectURL = vi.fn(() => 'blob:test');
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
    mocks.click
  );
});

describe('invoice export download boundary', () => {
  it.each(['excel', 'csv'])(
    'downloads every class across multiple pages as %s with filters preserved',
    async (format) => {
      const rows = pendingRows(1001);
      mocks.listPending.mockImplementation(async (_ws, query) => ({
        count: rows.length,
        data: rows.slice(
          (Number(query.page) - 1) * 1000,
          Number(query.page) * 1000
        ),
      }));
      render(<ExportDialogContent {...props} />);
      fireEvent.change(screen.getByLabelText('Format'), {
        target: { value: format },
      });
      fireEvent.click(exportButton());
      await waitFor(() => expect(mocks.success).toHaveBeenCalled());
      const exported = (format === 'excel' ? mocks.sheet : mocks.csv).mock
        .calls[0]?.[0];
      expect(exported).toHaveLength(1001);
      expect(
        new Set(exported.map((row: { group_id: string }) => row.group_id)).size
      ).toBe(3);
      expect(exported[0].months_owed).toBe('2026-08, 2026-09');
      expect(mocks.listPending).toHaveBeenLastCalledWith(
        'ws',
        expect.objectContaining({
          page: '2',
          pageSize: '1000',
          q: 'Class',
          userIds: ['student-filter'],
          groupByUser: false,
        })
      );
      expect(mocks.click).toHaveBeenCalledTimes(1);
    }
  );

  it('preserves grouped class names and one row per student', async () => {
    mocks.config.data = 'true';
    mocks.listPending.mockResolvedValue({
      count: 1,
      data: [
        {
          ...pendingRows(1)[0],
          group_ids: ['a', 'b'],
          group_names: ['Class A', 'Class B'],
        },
      ],
    });
    render(<ExportDialogContent {...props} />);
    fireEvent.click(exportButton());
    await waitFor(() => expect(mocks.sheet).toHaveBeenCalled());
    expect(mocks.sheet.mock.calls[0]?.[0][0]).toMatchObject({
      group_id: 'a,b',
      group_name: 'Class A, Class B',
    });
    expect(mocks.listPending).toHaveBeenCalledWith(
      'ws',
      expect.objectContaining({ groupByUser: true })
    );
  });

  it.each([
    { name: 'short data', payload: { count: 2, data: pendingRows(1) } },
    {
      name: 'duplicate debt',
      payload: { count: 2, data: [...pendingRows(1), ...pendingRows(1)] },
    },
    { name: 'missing rows', payload: { count: 0 } },
    { name: 'missing count', payload: { data: [] } },
  ])('prevents both download and success for $name', async ({ payload }) => {
    mocks.listPending.mockResolvedValue(payload);
    render(<ExportDialogContent {...props} />);
    fireEvent.click(exportButton());
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'ws-invoices.export_incomplete'
      )
    );
    expect(mocks.click).not.toHaveBeenCalled();
    expect(mocks.sheet).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(exportButton()).toBeEnabled();
  });

  it('allows a clean retry after a later-page failure without retaining prior rows', async () => {
    mocks.listPending
      .mockResolvedValueOnce({ count: 1001, data: pendingRows(1000) })
      .mockRejectedValueOnce(new Error('Timeout'));
    render(<ExportDialogContent {...props} />);
    fireEvent.click(exportButton());
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.click).not.toHaveBeenCalled();
    fireEvent.click(exportButton());
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    expect(mocks.sheet.mock.calls[0]?.[0]).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('blocks pending export when grouping configuration fails and exposes retry', () => {
    mocks.config.isError = true;
    render(<ExportDialogContent {...props} />);
    expect(exportButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    expect(mocks.retry).toHaveBeenCalled();
    expect(mocks.listPending).not.toHaveBeenCalled();
  });

  it('does not block created exports on an unrelated grouping configuration error', async () => {
    mocks.config.isError = true;
    render(
      <ExportDialogContent
        {...props}
        invoiceType="created"
        searchParams={{ walletId: 'cash', start: '2026-09-01' }}
      />
    );
    fireEvent.click(exportButton());
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    expect(mocks.listCreated).toHaveBeenCalledWith(
      'ws',
      expect.objectContaining({ walletIds: ['cash'], start: '2026-09-01' })
    );
    expect(mocks.sheet.mock.calls[0]?.[0][0]).toMatchObject({
      customer_name: 'Student',
      wallet_name: 'Cash',
    });
  });
});
