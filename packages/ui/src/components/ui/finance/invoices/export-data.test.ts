import { beforeEach, describe, expect, it, vi } from 'vitest';
import { XLSX } from '../../../../xlsx';
import { getData, getPendingInvoicesData } from './export-data';

const mocks = vi.hoisted(() => ({ pending: vi.fn(), created: vi.fn() }));
vi.mock('@tuturuuu/internal-api/finance', () => ({
  listPendingFinanceInvoices: mocks.pending,
  listFinanceInvoices: mocks.created,
}));
beforeEach(() => vi.clearAllMocks());

describe('invoice export normalization', () => {
  it('round-trips Vietnamese class names and all debt rows through a real Excel workbook', async () => {
    const data = [
      {
        user_id: 'student-1',
        user_name: 'Nguyễn An',
        group_id: 'class-1',
        group_name: 'Lớp cô Ngân',
        months_owed: ['2026-08', '2026-09'],
        potential_total: 1200000,
        total_sessions: 8,
      },
      {
        user_id: 'student-1',
        user_name: 'Nguyễn An',
        group_id: 'class-2',
        group_name: 'Lớp thầy Bình',
        months_owed: '2026-09',
        potential_total: 800000,
        total_sessions: 4,
      },
    ];
    mocks.pending.mockResolvedValue({ count: 2, data });
    const result = await getPendingInvoicesData('ws', {});
    const flat = result.data.map(
      ({ customer: _customer, creator: _creator, wallet: _wallet, ...row }) =>
        row
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(flat),
      'Debt'
    );
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const parsed = XLSX.read(bytes, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(parsed.Sheets.Debt!);
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_name: 'Nguyễn An',
          group_name: 'Lớp cô Ngân',
          months_owed: '2026-08, 2026-09',
          potential_total: 1200000,
        }),
        expect.objectContaining({
          user_name: 'Nguyễn An',
          group_name: 'Lớp thầy Bình',
          months_owed: '2026-09',
          potential_total: 800000,
        }),
      ])
    );
  });

  it('preserves grouped classes and scalar user filters', async () => {
    mocks.pending.mockResolvedValue({
      count: 1,
      data: [
        {
          user_id: 'student',
          group_ids: ['a', 'b'],
          group_names: ['A', 'B'],
          months_owed: ['2026-09'],
        },
      ],
    });
    const result = await getPendingInvoicesData('ws', {
      groupByUser: true,
      userIds: 'student',
      q: 'A',
    });
    expect(result.data[0]).toMatchObject({
      group_id: 'a,b',
      group_name: 'A, B',
      months_owed: '2026-09',
    });
    expect(mocks.pending).toHaveBeenCalledWith(
      'ws',
      expect.objectContaining({
        userIds: ['student'],
        q: 'A',
        groupByUser: true,
      })
    );
  });

  it('preserves both legacy and multiple-wallet filters in created exports', async () => {
    mocks.created.mockResolvedValue({ count: 0, data: [] });
    await getData('ws', {
      walletId: 'cash',
      walletIds: ['bank'],
      userIds: 'student',
      start: '2026-09-01',
      end: '2026-09-30',
      q: 'tuition',
    });
    expect(mocks.created).toHaveBeenCalledWith(
      'ws',
      expect.objectContaining({
        walletIds: ['cash', 'bank'],
        userIds: ['student'],
        start: '2026-09-01',
        end: '2026-09-30',
        q: 'tuition',
      })
    );
  });
});
