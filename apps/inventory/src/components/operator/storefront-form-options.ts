import {
  type InventoryPolarEnvironment,
  type InventoryStorefrontCheckoutMode,
  type InventoryStorefrontCornerStyle,
  type InventoryStorefrontLayoutStyle,
  type InventoryStorefrontSectionPayload,
  type InventoryStorefrontStatus,
  type InventoryStorefrontSurfaceStyle,
  type InventoryStorefrontThemePreset,
  type InventoryStorefrontVisibility,
  SUPPORTED_POLAR_CURRENCIES,
} from '@tuturuuu/internal-api/inventory';

export const storefrontStatuses: InventoryStorefrontStatus[] = [
  'draft',
  'published',
  'paused',
];

export const polarEnvironments: InventoryPolarEnvironment[] = [
  'sandbox',
  'production',
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

export const polarCurrencyOptions = SUPPORTED_POLAR_CURRENCIES.map(
  (currency) => ({
    label: currency,
    value: currency,
  })
);

export function createDefaultStorefrontSections(): InventoryStorefrontSectionPayload[] {
  return [
    {
      description: '',
      imageUrl: null,
      items: [],
      sectionType: 'featured_banners',
      sortOrder: 0,
      status: 'published',
      title: '',
    },
    {
      description: '',
      imageUrl: null,
      items: [],
      sectionType: 'product_grid',
      sortOrder: 1,
      status: 'published',
      title: '',
    },
  ];
}
