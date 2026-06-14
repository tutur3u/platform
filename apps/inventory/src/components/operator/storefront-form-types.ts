import type {
  InventoryStorefrontCheckoutMode,
  InventoryStorefrontCornerStyle,
  InventoryStorefrontLayoutStyle,
  InventoryStorefrontSectionPayload,
  InventoryStorefrontStatus,
  InventoryStorefrontSurfaceStyle,
  InventoryStorefrontThemePreset,
  InventoryStorefrontVisibility,
} from '@tuturuuu/internal-api/inventory';
import type { Dispatch, SetStateAction } from 'react';

export type StorefrontFormState = {
  accentColor: string;
  analyticsEnabled: boolean;
  checkoutMode: InventoryStorefrontCheckoutMode;
  cornerStyle: InventoryStorefrontCornerStyle;
  coverImageUrl: string;
  currency: string;
  description: string;
  heroImageUrl: string;
  layoutStyle: InventoryStorefrontLayoutStyle;
  name: string;
  sections: InventoryStorefrontSectionPayload[];
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
