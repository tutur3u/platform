import { SUPPORTED_POLAR_CURRENCIES } from '@tuturuuu/internal-api/inventory';
import { z } from 'zod';

export const StorefrontStatusSchema = z.enum([
  'draft',
  'published',
  'paused',
  'archived',
]);

export const StorefrontVisibilitySchema = z.enum(['public', 'private']);

export const StorefrontThemePresetSchema = z.enum([
  'minimal',
  'editorial',
  'boutique',
  'catalog',
]);

export const StorefrontLayoutStyleSchema = z.enum(['grid', 'list', 'feature']);

export const StorefrontSurfaceStyleSchema = z.enum(['solid', 'soft', 'glass']);

export const StorefrontCornerStyleSchema = z.enum([
  'compact',
  'rounded',
  'soft',
]);

export const StorefrontCheckoutModeSchema = z.enum([
  'polar',
  'simulated',
  'disabled',
]);

export const StorefrontSectionTypeSchema = z.enum([
  'cover',
  'featured_banners',
  'featured_listings',
  'product_grid',
  'promo',
  'text',
]);

export const StorefrontSectionStatusSchema = z.enum([
  'draft',
  'hidden',
  'published',
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

export const PolarEnvironmentSchema = z.enum(['sandbox', 'production']);

export const PolarCurrencySchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.enum(SUPPORTED_POLAR_CURRENCIES));

const storefrontSectionItemPayloadSchema = z.object({
  bundleId: z.guid().nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  href: z.url().nullable().optional(),
  id: z.guid().optional(),
  imageUrl: z.url().nullable().optional(),
  listingId: z.guid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  sortOrder: z.number().int().optional(),
  title: z.string().trim().max(160).nullable().optional(),
});

const storefrontSectionPayloadSchema = z.object({
  description: z.string().trim().max(1200).nullable().optional(),
  href: z.url().nullable().optional(),
  id: z.guid().optional(),
  imageUrl: z.url().nullable().optional(),
  items: z.array(storefrontSectionItemPayloadSchema).max(24).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  sectionType: StorefrontSectionTypeSchema,
  sortOrder: z.number().int().optional(),
  status: StorefrontSectionStatusSchema.optional(),
  title: z.string().trim().max(180).nullable().optional(),
});

export const listQuerySchema = <T extends z.ZodEnum>(statusSchema: T) =>
  z.object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    q: z.string().trim().max(120).optional(),
    status: z.union([statusSchema, z.literal('all')]).optional(),
  });

export const storefrontPayloadSchema = z.object({
  accentColor: z.string().trim().max(64).nullable().optional(),
  analyticsEnabled: z.boolean().optional(),
  coverImageUrl: z.url().nullable().optional(),
  currency: PolarCurrencySchema.optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  heroImageUrl: z.url().nullable().optional(),
  checkoutMode: StorefrontCheckoutModeSchema.optional(),
  themePreset: StorefrontThemePresetSchema.optional(),
  layoutStyle: StorefrontLayoutStyleSchema.optional(),
  surfaceStyle: StorefrontSurfaceStyleSchema.optional(),
  cornerStyle: StorefrontCornerStyleSchema.optional(),
  showInventoryBadges: z.boolean().optional(),
  polarEnvironment: PolarEnvironmentSchema.optional(),
  sections: z.array(storefrontSectionPayloadSchema).max(24).optional(),
  name: z.string().trim().min(1).max(160),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  status: StorefrontStatusSchema.optional(),
  visibility: StorefrontVisibilitySchema.optional(),
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
  customerEmail: z.email().optional(),
  customerName: z.string().trim().min(1).max(160).optional(),
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

export const polarSettingsPayloadSchema = z
  .object({
    accessToken: z.string().trim().min(1).max(4096).optional(),
    environment: PolarEnvironmentSchema.optional(),
    productionEnvironment: PolarEnvironmentSchema.optional(),
    testingEnvironment: PolarEnvironmentSchema.optional(),
  })
  .refine(
    (value) => !value.accessToken || value.environment,
    'environment is required when accessToken is provided'
  );
