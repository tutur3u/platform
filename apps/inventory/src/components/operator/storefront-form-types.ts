import type {
  InventoryStorefrontCheckoutMode,
  InventoryStorefrontCornerStyle,
  InventoryStorefrontLayoutStyle,
  InventoryStorefrontStatus,
  InventoryStorefrontSurfaceStyle,
  InventoryStorefrontThemePreset,
  InventoryStorefrontVisibility,
} from '@tuturuuu/internal-api/inventory';
import type { Dispatch, SetStateAction } from 'react';

export type StorefrontFormState = {
  accentColor: string;
  checkoutMode: InventoryStorefrontCheckoutMode;
  cornerStyle: InventoryStorefrontCornerStyle;
  currency: string;
  description: string;
  heroImageUrl: string;
  layoutStyle: InventoryStorefrontLayoutStyle;
  name: string;
  showInventoryBadges: boolean;
  slug: string;
  status: InventoryStorefrontStatus;
  surfaceStyle: InventoryStorefrontSurfaceStyle;
  themePreset: InventoryStorefrontThemePreset;
  visibility: InventoryStorefrontVisibility;
};

export type StorefrontFormSetter = Dispatch<
  SetStateAction<StorefrontFormState>
>;
