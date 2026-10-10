import { describe, expect, it } from 'vitest';
import { periodicDeliveryCategory } from './report-delivery-category';
import {
  collectReportList,
  MAX_REPORT_LIST_ROWS,
  sortReportList,
  summarizeReportList,
} from './report-list-query';

describe('exact report scan', () => {
  it('collects beyond database page cap, then counts category-filtered report units', async () => {
    const dataset = Array.from({ length: 1105 }, (_, id) => ({
      id: `report-${id}`,
      report_stage: 'blocked',
      delivery_status: 'blocked' as const,
      user_email: id % 2 ? 'student@example.test' : '  ',
      last_delivery_error:
        id % 3
          ? null
          : 'Email suppression lookup unavailable. Try again later.',
    }));
    const offsets: number[] = [];
    const rows = await collectReportList(async (offset, limit) => {
      offsets.push(offset);
      return {
        data: dataset.slice(offset, offset + limit),
        count: dataset.length,
        error: null,
      };
    });
    expect(offsets).toEqual([0, 1000]);
    const selected = rows.filter(
      (row) => periodicDeliveryCategory(row) === 'infrastructure'
    );
    const summary = summarizeReportList(selected);
    expect(summary.counts.total).toBe(369);
    expect(summary.categoryCounts.infrastructure).toBe(369);
    expect(summary.categoryCounts.suppression).toBe(0);
    expect(summary.counts.stages.blocked).toBe(369);
    expect(selected.slice(100, 120)).toHaveLength(20);
  });
  it.each([
    { count: null, data: [] },
    { count: 2, data: [] },
    { count: MAX_REPORT_LIST_ROWS + 1, data: [] },
  ])(
    'fails unavailable, incomplete or over-bound totals rather than reporting zero',
    async (result) => {
      await expect(
        collectReportList(async () => ({ ...result, error: null }))
      ).rejects.toThrow();
    }
  );
  it('rejects a changed scope while scanning', async () => {
    let call = 0;
    await expect(
      collectReportList(async () => ({
        count: call++ ? 1106 : 1105,
        data: Array.from({ length: 1000 }, (_, id) => ({ id: `report-${id}` })),
        error: null,
      }))
    ).rejects.toThrow('Report scope changed');
  });
  it('rejects duplicate ids even when the exact total has not changed', async () => {
    let call = 0;
    await expect(
      collectReportList(async () => ({
        count: 1001,
        data: call++
          ? [{ id: 'report-0' }]
          : Array.from({ length: 1000 }, (_, id) => ({ id: `report-${id}` })),
        error: null,
      }))
    ).rejects.toThrow('Report scope changed');
  });
  it('propagates query failures', async () => {
    const error = new Error('query unavailable');
    await expect(
      collectReportList(async () => ({ count: null, data: null, error }))
    ).rejects.toBe(error);
  });
  it.each([true, false])(
    'sorts merged cadences globally with nulls last and stable id ties (%s)',
    (ascending) => {
      const rows = [
        { id: 'd', title: null, created_at: '2026-01-01' },
        { id: 'b', title: 'A', created_at: '2026-02-01' },
        { id: 'a', title: 'A', created_at: '2026-02-01' },
        { id: 'c', title: 'A', created_at: '2026-01-01' },
      ];
      expect(
        sortReportList(rows, 'title', ascending).map((row) => row.id)
      ).toEqual(ascending ? ['c', 'a', 'b', 'd'] : ['a', 'b', 'c', 'd']);
    }
  );
  it('applies the remaining shared scan budget to every cadence', async () => {
    await expect(
      collectReportList(
        async () => ({
          count: 2,
          data: [{ id: 'a' }, { id: 'b' }],
          error: null,
        }),
        1
      )
    ).rejects.toThrow('Too many reports');
  });
});
