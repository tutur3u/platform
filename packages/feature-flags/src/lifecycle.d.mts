import type { FeatureRollout } from './audience.mjs';

export type FlagEnvironment = 'development' | 'staging' | 'production';
export type FlagFamily = 'mobile-runtime' | 'workspace-secret' | 'mobile-build';
/**
 * `release` flags gate a new feature and become removal-due after production
 * verification. Every other kind is a retained control and is never due for
 * removal by the lifecycle policy.
 */
export type FlagKind =
  | 'release'
  | 'kill-switch'
  | 'workspace-gate'
  | 'safety-control'
  | 'operational';
export type FlagScope = 'global' | 'workspace' | 'build';
export type FlagLifecycleStatus =
  | 'retained'
  | 'awaiting-verification'
  | 'scheduled'
  | 'overdue';

export interface CatalogFlag {
  readonly key: string;
  readonly rollout?: FeatureRollout;
  readonly family: FlagFamily;
  readonly kind: FlagKind;
  readonly scope: FlagScope;
  readonly description: string | null;
  /** Null only for legacy entries whose historic owner was never recorded. */
  readonly owner: string | null;
  /** YYYY-MM-DD; null only for legacy entries. */
  readonly createdAt: string | null;
  readonly apps: readonly string[];
  /** False when consumers are reached through shared packages not traced to apps. */
  readonly appsComplete: boolean;
  readonly sources: readonly string[];
  /** Declared value when no override or workspace setting exists. */
  readonly defaults: Readonly<Record<FlagEnvironment, boolean>>;
  /** ISO instant of verified production availability; null until recorded. */
  readonly verifiedOnProdAt: string | null;
  /** True for entries adopted without historic metadata. */
  readonly legacy: boolean;
  /** Date-only deadline recorded before the catalog existed. */
  readonly legacyRemoveBy?: string;
}

export interface FeatureFlagCatalog {
  readonly environments: readonly FlagEnvironment[];
  readonly flags: readonly CatalogFlag[];
}

export interface FlagLifecycle {
  readonly removeBy: string | null;
  readonly removeBySource: 'verified' | 'legacy' | null;
  readonly status: FlagLifecycleStatus;
}

export declare const FLAG_ENVIRONMENTS: readonly FlagEnvironment[];
export declare const FLAG_FAMILIES: readonly FlagFamily[];
export declare const FLAG_KINDS: readonly FlagKind[];
export declare const FLAG_SCOPES: readonly FlagScope[];
export declare const REMOVAL_GRACE_HOURS: 48;

export declare function isCalendarDate(value: unknown): value is string;
export declare function isInstant(value: unknown): value is string;
export declare function deriveRemoveBy(
  verifiedOnProdAt: string | null | undefined
): string | null;
export declare function getFlagLifecycle(
  flag: Pick<CatalogFlag, 'kind' | 'verifiedOnProdAt' | 'legacyRemoveBy'>,
  now: Date | string
): FlagLifecycle;
export declare function validateFlag(
  flag: unknown,
  environments?: readonly string[]
): string[];
export declare function validateCatalog(catalog: unknown): string[];
export declare function findOverdueFlags(
  catalog: FeatureFlagCatalog,
  now: Date | string
): { flag: CatalogFlag; lifecycle: FlagLifecycle }[];
