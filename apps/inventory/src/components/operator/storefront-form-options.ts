import type {
  InventoryStorefrontCheckoutMode,
  InventoryStorefrontCornerStyle,
  InventoryStorefrontLayoutStyle,
  InventoryStorefrontStatus,
  InventoryStorefrontSurfaceStyle,
  InventoryStorefrontThemePreset,
  InventoryStorefrontVisibility,
} from '@tuturuuu/internal-api/inventory';

export const storefrontStatuses: InventoryStorefrontStatus[] = [
  'draft',
  'published',
  'paused',
];

export const storefrontVisibilities: InventoryStorefrontVisibility[] = [
  'public',
  'private',
];

export const checkoutModes: InventoryStorefrontCheckoutMode[] = [
  'polar',
  'simulated',
  'disabled',
];

export const themePresets: InventoryStorefrontThemePreset[] = [
  'minimal',
  'editorial',
  'boutique',
  'catalog',
];

export const layoutStyles: InventoryStorefrontLayoutStyle[] = [
  'grid',
  'list',
  'feature',
];

export const surfaceStyles: InventoryStorefrontSurfaceStyle[] = [
  'solid',
  'soft',
  'glass',
];

export const cornerStyles: InventoryStorefrontCornerStyle[] = [
  'compact',
  'rounded',
  'soft',
];
