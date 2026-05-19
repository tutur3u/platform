import { z } from 'zod';

export const StorefrontStatusSchema = z.enum([
  'draft',
  'published',
  'paused',
  'archived',
]);

export const ListingStatusSchema = z.enum([
  'draft',
  'published',
  'paused',
  'archived',
]);

export const BundleStatusSchema = z.enum([
  'draft',
  'active',
  'paused',
  'archived',
]);

export const CheckoutStatusSchema = z.enum([
  'reserved',
  'completed',
  'cancelled',
  'expired',
]);

export const listQuerySchema = <T extends z.ZodEnum>(statusSchema: T) =>
  z.object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    q: z.string().trim().max(120).optional(),
    status: z.union([statusSchema, z.literal('all')]).optional(),
  });

export const storefrontPayloadSchema = z.object({
  accentColor: z.string().trim().max(64).nullable().optional(),
  currency: z.string().trim().length(3).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  heroImageUrl: z.url().nullable().optional(),
  name: z.string().trim().min(1).max(160),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  status: StorefrontStatusSchema.optional(),
});

export const storefrontPatchSchema = storefrontPayloadSchema.partial();

export const storefrontListingPayloadSchema = z.object({
  bundleId: z.guid().nullable().optional(),
  compareAtPrice: z.number().int().nonnegative().nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  imageUrl: z.url().nullable().optional(),
  listingType: z.enum(['product', 'bundle']).optional(),
  maxPerOrder: z.number().int().min(1).max(999).optional(),
  price: z.number().int().nonnegative(),
  productId: z.guid().nullable().optional(),
  sortOrder: z.number().int().optional(),
  status: ListingStatusSchema.optional(),
  title: z.string().trim().min(1).max(180),
  unitId: z.guid().nullable().optional(),
  warehouseId: z.guid().nullable().optional(),
});

export const bundlePayloadSchema = z.object({
  components: z
    .array(
      z.object({
        productId: z.guid(),
        quantity: z.number().int().min(1).max(999_999),
        unitId: z.guid(),
        warehouseId: z.guid(),
      })
    )
    .optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  imageUrl: z.url().nullable().optional(),
  maxPerOrder: z.number().int().min(1).max(999).optional(),
  name: z.string().trim().min(1).max(180),
  price: z.number().int().nonnegative(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  status: BundleStatusSchema.optional(),
  storefrontId: z.guid().nullable().optional(),
});

export const bundlePatchSchema = bundlePayloadSchema.partial();

export const checkoutCreatePayloadSchema = z.object({
  customerEmail: z.email(),
  customerName: z.string().trim().min(1).max(160),
  customerPhone: z.string().trim().max(64).nullable().optional(),
  lines: z
    .array(
      z.object({
        bundleId: z.guid().optional(),
        listingId: z.guid().optional(),
        quantity: z.number().int().min(1).max(999),
      })
    )
    .min(1),
  note: z.string().trim().max(2000).nullable().optional(),
});
