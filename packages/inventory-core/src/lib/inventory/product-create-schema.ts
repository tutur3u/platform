import {
  MAX_LONG_TEXT_LENGTH,
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_URL_LENGTH,
} from '@tuturuuu/utils/constants';
import { z } from 'zod';

const InventoryItemSchema = z.object({
  unit_id: z.guid(),
  warehouse_id: z.guid(),
  amount: z.number().int().nonnegative().nullable(),
  min_amount: z.number().int().nonnegative(),
  price: z.number().nonnegative(),
  revenue_share_partner_id: z.guid().nullable().optional(),
  revenue_share_bps: z.number().int().min(0).max(10000).default(0),
});

export const InventoryProductCreateSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  avatar_url: z.url().max(MAX_URL_LENGTH).nullable().optional(),
  manufacturer_id: z.guid().nullable().optional(),
  manufacturer: z.string().max(MAX_NAME_LENGTH).nullable().optional(),
  description: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  usage: z.string().max(MAX_MEDIUM_TEXT_LENGTH).optional(),
  category_id: z.guid(),
  owner_id: z.guid().optional(),
  finance_category_id: z.guid().nullable().optional(),
  inventory: z.array(InventoryItemSchema).max(500).default([]),
});

export type InventoryProductCreatePayload = z.infer<
  typeof InventoryProductCreateSchema
>;
