import { z } from 'zod';

export const CostProfileStatusSchema = z.enum(['active', 'archived', 'draft']);

export const CostScenarioPayloadSchema = z.object({
  artCommissionCost: z.number().nonnegative().optional(),
  batchSize: z.number().int().min(1),
  manufacturingCostPerUnit: z.number().nonnegative().optional(),
  name: z.string().trim().min(1).max(160),
  otherCostPerUnit: z.number().nonnegative().optional(),
  packagingCostPerUnit: z.number().nonnegative().optional(),
  shippingCost: z.number().nonnegative().optional(),
  sortOrder: z.number().int().optional(),
  tariffCost: z.number().nonnegative().optional(),
});

export const CostProfitSharePayloadSchema = z.object({
  recipientLabel: z.string().trim().min(1).max(120),
  sharePercentage: z.number().min(0).max(100),
  sortOrder: z.number().int().optional(),
});

export const CostProfilePayloadSchema = z.object({
  categoryId: z.guid().nullable().optional(),
  currency: z.string().trim().length(3).optional(),
  name: z.string().trim().min(1).max(180),
  notes: z.string().trim().max(2000).nullable().optional(),
  productId: z.guid().nullable().optional(),
  profitShares: z.array(CostProfitSharePayloadSchema).optional(),
  scenarios: z.array(CostScenarioPayloadSchema).optional(),
  status: CostProfileStatusSchema.optional(),
  targetRetailPrice: z.number().nonnegative(),
});

export const CostProfilePatchSchema = CostProfilePayloadSchema.partial();

export const CostingImportPayloadSchema = z.object({
  commit: z.boolean().optional(),
  csv: z.string().min(1).max(500_000),
});

export const CostProfileListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().max(120).optional(),
  response: z.enum(['paginated']).optional(),
  status: z.union([CostProfileStatusSchema, z.literal('all')]).optional(),
});
