import type {
  InventoryListingVariant,
  InventoryStorefront,
  InventoryStorefrontListing,
} from '@tuturuuu/internal-api/inventory';
import { formatMoneyFromMinor } from '@tuturuuu/utils/money';
import type { CSSProperties } from 'react';

// The storefront now ships a single, unified design language. The merchant
// preset fields (cornerStyle/surfaceStyle/themePreset/layoutStyle) are retained
// in the data model for backwards compatibility, but every value resolves to the
// same refined look so the experience is consistent across all storefronts.

/** One soft, modern corner radius for every surface. */
export const STOREFRONT_RADIUS = 'rounded-2xl';

export const storefrontRadiusClasses: Record<
  InventoryStorefront['cornerStyle'],
  string
> = {
  compact: STOREFRONT_RADIUS,
  rounded: STOREFRONT_RADIUS,
  soft: STOREFRONT_RADIUS,
};

/** One elevated card surface for every storefront. */
export const STOREFRONT_SURFACE =
  'border border-border/60 bg-card shadow-sm shadow-foreground/5';

export const storefrontSurfaceClasses: Record<
  InventoryStorefront['surfaceStyle'],
  string
> = {
  glass: STOREFRONT_SURFACE,
  soft: STOREFRONT_SURFACE,
  solid: STOREFRONT_SURFACE,
};

/** Unified typography for the whole storefront. */
export const storefrontThemeClasses: Record<
  InventoryStorefront['themePreset'],
  string
> = {
  editorial: 'font-sans',
  boutique: 'font-sans',
  catalog: 'font-sans',
  minimal: 'font-sans',
};

export type StorefrontAccentStyle = CSSProperties & {
  '--storefront-accent'?: string;
  '--storefront-accent-foreground'?: string;
};

export function sanitizeStorefrontAccentColor(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) return null;

  if (/^#[0-9a-f]{3}$/i.test(normalized)) {
    const [, r, g, b] = normalized;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return normalized.toLowerCase();
  }

  return null;
}

export function getSafeStorefrontHttpUrl(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function getStorefrontListingLimit(listing: InventoryStorefrontListing) {
  const available =
    typeof listing.availableQuantity === 'number'
      ? listing.availableQuantity
      : Number.POSITIVE_INFINITY;

  return Math.max(0, Math.min(listing.maxPerOrder, available));
}

/** Active, selectable variants for a listing, in display order. */
export function getStorefrontListingVariants(
  listing: InventoryStorefrontListing
): InventoryListingVariant[] {
  return (listing.variants ?? []).filter(
    (variant) => variant.status === 'active'
  );
}

export function listingHasVariants(listing: InventoryStorefrontListing) {
  return getStorefrontListingVariants(listing).length > 0;
}

/** Per-order limit for a specific variant, capped by the listing's maxPerOrder. */
export function getStorefrontVariantLimit(
  listing: InventoryStorefrontListing,
  variant: InventoryListingVariant
) {
  const available =
    typeof variant.availableQuantity === 'number'
      ? variant.availableQuantity
      : Number.POSITIVE_INFINITY;

  return Math.max(0, Math.min(listing.maxPerOrder, available));
}

/**
 * Resolves the price to charge for a cart line: the variant's resolved price
 * when a variant is selected, otherwise the listing price. Both are minor units.
 */
export function getStorefrontLinePrice(
  listing: InventoryStorefrontListing,
  variant?: InventoryListingVariant | null
) {
  return variant ? variant.price : listing.price;
}

/** Lowest active-variant price, for a "from {price}" label on variant listings. */
export function getStorefrontListingFromPrice(
  listing: InventoryStorefrontListing
) {
  const variants = getStorefrontListingVariants(listing);
  if (variants.length === 0) return listing.price;
  return variants.reduce(
    (min, variant) => Math.min(min, variant.price),
    Number.POSITIVE_INFINITY
  );
}

/** Stable identity for a cart line so listing+variant combos stay distinct. */
export function storefrontCartLineKey(
  listingId: string,
  variantId?: string | null
) {
  return `${listingId}::${variantId ?? ''}`;
}

/** Composes a human label for the selected variant from its option values. */
export function getStorefrontVariantLabel(
  variant: InventoryListingVariant
): string | null {
  if (variant.title) return variant.title;
  const labels = variant.optionValues.map((value) => value.label);
  if (labels.length > 0) return labels.join(' / ');
  return variant.sku ?? null;
}

/**
 * Format a storefront price. Listing/bundle prices and cart totals are stored
 * in integer minor units (cents for USD), so convert through the shared money
 * helper, which also applies the currency's correct decimal precision.
 */
export function formatStorefrontPrice(minorValue: number, currency: string) {
  return formatMoneyFromMinor(minorValue, currency);
}

export function getListingInitials(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function getAccentStyle(
  accentColor: string | null
): StorefrontAccentStyle {
  if (!accentColor) return {};

  return {
    '--storefront-accent': accentColor,
    '--storefront-accent-foreground': getAccentForeground(accentColor),
  };
}

function getAccentForeground(hexColor: string) {
  const red = Number.parseInt(hexColor.slice(1, 3), 16);
  const green = Number.parseInt(hexColor.slice(3, 5), 16);
  const blue = Number.parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.64 ? '#111111' : '#ffffff';
}
