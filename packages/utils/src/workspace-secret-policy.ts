/**
 * Tier registry for `public.workspace_secrets` names.
 *
 * - `config`: flags and configuration that Postgres functions or app code read
 *   as plain values. Their values may be shown to holders of the Secrets
 *   permission.
 * - `credential`: keys, tokens, webhook secrets and any name not listed here.
 *   Their values never leave server-side code paths: HTTP GET handlers return
 *   only whether a value is set, and clients never cache them.
 *
 * Unknown names default to `credential`, so a new secret is hidden until it is
 * registered as `config` on purpose.
 */

import {
  matchWorkspaceSecretTierRule,
  type WorkspaceSecretTier,
  type WorkspaceSecretValueType,
} from './workspace-secret-tier-rules';

export {
  EXTERNAL_APP_REGISTRY_CONFIG_FIELDS,
  WORKSPACE_CREDENTIAL_SECRET_NAMES,
  WORKSPACE_SECRET_TIER_RULES,
  WORKSPACE_SERVER_ONLY_CONFIG_SECRET_NAMES,
  type WorkspaceSecretTier,
  type WorkspaceSecretTierRule,
  type WorkspaceSecretValueType,
} from './workspace-secret-tier-rules';

export interface WorkspaceSecretPolicy {
  tier: WorkspaceSecretTier;
  type: WorkspaceSecretValueType;
  /**
   * Whether the value may be returned to an authorized client. Always false for
   * the credential tier; also false for credential-grade config values that
   * Postgres must read (for example the managed cron token).
   */
  clientVisible: boolean;
}

const CREDENTIAL: WorkspaceSecretPolicy = {
  clientVisible: false,
  tier: 'credential',
  type: 'string',
};

/** Classifies a name by the shared tier rules; unmatched names are credential. */
export function getWorkspaceSecretPolicy(
  name: string | null | undefined
): WorkspaceSecretPolicy {
  const normalized = name?.trim() ?? '';
  if (!normalized) return CREDENTIAL;

  const rule = matchWorkspaceSecretTierRule(normalized);
  if (!rule) return CREDENTIAL;
  return {
    clientVisible: rule.clientVisible,
    tier: rule.tier,
    type: rule.type,
  };
}

export function getWorkspaceSecretTier(
  name: string | null | undefined
): WorkspaceSecretTier {
  return getWorkspaceSecretPolicy(name).tier;
}

/** True when a value for `name` may be returned to an authorized client. */
export function isWorkspaceSecretValueClientVisible(
  name: string | null | undefined
) {
  return getWorkspaceSecretPolicy(name).clientVisible;
}

export interface MaskedWorkspaceSecretFields {
  tier: WorkspaceSecretTier;
  /** Whether a non-empty value is stored. */
  value_set: boolean;
  /** True when `value` was withheld from this response. */
  value_masked: boolean;
}

export type ClientWorkspaceSecret<T extends { name: string; value: unknown }> =
  Omit<T, 'value'> & MaskedWorkspaceSecretFields & { value: string | null };

/**
 * Prepares a stored row for a client response. Hidden values become `null`;
 * `value_set` still tells the client whether one is stored.
 */
export function toClientWorkspaceSecret<
  T extends { name: string; value: string | null },
>(row: T): ClientWorkspaceSecret<T> {
  const policy = getWorkspaceSecretPolicy(row.name);
  const valueSet = typeof row.value === 'string' && row.value.length > 0;
  return {
    ...row,
    tier: policy.tier,
    value: policy.clientVisible ? row.value : null,
    value_masked: !policy.clientVisible,
    value_set: valueSet,
  };
}

/**
 * A `keepValue` update must not move a hidden value under a name whose value
 * clients may read.
 */
export function canKeepWorkspaceSecretValueOnRename(
  fromName: string,
  toName: string
) {
  if (fromName === toName) return true;
  return (
    isWorkspaceSecretValueClientVisible(fromName) ||
    !isWorkspaceSecretValueClientVisible(toName)
  );
}
