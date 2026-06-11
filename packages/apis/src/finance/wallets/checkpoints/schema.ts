import { z } from 'zod';

export const CHECKPOINT_NOTE_MAX_LENGTH = 500;
export const CHECKPOINT_BATCH_LIMIT = 100;

const amountSchema = z
  .union([z.number(), z.string()])
  .transform((value) => (typeof value === 'number' ? value : Number(value)))
  .refine((value) => Number.isFinite(value), {
    message: 'Amount must be a finite number',
  });

const checkedAtSchema = z
  .string()
  .trim()
  .refine((value) => value.length > 0 && Number.isFinite(Date.parse(value)), {
    message: 'checked_at must be a valid date',
  })
  .transform((value) => new Date(value).toISOString());

const noteSchema = z
  .string()
  .max(CHECKPOINT_NOTE_MAX_LENGTH)
  .optional()
  .nullable()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  });

export const walletCheckpointCreateSchema = z.object({
  actual_balance: amountSchema,
  checked_at: checkedAtSchema.optional(),
  note: noteSchema,
});

export const walletCheckpointUpdateSchema = z
  .object({
    actual_balance: amountSchema.optional(),
    checked_at: checkedAtSchema.optional(),
    note: noteSchema,
  })
  .refine(
    (value) =>
      value.actual_balance !== undefined ||
      value.checked_at !== undefined ||
      value.note !== undefined,
    {
      message: 'At least one checkpoint field must be provided',
    }
  );

export const walletCheckpointBatchCreateSchema = z.object({
  checked_at: checkedAtSchema.optional(),
  entries: z
    .array(
      z.object({
        actual_balance: amountSchema,
        note: noteSchema,
        wallet_id: z
          .string()
          .regex(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu,
            'Invalid wallet ID'
          ),
      })
    )
    .min(1)
    .max(CHECKPOINT_BATCH_LIMIT),
});

const routeUuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu);

export const checkpointIdSchema = routeUuidSchema;
export const walletIdSchema = routeUuidSchema;
