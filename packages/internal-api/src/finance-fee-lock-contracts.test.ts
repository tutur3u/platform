import { describe, expect, it } from 'vitest';
import {
  type FeeLockLineInput,
  feeLockBatchLockRequestSchema,
  feeLockSaveDraftRequestSchema,
  feeLockSnapshotSchema,
} from './finance-fee-lock-contracts';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tuition = (groupId: string, extra = {}) => ({
  kind: 'tuition' as const,
  group_id: groupId,
  quantity: 8,
  ...extra,
});
const draft = (lines: FeeLockLineInput[]) => ({
  student_id: id(1),
  month: '2026-12',
  lines,
});

describe('fee-lock contracts', () => {
  it('accepts tuition, catalogue and free-text lines without client prices', () => {
    const parsed = feeLockSaveDraftRequestSchema.parse(
      draft([
        tuition(id(2), { adjustment_amount: -100_000, reason: 'Thành tích' }),
        {
          kind: 'extra',
          source: 'catalog',
          product_id: id(3),
          unit_id: id(4),
          warehouse_id: id(5),
          quantity: 1,
        },
        {
          kind: 'extra',
          source: 'free_text',
          label: 'Sách',
          unit_label: 'bộ',
          unit_price: 85_000,
          quantity: 2,
          group_id: id(2),
        },
      ])
    );
    expect(parsed.lines).toHaveLength(3);
    expect(parsed.lines[0]).not.toHaveProperty('unit_price');
  });

  it.each([
    [
      'an adjustment without a reason',
      draft([tuition(id(2), { adjustment_amount: 5, reason: ' ' })]),
    ],
    [
      'two tuition lines for one class',
      draft([tuition(id(2)), tuition(id(2))]),
    ],
    ['a bad month', { ...draft([tuition(id(2))]), month: '2026-13' }],
    ['too many decimals', draft([tuition(id(2), { quantity: 1.0005 })])],
    ['no lines', draft([])],
  ])('rejects %s', (_label, body) => {
    expect(feeLockSaveDraftRequestSchema.safeParse(body).success).toBe(false);
  });

  it('caps batch locks at 200 items', () => {
    const items = Array.from({ length: 201 }, (_, i) => ({
      id: id(i + 10),
      expected_version: 1,
    }));
    expect(
      feeLockBatchLockRequestSchema.safeParse({ month: '2026-12', items })
        .success
    ).toBe(false);
    expect(
      feeLockBatchLockRequestSchema.safeParse({
        month: '2026-12',
        items: items.slice(0, 200),
      }).success
    ).toBe(true);
  });
});

describe('fee-lock snapshot', () => {
  it('pins schema version 1 and rejects a mid-month period', () => {
    const snapshot = {
      schema_version: 1,
      fee_lock_id: id(9),
      ws_id: id(8),
      student_id: id(1),
      student_name: 'Học viên mẫu',
      period_month: '2026-12-01',
      currency: 'VND',
      revision: 1,
      total_amount: 1_200_000,
      note: null,
      locked_by: null,
      locked_at: '2026-11-25T03:00:00.000Z',
      lines: [],
    };
    expect(feeLockSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(
      feeLockSnapshotSchema.safeParse({
        ...snapshot,
        period_month: '2026-12-15',
      }).success
    ).toBe(false);
    expect(
      feeLockSnapshotSchema.safeParse({ ...snapshot, schema_version: 2 })
        .success
    ).toBe(false);
  });
});
