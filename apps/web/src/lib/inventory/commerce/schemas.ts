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
  'square_terminal',
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

export const BundlePricingModeSchema = z.enum([
  'fixed_price',
  'selected_items',
]);

export const BundleCategoryCandidateScopeSchema = z.enum([
  'published_listings',
  'all_stock',
]);

export const BundleCategoryDiscountStrategySchema = z.enum([
  'none',
  'cheapest_free',
]);

export const CheckoutStatusSchema = z.enum([
  'reserved',
  'completed',
  'cancelled',
  'expired',
]);

export const PolarEnvironmentSchema = z.enum(['sandbox', 'production']);
export const SquareEnvironmentSchema = z.enum(['sandbox', 'production']);

export const PolarCurrencySchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.enum(SUPPORTED_POLAR_CURRENCIES));

const httpUrlSchema = z.url().refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  },
  { message: 'URL must use http or https' }
);

const storefrontSectionItemPayloadSchema = z.object({
  bundleId: z.guid().nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  href: httpUrlSchema.nullable().optional(),
  id: z.guid().optional(),
  imageUrl: z.url().nullable().optional(),
  listingId: z.guid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  sortOrder: z.number().int().optional(),
  title: z.string().trim().max(160).nullable().optional(),
});

const storefrontSectionPayloadSchema = z.object({
  description: z.string().trim().max(1200).nullable().optional(),
  href: httpUrlSchema.nullable().optional(),
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

export const VariantStatusSchema = z.enum(['active', 'hidden', 'archived']);

export const listingVariantPayloadSchema = z.object({
  compareAtPrice: z.number().int().nonnegative().nullable().optional(),
  id: z.guid().optional(),
  imageUrl: z.url().nullable().optional(),
  optionValueLabels: z.record(z.string(), z.string()).optional(),
  price: z.number().int().nonnegative().nullable().optional(),
  productId: z.guid(),
  sku: z.string().trim().max(64).nullable().optional(),
  sortOrder: z.number().int().optional(),
  status: VariantStatusSchema.optional(),
  title: z.string().trim().max(180).nullable().optional(),
  unitId: z.guid(),
  warehouseId: z.guid(),
});

const listingOptionPayloadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sortOrder: z.number().int().optional(),
  values: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(120),
        sortOrder: z.number().int().optional(),
      })
    )
    .max(64),
});

export const storefrontListingPayloadSchema = z.object({
  applyOptionTemplateId: z.guid().nullable().optional(),
  bundleId: z.guid().nullable().optional(),
  compareAtPrice: z.number().int().nonnegative().nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  imageUrl: z.url().nullable().optional(),
  listingType: z.enum(['product', 'bundle']).optional(),
  maxPerOrder: z.number().int().min(1).max(999).optional(),
  options: z.array(listingOptionPayloadSchema).max(8).optional(),
  price: z.number().int().nonnegative(),
  productId: z.guid().nullable().optional(),
  sortOrder: z.number().int().optional(),
  status: ListingStatusSchema.optional(),
  title: z.string().trim().min(1).max(180),
  unitId: z.guid().nullable().optional(),
  variants: z.array(listingVariantPayloadSchema).max(200).optional(),
  warehouseId: z.guid().nullable().optional(),
});

export const optionTemplatePayloadSchema = z.object({
  description: z.string().trim().max(1000).nullable().optional(),
  groups: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        sortOrder: z.number().int().optional(),
        values: z
          .array(
            z.object({
              label: z.string().trim().min(1).max(120),
              sortOrder: z.number().int().optional(),
              value: z.string().trim().max(120).nullable().optional(),
            })
          )
          .max(64),
      })
    )
    .max(8),
  name: z.string().trim().min(1).max(160),
});

export const optionTemplatePatchSchema = optionTemplatePayloadSchema.partial();

export const bundlePayloadSchema = z.object({
  categoryCandidateScope: BundleCategoryCandidateScopeSchema.optional(),
  categoryComponents: z
    .array(
      z.object({
        categoryId: z.guid(),
        discountStrategy: BundleCategoryDiscountStrategySchema.optional(),
        freeQuantity: z.number().int().min(0).max(999_999).optional(),
        quantityRequired: z.number().int().min(1).max(999_999),
        sortOrder: z.number().int().optional(),
      })
    )
    .optional(),
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
  pricingMode: BundlePricingModeSchema.optional(),
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

const checkoutBundleSelectionItemSchema = z.object({
  listingId: z.guid().nullable().optional(),
  productId: z.guid().nullable().optional(),
  quantity: z.number().int().min(1).max(999).optional(),
  unitId: z.guid().nullable().optional(),
  variantId: z.guid().nullable().optional(),
  warehouseId: z.guid().nullable().optional(),
});

const checkoutBundleSelectionSchema = z.object({
  componentId: z.guid().optional(),
  items: z.array(checkoutBundleSelectionItemSchema).min(1).max(999),
});

const checkoutBundleSelectionsSchema = z.union([
  z.record(
    z.guid(),
    z.array(checkoutBundleSelectionItemSchema).min(1).max(999)
  ),
  z.array(checkoutBundleSelectionSchema).min(1).max(64),
]);

export const checkoutCreatePayloadSchema = z.object({
  customerEmail: z.email().optional(),
  customerName: z.string().trim().min(1).max(160).optional(),
  customerPhone: z.string().trim().max(64).nullable().optional(),
  lines: z
    .array(
      z.object({
        bundleId: z.guid().optional(),
        bundleSelections: checkoutBundleSelectionsSchema.optional(),
        listingId: z.guid().optional(),
        quantity: z.number().int().min(1).max(999),
        variantId: z.guid().optional(),
      })
    )
    .min(1),
  note: z.string().trim().max(2000).nullable().optional(),
});

export const polarSettingsPayloadSchema = z
  .object({
    accessToken: z.string().trim().min(1).max(4096).optional(),
    webhookSecret: z.string().trim().min(1).max(4096).optional(),
    environment: PolarEnvironmentSchema.optional(),
    productionEnvironment: PolarEnvironmentSchema.optional(),
    testingEnvironment: PolarEnvironmentSchema.optional(),
  })
  .refine(
    (value) => !value.accessToken || value.environment,
    'environment is required when accessToken is provided'
  )
  .refine(
    (value) => !value.webhookSecret || value.environment,
    'environment is required when webhookSecret is provided'
  );

export const squareSettingsPayloadSchema = z
  .object({
    accessToken: z.string().trim().min(1).max(4096).optional(),
    applicationId: z.string().trim().min(1).max(255).optional(),
    applicationSecret: z.string().trim().min(1).max(4096).optional(),
    deviceId: z.string().trim().max(255).nullable().optional(),
    deviceName: z.string().trim().max(255).nullable().optional(),
    environment: SquareEnvironmentSchema.optional(),
    locationId: z.string().trim().max(255).nullable().optional(),
    locationName: z.string().trim().max(255).nullable().optional(),
    oauthRedirectUrl: httpUrlSchema.nullable().optional(),
    sandboxDeviceId: z.string().trim().max(255).nullable().optional(),
    webhookNotificationUrl: httpUrlSchema.nullable().optional(),
    webhookSignatureKey: z.string().trim().min(1).max(4096).optional(),
  })
  .refine(
    (value) =>
      !value.accessToken ||
      value.environment === 'sandbox' ||
      value.environment === 'production',
    'environment is required when accessToken is provided'
  )
  .refine(
    (value) =>
      !value.webhookSignatureKey ||
      value.environment === 'sandbox' ||
      value.environment === 'production',
    'environment is required when webhookSignatureKey is provided'
  )
  .refine(
    (value) =>
      (!value.applicationId &&
        !value.applicationSecret &&
        value.oauthRedirectUrl === undefined &&
        value.webhookNotificationUrl === undefined) ||
      value.environment === 'sandbox' ||
      value.environment === 'production',
    'environment is required when Square app credentials are provided'
  );

export const squareOAuthStartQuerySchema = z.object({
  environment: SquareEnvironmentSchema.default('sandbox'),
});

export const squareDeviceCodePayloadSchema = z.object({
  locationId: z.string().trim().max(255).optional(),
  name: z.string().trim().min(1).max(120).optional(),
});

export const squareTerminalCheckoutPayloadSchema = z.object({
  checkoutId: z.guid(),
  deviceId: z.string().trim().max(255).optional(),
});
