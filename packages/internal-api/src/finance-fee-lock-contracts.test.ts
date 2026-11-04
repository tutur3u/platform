import { describe, expect, it } from 'vitest';
import {
  escapeFeeLockLikeText,
  FEE_LOCK_EMPTY_CODE,
  FEE_LOCK_MAX_MONEY,
  type FeeLockLineInput,
  feeLockBatchItemResultSchema,
  feeLockBatchLockRequestSchema,
  feeLockSaveDraftRequestSchema,
  feeLockSnapshotSchema,
  isFeeLockMoneyInRange,
  toFeeLockIlikePattern,
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

describe('fee-lock money bound', () => {
  const book = (unit_price: number, quantity = 1) => ({
    kind: 'extra' as const,
    source: 'free_text' as const,
    label: 'Sách',
    unit_label: 'bộ',
    unit_price,
    quantity,
  });
  const freeText = (unit_price: number) =>
    draft([tuition(id(2)), book(unit_price)]);
  const adjusted = (adjustment_amount: number) =>
    draft([tuition(id(2), { adjustment_amount, reason: 'Điều chỉnh' })]);

  it('accepts the NUMERIC(20,6) maximum and rejects anything above it', () => {
    expect(FEE_LOCK_MAX_MONEY).toBe(99_999_999_999_999);
    const ok = (body: unknown) =>
      feeLockSaveDraftRequestSchema.safeParse(body).success;
    expect(ok(freeText(FEE_LOCK_MAX_MONEY))).toBe(true);
    expect(ok(freeText(FEE_LOCK_MAX_MONEY + 1))).toBe(false);
    expect(ok(freeText(1e14))).toBe(false);
    expect(ok(adjusted(-FEE_LOCK_MAX_MONEY))).toBe(true);
    expect(ok(adjusted(-FEE_LOCK_MAX_MONEY - 1))).toBe(false);
  });

  it('rejects a client-priced line that would overflow (400, not 500)', () => {
    const parse = (lines: FeeLockLineInput[]) =>
      feeLockSaveDraftRequestSchema.safeParse(draft(lines));
    expect(parse([book(FEE_LOCK_MAX_MONEY, 2)]).error?.issues[0]?.message).toBe(
      'line_amount_overflow'
    );
    expect(isFeeLockMoneyInRange(FEE_LOCK_MAX_MONEY)).toBe(true);
    expect(isFeeLockMoneyInRange(-FEE_LOCK_MAX_MONEY - 1)).toBe(false);
    expect(isFeeLockMoneyInRange(Number.NaN)).toBe(false);
  });
});

describe('fee-lock search escaping', () => {
  it('escapes LIKE wildcards and the escape character', () => {
    expect(escapeFeeLockLikeText('50%_off\\x')).toBe('50\\%\\_off\\\\x');
    expect(toFeeLockIlikePattern('  An_%  ')).toBe('%An\\_\\%%');
    expect(toFeeLockIlikePattern('   ')).toBeNull();
    expect(toFeeLockIlikePattern(undefined)).toBeNull();
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

  it('bounds strings, line count, amounts, timestamps and months like the inputs', () => {
    const line = {
      kind: 'tuition',
      group_id: id(2),
      group_name: 'Lớp A',
      label: 'Lớp A',
      unit_label: 'buổi',
      product_id: null,
      unit_price: 150_000,
      quantity: 8,
      adjustment_amount: 0,
      reason: null,
      line_amount: 1_200_000,
      sort_order: 0,
    };
    const base = {
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
      locked_at: '2026-11-25T10:00:00+07:00',
      lines: [line],
    };
    const ok = (patch: object, linePatch: object = {}) =>
      feeLockSnapshotSchema.safeParse({
        ...base,
        lines: [{ ...line, ...linePatch }],
        ...patch,
      }).success;
    expect(ok({})).toBe(true);
    expect(ok({ student_name: 'x'.repeat(201) })).toBe(false);
    expect(ok({ note: 'x'.repeat(2001) })).toBe(false);
    expect(ok({ period_month: '2026-13-01' })).toBe(false);
    expect(ok({ locked_at: 'yesterday' })).toBe(false);
    expect(ok({ total_amount: FEE_LOCK_MAX_MONEY + 1 })).toBe(false);
    expect(ok({ lines: Array.from({ length: 51 }, () => line) })).toBe(false);
    expect(ok({}, { label: 'x'.repeat(201) })).toBe(false);
    expect(ok({}, { reason: 'x'.repeat(501) })).toBe(false);
    expect(ok({}, { quantity: 0 })).toBe(false);
    expect(ok({}, { line_amount: -1 })).toBe(false);
    expect(ok({}, { adjustment_amount: -FEE_LOCK_MAX_MONEY - 1 })).toBe(false);
    expect(ok({}, { sort_order: 0 })).toBe(true);
    expect(ok({}, { sort_order: 32_767 })).toBe(true);
    expect(ok({}, { sort_order: 32_768 })).toBe(false);
    expect(ok({}, { sort_order: -1 })).toBe(false);
  });
});

describe('fee-lock batch item results', () => {
  it('reports an empty draft as invalid with its code, never as a conflict', () => {
    const parse = (r: object) =>
      feeLockBatchItemResultSchema.safeParse({ id: id(301), ...r }).success;
    expect(parse({ result: 'invalid', code: FEE_LOCK_EMPTY_CODE })).toBe(true);
    expect(parse({ result: 'ok', version: 3, revision: 1 })).toBe(true);
    expect(parse({ result: 'conflict', current_version: 4 })).toBe(true);
    expect(parse({ result: 'not_found' })).toBe(true);
    expect(parse({ result: 'invalid' })).toBe(false);
    expect(parse({ result: 'invalid', code: 'boom' })).toBe(false);
    expect(parse({ result: 'conflict', code: FEE_LOCK_EMPTY_CODE })).toBe(
      false
    );
  });
});
