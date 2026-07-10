import { z } from 'zod';

const InventoryItemSchema = z.object({
  warehouse_id: z.guid(),
  unit_id: z.guid(),
  amount: z.number().nonnegative().nullable(),
  min_amount: z.number().nonnegative().optional(),
  price: z.number().nonnegative(),
  revenue_share_partner_id: z.guid().nullable().optional(),
  revenue_share_bps: z.number().int().min(0).max(10000).default(0),
});

const TrimmedNoteSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().max(500));

export const InventoryBodySchema = z.object({
  changeContext: z
    .object({
      beneficiaryId: z.guid().nullable().optional(),
      note: TrimmedNoteSchema.nullable().optional(),
    })
    .optional(),
  inventory: z.array(InventoryItemSchema).default([]),
});

export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type InventoryItemKeyTarget = Pick<
  InventoryItem,
  'unit_id' | 'warehouse_id'
>;

export function createInventoryKey(item: InventoryItemKeyTarget) {
  return `${item.warehouse_id}:${item.unit_id}`;
}
