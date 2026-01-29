import type { LucideIcon } from '@tuturuuu/icons';
import type { Database as SupabaseDatabase } from '@tuturuuu/types';
import type { CSSProperties, ReactNode } from 'react';

/**
 * Database enum type for platform icons
 *
 * This represents the icons stored in the database enum.
 * Contains all 1668 lucide icons for use across the platform.
 */
export type DbPlatformIcon =
  SupabaseDatabase['public']['Enums']['platform_icon'];

/**
 * Icon categories from Lucide's official categorization (43 categories)
 *
 * Icons can belong to multiple categories. These match exactly with
 * Lucide's category API at https://lucide.dev/api/categories
 */
export type IconCategory =
  | 'accessibility'
  | 'account'
  | 'animals'
  | 'arrows'
  | 'brands'
  | 'buildings'
  | 'charts'
  | 'communication'
  | 'connectivity'
  | 'cursors'
  | 'design'
  | 'development'
  | 'devices'
  | 'emoji'
  | 'files'
  | 'finance'
  | 'food-beverage'
  | 'gaming'
  | 'home'
  | 'layout'
  | 'mail'
  | 'math'
  | 'medical'
  | 'multimedia'
  | 'nature'
  | 'navigation'
  | 'notifications'
  | 'people'
  | 'photography'
  | 'science'
  | 'seasons'
  | 'security'
  | 'shapes'
  | 'shopping'
  | 'social'
  | 'sports'
  | 'sustainability'
  | 'text'
  | 'time'
  | 'tools'
  | 'transportation'
  | 'travel'
  | 'weather';

/**
 * Category metadata for UI display
 */
export interface CategoryInfo {
  /** Category identifier */
  id: IconCategory;
  /** Human-readable label (translation key) */
  labelKey: string;
  /** Number of icons in this category */
  count: number;
  /** Representative icon for the category */
  icon: string;
}

/**
 * Extended icon option with semantic keywords for improved search
 *
 * The `value` field is a string to support all lucide icons,
 * regardless of whether the database enum has been migrated yet.
 */
export interface IconOption {
  /** The icon identifier (PascalCase lucide icon name) */
  value: string;
  /** Human-readable display label */
  label: string;
  /** The Lucide icon component */
  Icon: LucideIcon;
  /** Semantic keywords for search (e.g., "money" for DollarSign) */
  keywords?: string[];
  /** Categories this icon belongs to (icons can have multiple categories) */
  categories?: IconCategory[];
}

/**
 * Props for the IconPicker component
 *
 * The component accepts and returns string values to be flexible
 * with both the full lucide icon set and the database enum subset.
 */
export interface IconPickerProps {
  /** Currently selected icon value (any lucide icon name or DB enum value) */
  value?: string | null;
  /** Callback when icon selection changes */
  onValueChange: (value: string | null) => void;
  /** Whether the picker is disabled */
  disabled?: boolean;
  /** Whether to show the clear button */
  allowClear?: boolean;
  /** Accessible label for the trigger button */
  ariaLabel?: string;
  /** Dialog title */
  title?: string;
  /** Dialog description */
  description?: string;
  /** Search input placeholder */
  searchPlaceholder?: string;
  /** Clear button label */
  clearLabel?: string;
  /** Default category to show on open */
  defaultCategory?: IconCategory | 'all';
  /** Category translations (optional, defaults to English) */
  categoryLabels?: Record<IconCategory | 'all', string>;
  /** Additional class name for the trigger button */
  triggerClassName?: string;
  /** Inline styles for the trigger button */
  triggerStyle?: CSSProperties;
  /** Custom icon to render in the trigger button (overrides default) */
  renderIcon?: ReactNode;
}
