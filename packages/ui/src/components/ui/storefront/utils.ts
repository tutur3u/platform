import type {
  InventoryBundle,
  InventoryBundleCategoryCandidate,
  InventoryBundleCategoryComponent,
  InventoryListingVariant,
  InventoryStorefront,
  InventoryStorefrontListing,
} from '@tuturuuu/internal-api/inventory';
import { formatMoneyFromMinor } from '@tuturuuu/utils/money';
import type { CSSProperties } from 'react';
import type { StorefrontCartLine } from './types';

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
  '--storefront-accent-border'?: string;
  '--storefront-accent-foreground'?: string;
  '--storefront-accent-soft'?: string;
  '--storefront-accent-text'?: string;
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

function getCategorySelectionItems(
  line: StorefrontCartLine,
  component: InventoryBundleCategoryComponent
) {
  const selections = line.bundleSelections;
  if (!selections) return [];

  if (Array.isArray(selections)) {
    return (
      selections.find((selection) => selection.componentId === component.id)
        ?.items ?? []
    );
  }

  return selections[component.id] ?? [];
}

function getCandidateKey(candidate: InventoryBundleCategoryCandidate) {
  return [
    candidate.selectionKind,
    candidate.listingId ?? '',
    candidate.variantId ?? '',
    candidate.productId,
    candidate.unitId,
    candidate.warehouseId,
  ].join(':');
}

function resolveBundleCandidate(
  component: InventoryBundleCategoryComponent,
  item: ReturnType<typeof getCategorySelectionItems>[number]
) {
  return component.candidates?.find((candidate) => {
    if (item.variantId) {
      return (
        candidate.variantId === item.variantId &&
        candidate.listingId === item.listingId
      );
    }
    if (item.listingId) {
      return candidate.listingId === item.listingId && !candidate.variantId;
    }
    return (
      candidate.productId === item.productId &&
      candidate.unitId === item.unitId &&
      candidate.warehouseId === item.warehouseId
    );
  });
}

export function getStorefrontBundleSelectionSubtotal(
  bundle: InventoryBundle | undefined,
  line: StorefrontCartLine
) {
  if (!bundle?.categoryComponents?.length || !line.bundleSelections) {
    return null;
  }

  let subtotal = 0;
  for (const component of bundle.categoryComponents) {
    const pricedItems = getCategorySelectionItems(line, component).map(
      (item) => {
        const candidate = resolveBundleCandidate(component, item);
        return candidate
          ? {
              candidate,
              quantity: item.quantity ?? 1,
            }
          : null;
      }
    );

    if (pricedItems.some((item) => !item)) return null;

    const validPricedItems = pricedItems.filter(
      (
        item
      ): item is {
        candidate: InventoryBundleCategoryCandidate;
        quantity: number;
      } => Boolean(item)
    );

    let freeRemaining =
      component.discountStrategy === 'cheapest_free'
        ? component.freeQuantity * line.quantity
        : 0;

    for (const pricedItem of validPricedItems.sort(
      (a, b) => a.candidate.price - b.candidate.price
    )) {
      const units = pricedItem.quantity * line.quantity;
      const freeUnits = Math.min(units, freeRemaining);
      freeRemaining -= freeUnits;
      subtotal += (units - freeUnits) * pricedItem.candidate.price;
    }
  }

  return subtotal;
}

export function getStorefrontBundleSelectionLabels(
  bundle: InventoryBundle | undefined,
  line: StorefrontCartLine
) {
  if (!bundle?.categoryComponents?.length || !line.bundleSelections) return [];

  return bundle.categoryComponents.flatMap((component) =>
    getCategorySelectionItems(line, component).flatMap((item) => {
      const candidate = resolveBundleCandidate(component, item);
      if (!candidate) return [];
      const quantity = item.quantity ?? 1;
      return quantity > 1 ? `${quantity}x ${candidate.title}` : candidate.title;
    })
  );
}

export function getStorefrontCartLineSubtotal({
  bundle,
  line,
  listing,
  variant,
}: {
  bundle?: InventoryBundle;
  line: StorefrontCartLine;
  listing: InventoryStorefrontListing;
  variant?: InventoryListingVariant | null;
}) {
  const selectedSubtotal = getStorefrontBundleSelectionSubtotal(bundle, line);
  if (selectedSubtotal != null) return selectedSubtotal;

  return getStorefrontLinePrice(listing, variant) * line.quantity;
}

export function createStorefrontBundleSelectionKey(
  bundle: InventoryBundle,
  selections: NonNullable<StorefrontCartLine['bundleSelections']>
) {
  const chunks = bundle.categoryComponents.map((component) => {
    const items = Array.isArray(selections)
      ? (selections.find((selection) => selection.componentId === component.id)
          ?.items ?? [])
      : (selections[component.id] ?? []);
    const keys = items
      .map((item) => {
        const candidate = resolveBundleCandidate(component, item);
        return candidate
          ? `${getCandidateKey(candidate)}@${item.quantity ?? 1}`
          : JSON.stringify(item);
      })
      .sort();
    return `${component.id}=${keys.join(',')}`;
  });

  return chunks.join('|');
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
  variantId?: string | null,
  selectionKey?: string | null
) {
  return `${listingId}::${variantId ?? ''}::${selectionKey ?? ''}`;
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
    '--storefront-accent-border': `color-mix(in oklab, ${accentColor} 42%, var(--border))`,
    '--storefront-accent-foreground': getAccentForeground(accentColor),
    '--storefront-accent-soft': `color-mix(in oklab, ${accentColor} 14%, var(--background))`,
    '--storefront-accent-text': `color-mix(in oklab, ${accentColor} 68%, var(--foreground))`,
  };
}

function getAccentForeground(hexColor: string) {
  const red = Number.parseInt(hexColor.slice(1, 3), 16);
  const green = Number.parseInt(hexColor.slice(3, 5), 16);
  const blue = Number.parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.64 ? '#111111' : '#ffffff';
}
