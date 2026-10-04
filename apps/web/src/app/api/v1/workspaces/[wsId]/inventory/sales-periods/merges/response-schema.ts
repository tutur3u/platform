import { z } from 'zod';

const named = z.object({ id: z.guid(), name: z.string().min(1) });
const count = z.number().int().nonnegative();
const period = named
  .extend({
    description: z.string().nullable(),
    starts_at: z.string().nullable(),
    ends_at: z.string().nullable(),
    time_zone: z.string().nullable(),
    pricing_mode: z.enum(['legacy', 'scheduled']),
    product_scope: z.enum(['all', 'allowlist', 'blocklist']),
  })
  .passthrough();
const identity = {
  productId: z.guid(),
  productName: z.string().min(1),
  unitName: z.string().min(1),
  warehouseName: z.string().min(1),
};
const price = z.object({
  ...identity,
  id: z.guid(),
  unitId: z.guid(),
  warehouseId: z.guid(),
  price: z.number(),
  currency: z.string().min(1),
  validFrom: z.iso.datetime({ offset: true }),
  validTo: z.iso.datetime({ offset: true }).nullable(),
});
const conflict = z.object({
  ...identity,
  sourcePriceId: z.guid(),
  targetPriceId: z.guid(),
  sourcePrice: z.number(),
  targetPrice: z.number(),
  sourceCurrency: z.string().min(1),
  targetCurrency: z.string().min(1),
  sourceFrom: z.iso.datetime({ offset: true }),
  sourceTo: z.iso.datetime({ offset: true }).nullable(),
  targetFrom: z.iso.datetime({ offset: true }),
  targetTo: z.iso.datetime({ offset: true }).nullable(),
});
export const seasonPreviewResponse = z.object({
  version: z.guid(),
  cutoff: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  page: z.number().int().positive().max(100000),
  source: period,
  target: period,
  sourceRules: z.array(named).max(50),
  targetRules: z.array(named).max(50),
  sourceRuleCount: count,
  targetRuleCount: count,
  sourceRuleConflictCount: count,
  targetRuleConflictCount: count,
  futurePrices: z.array(price).max(50),
  futurePriceCount: count,
  conflicts: z.array(conflict).max(50),
  conflictCount: count,
  blockers: z.array(z.string()),
  hasMore: z.boolean(),
  assignmentCount: count,
  historicalQuoteCount: count,
});
export const seasonApplyResponse = z.object({
  merged: z.literal(true),
  targetId: z.guid(),
  importedPriceCount: count,
});
