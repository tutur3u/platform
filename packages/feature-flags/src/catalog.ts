import catalogSource from '../../../config/feature-flag-catalog.json';
import type { FeatureFlagCatalog } from './lifecycle.mjs';

export type {
  CatalogFlag,
  FeatureFlagCatalog,
  FlagEnvironment,
  FlagFamily,
  FlagKind,
  FlagLifecycle,
  FlagLifecycleStatus,
  FlagScope,
} from './lifecycle.mjs';
export {
  deriveRemoveBy,
  FLAG_ENVIRONMENTS,
  FLAG_FAMILIES,
  FLAG_KINDS,
  FLAG_SCOPES,
  findOverdueFlags,
  getFlagLifecycle,
  REMOVAL_GRACE_HOURS,
  validateCatalog,
  validateFlag,
} from './lifecycle.mjs';

/**
 * Platform-wide flag catalog with lifecycle metadata. JSON widens the enum
 * fields to string; `catalog.test.ts` validates every entry against the
 * declared unions with `validateCatalog`.
 */
export const featureFlagCatalog = catalogSource as FeatureFlagCatalog;
