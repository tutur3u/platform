import { describe, expect, it } from 'vitest';
import {
  escapeFeeLockLikeText,
  FEE_LOCK_MAX_MONEY,
  type FeeLockLineInput,
  feeLockBatchLockRequestSchema,
  feeLockSaveDraftRequestSchema,
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
