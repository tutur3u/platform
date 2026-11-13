import { registry } from './registry.generated';

export * from './catalog';
export { registry };
export type { RuntimeEnvironment } from './runtime-environment';
export {
  isRuntimeEnvironment,
  resolveRuntimeFlagEnvironment,
  RUNTIME_ENVIRONMENTS,
} from './runtime-environment';
export {
  catalogFamilyCounts,
  classifyFlagKey,
  RUNTIME_FLAG_KEYS,
} from './runtime-policy';
export type {
  FlagKeyClassification,
  PlatformFlagFamily,
} from './runtime-policy';
export {
  applyFeatureFlagMutation,
  emptyLedger,
  reconcileOperation,
  retryKnownOperation,
  validateMutationCommand,
} from './runtime-state';
export type {
  FlagLedger,
  MutationCommand,
  MutationOutcome,
  StoredAudit,
  StoredFlag,
} from './runtime-state';
export {
  classifyStoreFailure,
  planMobileFeatureFlags,
  selectRuntimeOverrides,
} from './runtime-adapter';
export type {
  MobileFlagPlan,
  RuntimeOverrideRecord,
  RuntimeStoreRead,
} from './runtime-adapter';
export {
  assessFeatureFlagMutation,
  assessFeatureFlagRead,
  AUDIT_PAGE_LIMIT_DEFAULT,
  AUDIT_PAGE_LIMIT_MAX,
  boundAuditLimit,
  FEATURE_FLAG_MUTATE_PERMISSION,
  FEATURE_FLAG_READ_PERMISSION,
  httpStatusForMutation,
} from './runtime-access';
export {
  outcomeFromDatabaseError,
  parseAuditRows,
  parseMutationPayload,
  parseOverrideRows,
} from './runtime-codec';
export {
  asPrivateRpcAdmin,
  commitFeatureFlagRpc,
  commitPlatformFeatureFlagMutation,
  interpretAdminAuditRead,
  interpretAdminStateRead,
  interpretRuntimeRead,
} from './runtime-rpc';
export type {
  CommitRpcResult,
  PrivateRpcAdmin,
  PrivateRpcResult,
} from './runtime-rpc';
export { projectDashboardFlag } from './runtime-dashboard';
export type { DashboardFlagProjection } from './runtime-dashboard';
export type FlagKey = (typeof registry)[number]['key'];
export type FlagClass = 'read' | 'write' | 'ui' | 'kill';
export interface FlagDefinition<Key extends string = string> {
  readonly key: Key;
  readonly description: string;
  readonly owner: string;
  readonly class: FlagClass;
  readonly default: boolean;
  readonly removeBy: string;
}
export interface FlagContext {
  readonly userId?: string;
  readonly wsId?: string;
}

export function evaluateFlags<Key extends string>(
  definitions: readonly FlagDefinition<Key>[],
  _context: FlagContext,
  overrides: Readonly<Partial<Record<string, boolean>>> = {}
): Record<Key, boolean> {
  const entries = definitions.map(
    ({ key, default: fallback }) =>
      [
        key,
        Object.hasOwn(overrides, key) ? (overrides[key] ?? fallback) : fallback,
      ] as const
  );
  const offlineEnabled = entries.some(
    ([key, enabled]) => key === 'mobile_offline' && enabled
  );
  // Object.fromEntries loses the key union; entries contain exactly the registry keys.
  return Object.fromEntries(
    entries.map(([key, enabled]) => [
      key,
      key.startsWith('offline_') && !offlineEnabled ? false : enabled,
    ])
  ) as Record<Key, boolean>;
}

export const cookieConsentBanner = {
  key: 'cookie_consent_banner',
  description:
    'Client-side privacy preferences; remove after production verification.',
  owner: 'pax',
  class: 'ui',
  default: false,
  removeBy: '2026-12-08',
} satisfies FlagDefinition<'cookie_consent_banner'>;
