import {
  MAX_LONG_TEXT_LENGTH,
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_URL_LENGTH,
} from '@tuturuuu/utils/constants';
import { z } from 'zod';
import { InventoryProductCreateSchema } from './product-create-schema';

const named = z.strictObject({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
});
const period = z
  .strictObject({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable().optional(),
    starts_at: z.iso.date().nullable().optional(),
    ends_at: z.iso.date().nullable().optional(),
    product_scope: z.enum(['all', 'allowlist', 'blocklist']).default('all'),
    product_ids: z.array(z.guid()).max(500).optional(),
    pricing_mode: z.enum(['legacy', 'scheduled']).optional(),
    time_zone: z.string().max(100).nullable().optional(),
  })
  .refine(
    (value) =>
      value.pricing_mode !== 'scheduled' ||
      Boolean(value.starts_at && value.ends_at && value.time_zone),
    { message: 'Scheduled prices require dates and an IANA timezone' }
  )
  .refine(
    (value) =>
      !(value.starts_at && value.ends_at) || value.starts_at <= value.ends_at,
    { message: 'Invalid period date range' }
  )
  .refine(
    (value) =>
      value.product_scope === 'all' || (value.product_ids?.length ?? 0) > 0,
    { message: 'Choose period products' }
  );

const schemas = {
  owner: named.extend({
    avatar_url: z.url().max(MAX_URL_LENGTH).nullable().optional(),
    linked_workspace_user_id: z.guid().nullable().optional(),
  }),
  manufacturer: named,
  category: named,
  unit: named,
  warehouse: named,
  finance_category: z.strictObject({
    name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
    is_expense: z.boolean(),
    description: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
    icon: z.string().max(MAX_MEDIUM_TEXT_LENGTH).nullable().optional(),
    color: z.string().max(MAX_MEDIUM_TEXT_LENGTH).nullable().optional(),
  }),
  product: InventoryProductCreateSchema.omit({ manufacturer: true })
    .extend({ owner_id: z.guid() })
    .strict(),
  period,
};
export const OfflineCreateKindSchema = z.enum([
  'owner',
  'manufacturer',
  'category',
  'unit',
  'warehouse',
  'finance_category',
  'product',
  'period',
]);
export type OfflineCreateKind = z.infer<typeof OfflineCreateKindSchema>;
export const OfflineCreateEnvelopeSchema = z.strictObject({
  operation_id: z.guid(),
  kind: OfflineCreateKindSchema,
  payload: z.record(z.string(), z.unknown()),
});
export function parseOfflineCreatePayload(
  kind: OfflineCreateKind,
  value: unknown
) {
  return schemas[kind].safeParse(value);
}
