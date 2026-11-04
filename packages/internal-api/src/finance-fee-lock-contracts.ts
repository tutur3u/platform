import { z } from 'zod';

/** Request and response contracts for `/finance/fee-locks` (chốt học phí). */

export const FEE_LOCK_MAX_LINES = 50;
export const FEE_LOCK_BATCH_MAX_ITEMS = 200;
export const FEE_LOCK_VERSION_CONFLICT_CODE = 'FEE_LOCK_VERSION_CONFLICT';

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
  .min(-1e14)
  .max(1e14)
  .refine(hasAtMostDecimals(6), 'At most 6 decimals');
const reasonSchema = z.string().trim().max(500);
const versionSchema = z.int().min(1);

export const feeLockStatusSchema = z.enum(['draft', 'locked']);
export type FeeLockStatus = z.infer<typeof feeLockStatusSchema>;

/** The server also requires a reason when sessions differ from the baseline. */
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
  z.object({
    ...extraLineBase,
    source: z.literal('free_text'),
    label: z.string().trim().min(1).max(200),
    unit_label: z.string().trim().min(1).max(40),
    unit_price: moneySchema.nonnegative(),
  }),
]);

/** Clients never send prices for catalogue lines or any totals. */
export const feeLockLineInputSchema = z.union([
  tuitionLineInputSchema,
  extraLineInputSchema,
]);
export type FeeLockLineInput = z.input<typeof feeLockLineInputSchema>;

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

export const feeLockListQuerySchema = z.object({
  month: feeLockMonthSchema,
  groupId: z.guid().optional(),
  status: z.enum(['none', 'draft', 'locked']).optional(),
  q: z.string().trim().max(200).default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
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

export type FeeLockBatchItemResult =
  | { id: string; result: 'ok'; version: number; revision: number }
  | { id: string; result: 'conflict'; current_version: number }
  | { id: string; result: 'not_found' };

/** Immutable JSON stored in `fee_lock_revisions.snapshot` at lock time. */
export const feeLockSnapshotSchema = z.object({
  schema_version: z.literal(1),
  fee_lock_id: z.guid(),
  ws_id: z.guid(),
  student_id: z.guid(),
  student_name: z.string(),
  period_month: z.string().regex(/^\d{4}-\d{2}-01$/),
  currency: z.string().length(3),
  revision: z.int().min(1),
  total_amount: z.number().nonnegative(),
  note: z.string().nullable(),
  locked_by: z.guid().nullable(),
  locked_at: z.string(),
  lines: z.array(
    z.object({
      kind: z.enum(['tuition', 'extra']),
      group_id: z.guid().nullable(),
      group_name: z.string().nullable(),
      label: z.string(),
      unit_label: z.string().nullable(),
      product_id: z.guid().nullable(),
      unit_price: z.number(),
      quantity: z.number(),
      adjustment_amount: z.number(),
      reason: z.string().nullable(),
      line_amount: z.number(),
      sort_order: z.int(),
    })
  ),
});
export type FeeLockSnapshot = z.infer<typeof feeLockSnapshotSchema>;
