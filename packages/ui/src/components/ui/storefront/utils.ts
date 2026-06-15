import type {
  InventoryStorefront,
  InventoryStorefrontListing,
} from '@tuturuuu/internal-api/inventory';
import type { CSSProperties } from 'react';

export const storefrontRadiusClasses: Record<
  InventoryStorefront['cornerStyle'],
  string
> = {
  compact: 'rounded-md',
  rounded: 'rounded-lg',
  soft: 'rounded-2xl',
};

export const storefrontSurfaceClasses: Record<
  InventoryStorefront['surfaceStyle'],
  string
> = {
  glass:
    'border border-border/70 bg-card/75 shadow-sm shadow-foreground/5 backdrop-blur',
  soft: 'border border-border/70 bg-muted/35 shadow-sm shadow-foreground/5',
  solid: 'border border-border bg-card shadow-sm shadow-foreground/5',
};

/**
 * Theme presets change the storefront's typographic personality so the choice
 * is actually visible to shoppers. Applied at the surface root and inherited by
 * headings/body inside.
 */
export const storefrontThemeClasses: Record<
  InventoryStorefront['themePreset'],
  string
> = {
  // Spacious, headline-led magazine feel with serif headings.
  editorial:
    'font-sans [&_h1]:font-serif [&_h1]:tracking-tight [&_h2]:font-serif [&_h2]:tracking-tight',
  // Refined boutique look: airy, wide-tracked uppercase headings.
  boutique:
    'font-sans [&_h1]:uppercase [&_h1]:tracking-[0.12em] [&_h2]:tracking-wide',
  // Dense, scannable product-catalog density.
  catalog: 'font-sans text-[0.95rem] [&_h1]:tracking-tight',
  // Clean default.
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

export function getStorefrontListingLimit(listing: InventoryStorefrontListing) {
  const available =
    typeof listing.availableQuantity === 'number'
      ? listing.availableQuantity
      : Number.POSITIVE_INFINITY;

  return Math.max(0, Math.min(listing.maxPerOrder, available));
}

export function formatStorefrontPrice(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    currency,
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value);
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
