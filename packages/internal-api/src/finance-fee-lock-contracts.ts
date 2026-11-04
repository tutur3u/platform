import { z } from 'zod';

/** Request and response contracts for `/finance/fee-locks` (chốt học phí). */

export const FEE_LOCK_MAX_LINES = 50;
export const FEE_LOCK_BATCH_MAX_ITEMS = 200;
export const FEE_LOCK_VERSION_CONFLICT_CODE = 'FEE_LOCK_VERSION_CONFLICT';
/** Largest magnitude NUMERIC(20,6) holds in whole units (14 integer digits). */
export const FEE_LOCK_MAX_MONEY = 99_999_999_999_999;

/** Fits NUMERIC(20,6); routes check computed amounts (and SQLSTATE 22003) to answer 400. */
export function isFeeLockMoneyInRange(value: number) {
  return Number.isFinite(value) && Math.abs(value) <= FEE_LOCK_MAX_MONEY;
}

const hasAtMostDecimals = (digits: number) => (value: number) =>
  Number(value.toFixed(digits)) === value;

export const feeLockMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM');
const quantitySchema = z
  .number()
  .positive()
  .max(100_000)
  .refine(hasAtMostDecimals(3), 'At most 3 decimals');
const moneySchema = z
  .number()
  .min(-FEE_LOCK_MAX_MONEY)
  .max(FEE_LOCK_MAX_MONEY)
  .refine(hasAtMostDecimals(6), 'At most 6 decimals');
const reasonSchema = z.string().trim().max(500);
const versionSchema = z.int().min(1);

export const feeLockStatusSchema = z.enum(['draft', 'locked']);
export type FeeLockStatus = z.infer<typeof feeLockStatusSchema>;

/**
 * The server also requires a reason when sessions differ from the baseline, and
 * MUST verify every client-supplied id (group, product, unit, warehouse) is in the workspace.
 */
const tuitionLineInputSchema = z
  .object({
    kind: z.literal('tuition'),
    group_id: z.guid(),
    quantity: quantitySchema,
    adjustment_amount: moneySchema.default(0),
    reason: reasonSchema.optional(),
  })
  .refine((line) => line.adjustment_amount === 0 || !!line.reason, {
    path: ['reason'],
    message: 'reason_required',
  });

const extraLineBase = {
  kind: z.literal('extra'),
  quantity: quantitySchema,
  /** Optional class tag, used by the per-class notice mode. */
  group_id: z.guid().nullish(),
};

const extraLineInputSchema = z.discriminatedUnion('source', [
  z.object({
    ...extraLineBase,
    source: z.literal('catalog'),
    product_id: z.guid(),
    unit_id: z.guid(),
    warehouse_id: z.guid(),
  }),
  z
    .object({
      ...extraLineBase,
      source: z.literal('free_text'),
      label: z.string().trim().min(1).max(200),
      unit_label: z.string().trim().min(1).max(40),
      unit_price: moneySchema.nonnegative(),
    })
    .refine((line) => isFeeLockMoneyInRange(line.unit_price * line.quantity), {
      path: ['unit_price'],
      message: 'line_amount_overflow',
    }),
]);

/** Clients never send prices for catalogue lines or any totals. */
export const feeLockLineInputSchema = z.union([
  tuitionLineInputSchema,
  extraLineInputSchema,
]);
export type FeeLockLineInput = z.input<typeof feeLockLineInputSchema>;

/** `student_id`, like every id in this file, must be verified against the workspace. */
export const feeLockSaveDraftRequestSchema = z
  .object({
    student_id: z.guid(),
    month: feeLockMonthSchema,
    expected_version: versionSchema.optional(),
    lines: z.array(feeLockLineInputSchema).min(1).max(FEE_LOCK_MAX_LINES),
    note: z.string().trim().max(2000).optional(),
  })
  .refine(
    ({ lines }) => {
      const groups = lines.flatMap((l) =>
        l.kind === 'tuition' ? [l.group_id] : []
      );
      return new Set(groups).size === groups.length;
    },
    { path: ['lines'], message: 'duplicate_tuition_group' }
  );
export type FeeLockSaveDraftRequest = z.input<
  typeof feeLockSaveDraftRequestSchema
>;

export const feeLockLockRequestSchema = z.object({
  expected_version: versionSchema,
});

export const feeLockBatchLockRequestSchema = z.object({
  month: feeLockMonthSchema,
  items: z
    .array(z.object({ id: z.guid(), expected_version: versionSchema }))
    .min(1)
    .max(FEE_LOCK_BATCH_MAX_ITEMS),
});
export type FeeLockBatchLockRequest = z.input<
  typeof feeLockBatchLockRequestSchema
>;

export const feeLockReopenRequestSchema = z.object({
  expected_version: versionSchema,
  reason: reasonSchema.min(1),
});

/**
 * `q` is raw user text. Never interpolate it into LIKE/ILIKE: pass
 * `toFeeLockIlikePattern(q)` to SQL with the default backslash escape, or use
 * `buildPostgrestIlikeOrFilter` from `@tuturuuu/utils/postgrest-filter` for
 * PostgREST filters. `groupId` must be checked to belong to the workspace.
 */
export const feeLockListQuerySchema = z.object({
  month: feeLockMonthSchema,
  groupId: z.guid().optional(),
  status: z.enum(['none', 'draft', 'locked']).optional(),
  q: z.string().trim().max(200).default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
/**
 * Escapes `\`, `%` and `_` for LIKE/ILIKE, like `escapeLikePattern` in
 * `@tuturuuu/utils/search-helper`, which this published package cannot import.
 */
export function escapeFeeLockLikeText(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Substring ILIKE pattern for a search term, or null when it is blank. */
export function toFeeLockIlikePattern(q: string | null | undefined) {
  const term = q?.trim();
  return term ? `%${escapeFeeLockLikeText(term)}%` : null;
}

export interface FeeLockListQuery {
  month: string;
  groupId?: string;
  status?: 'none' | FeeLockStatus;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface FeeLockHeader {
  id: string;
  ws_id: string;
  student_id: string;
  /** First day of the month, `YYYY-MM-01` (Asia/Ho_Chi_Minh). */
  period_month: string;
  status: FeeLockStatus;
  /** Last locked revision; 0 before the first lock. */
  revision: number;
  /** Optimistic-concurrency version; send it back as `expected_version`. */
  version: number;
  currency: string;
  total_amount: number;
  note: string | null;
  created_by: string | null;
  updated_by: string | null;
  locked_by: string | null;
  created_at: string;
  updated_at: string;
  locked_at: string | null;
}

export interface FeeLockLine {
  id: string;
  kind: 'tuition' | 'extra';
  group_id: string | null;
  group_name_snapshot: string | null;
  label: string;
  unit_label: string | null;
  product_id: string | null;
  unit_id: string | null;
  warehouse_id: string | null;
  baseline_quantity: number | null;
  baseline_amount: number | null;
  unit_price: number;
  quantity: number;
  adjustment_amount: number;
  reason: string | null;
  line_amount: number;
  sort_order: number;
}

export interface FeeLockDetail {
  lock: FeeLockHeader;
  lines: FeeLockLine[];
  revisions: Array<{
    revision: number;
    total_amount: number;
    locked_by: string | null;
    locked_at: string;
  }>;
}

export interface FeeLockBaselineClass {
  group_id: string;
  group_name: string;
  product_id: string | null;
  unit_id: string | null;
  warehouse_id: string | null;
  baseline_quantity: number;
  unit_price: number;
  baseline_amount: number;
}

export interface FeeLockListRow {
  student_id: string;
  student_name: string;
  classes: FeeLockBaselineClass[];
  baseline_total: number;
  lock:
    | (Pick<
        FeeLockHeader,
        'id' | 'status' | 'revision' | 'version' | 'total_amount' | 'updated_at'
      > & { updated_by_name: string | null })
    | null;
}

export interface FeeLockListResponse {
  data: FeeLockListRow[];
  count: number;
  currency: string;
}

export interface FeeLockConflictBody {
  code: typeof FEE_LOCK_VERSION_CONFLICT_CODE;
  message: string;
  current: FeeLockHeader;
}

/** `conflict` means ONLY a version race; a rule failure (an empty draft) is `invalid` with its FEE_LOCK_* code. */
export const FEE_LOCK_EMPTY_CODE = 'FEE_LOCK_EMPTY';
const batchItem = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ id: z.guid(), ...shape });
export const feeLockBatchItemResultSchema = z.discriminatedUnion('result', [
  batchItem({
    result: z.literal('ok'),
    version: versionSchema,
    revision: z.int().min(1),
  }),
  batchItem({ result: z.literal('conflict'), current_version: versionSchema }),
  batchItem({ result: z.literal('not_found') }),
  batchItem({
    result: z.literal('invalid'),
    code: z.string().regex(/^FEE_LOCK_[A-Z_]+$/),
  }),
]);
export type FeeLockBatchItemResult = z.infer<
  typeof feeLockBatchItemResultSchema
>;

// Immutable JSON in `fee_lock_revisions.snapshot`. Bounds match the inputs and M1 columns. Names come from the workspace at lock
// time; M2 must cap them at FEE_LOCK_MAX_NAME_LENGTH when it writes a snapshot.
export const FEE_LOCK_MAX_NAME_LENGTH = 200;
const nameSchema = z.string().max(FEE_LOCK_MAX_NAME_LENGTH);
export const feeLockSnapshotSchema = z.object({
  schema_version: z.literal(1),
  fee_lock_id: z.guid(),
  ws_id: z.guid(),
  student_id: z.guid(),
  student_name: nameSchema,
  period_month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/),
  currency: z.string().length(3),
  revision: z.int().min(1),
  total_amount: moneySchema.nonnegative(),
  note: z.string().max(2000).nullable(),
  locked_by: z.guid().nullable(),
  locked_at: z.iso.datetime({ offset: true }),
  lines: z
    .array(
      z.object({
        kind: z.enum(['tuition', 'extra']),
        group_id: z.guid().nullable(),
        group_name: nameSchema.nullable(),
        label: z.string().min(1).max(200),
        unit_label: z.string().max(40).nullable(),
        product_id: z.guid().nullable(),
        unit_price: moneySchema.nonnegative(),
        quantity: quantitySchema,
        adjustment_amount: moneySchema,
        reason: reasonSchema.nullable(),
        line_amount: moneySchema.nonnegative(),
        sort_order: z.int().min(0).max(32_767), // SMALLINT
      })
    )
    .max(FEE_LOCK_MAX_LINES),
});
export type FeeLockSnapshot = z.infer<typeof feeLockSnapshotSchema>;
