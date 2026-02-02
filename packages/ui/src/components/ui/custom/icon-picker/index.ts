/**
 * Icon Picker Component
 *
 * A virtualized, searchable icon picker with semantic keyword support
 * and category browsing.
 *
 * @example
 * ```tsx
 * import IconPicker from '@tuturuuu/ui/custom/icon-picker';
 *
 * function MyComponent() {
 *   const [icon, setIcon] = useState<PlatformIconKey | null>(null);
 *
 *   return (
 *     <IconPicker
 *       value={icon}
 *       onValueChange={setIcon}
 *     />
 *   );
 * }
 * ```
 */

// Icon options and utilities (lazy-loadable)
export {
  type AssertPlatformIconValuesCoverDb,
  CATEGORY_INFO,
  getCategoryIcon,
  getIconComponentByKey,
  getIconsByCategory,
  ICON_OPTIONS,
  PLATFORM_ICON_VALUES,
  type PlatformIconKey,
} from './icon-options';
// Main component (default export)
export { default, default as IconPicker } from './icon-picker';

// Types
export type {
  CategoryInfo,
  DbPlatformIcon,
  IconCategory,
  IconOption,
  IconPickerProps,
} from './types';
