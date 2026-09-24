import { describe, expect, it, vi } from 'vitest';
import {
  collectInvoiceExport,
  IncompleteInvoiceExportError,
} from './export-pagination';

const getKey = (row: { id: string }) => row.id;
const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `invoice-${i}`,
    group: `class-${i % 7}`,
  }));

describe('complete invoice exports', () => {
  it.each([0, 1, 999, 1000, 1001, 2000, 2507])(
    'preserves every row and class for %i invoices',
    async (count) => {
      const data = rows(count);
      const fetchPage = vi.fn(async (page: number, pageSize: number) => ({
        count,
        data: data.slice((page - 1) * pageSize, page * pageSize),
      }));
      const progress = vi.fn();
      const actual = await collectInvoiceExport({
        fetchPage,
        getKey,
        onProgress: progress,
      });
      expect(actual).toEqual(data);
      expect(new Set(actual.map((row) => row.group))).toEqual(
        new Set(data.map((row) => row.group))
      );
      expect(fetchPage).toHaveBeenCalledTimes(
        Math.max(1, Math.ceil(count / 1000))
      );
      expect(progress).toHaveBeenLastCalledWith(100);
      expect(
        progress.mock.calls.every(([value]) => value >= 0 && value <= 100)
      ).toBe(true);
    }
  );

  it('keeps one student in multiple classes as distinct debt rows', async () => {
    const data = [
      { user: 'student', group: 'class-a' },
      { user: 'student', group: 'class-b' },
    ];
    expect(
      await collectInvoiceExport({
        fetchPage: async () => ({ count: 2, data }),
        getKey: (row) => JSON.stringify([row.user, row.group]),
      })
    ).toEqual(data);
  });

  it.each([
    {
      name: 'a truncated first page',
      pages: [{ count: 1500, data: rows(100) }],
    },
    { name: 'an empty first page with debt', pages: [{ count: 20, data: [] }] },
    {
      name: 'an empty later page',
      pages: [
        { count: 1001, data: rows(1000) },
        { count: 1001, data: [] },
      ],
    },
    {
      name: 'a shrinking dataset',
      pages: [
        { count: 1001, data: rows(1000) },
        { count: 1000, data: [] },
      ],
    },
    {
      name: 'a growing dataset',
      pages: [
        { count: 1001, data: rows(1000) },
        { count: 1002, data: rows(2) },
      ],
    },
    {
      name: 'duplicate page boundaries',
      pages: [
        { count: 1001, data: rows(1000) },
        { count: 1001, data: [{ id: 'invoice-999' }] },
      ],
    },
    {
      name: 'duplicate rows within a page',
      pages: [{ count: 2, data: [{ id: 'same' }, { id: 'same' }] }],
    },
    { name: 'rows beyond the count', pages: [{ count: 0, data: rows(1) }] },
    { name: 'missing identities', pages: [{ count: 1, data: [{ id: '' }] }] },
    { name: 'a missing count', pages: [{ data: [] }] },
    { name: 'a missing row array', pages: [{ count: 0 }] },
    { name: 'a negative count', pages: [{ count: -1, data: [] }] },
    { name: 'a fractional count', pages: [{ count: 0.5, data: [] }] },
    { name: 'an infinite count', pages: [{ count: Infinity, data: [] }] },
  ])('rejects $name instead of producing a partial file', async ({ pages }) => {
    const fetchPage = vi.fn(
      async () => pages.shift() as { count: number; data: { id: string }[] }
    );
    await expect(
      collectInvoiceExport({ fetchPage, getKey })
    ).rejects.toBeInstanceOf(IncompleteInvoiceExportError);
  });

  it('propagates later request failures without returning partial rows', async () => {
    const error = new Error('Request timed out');
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ count: 1001, data: rows(1000) })
      .mockRejectedValueOnce(error);
    await expect(collectInvoiceExport({ fetchPage, getKey })).rejects.toBe(
      error
    );
  });

  it.each([0, -1, 1.5, Infinity])(
    'rejects invalid page size %s',
    async (pageSize) => {
      const fetchPage = vi.fn();
      await expect(
        collectInvoiceExport({ fetchPage, getKey, pageSize })
      ).rejects.toThrow(RangeError);
      expect(fetchPage).not.toHaveBeenCalled();
    }
  );
});
