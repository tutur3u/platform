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

export type WorkspaceSecretTier = 'config' | 'credential';

export type WorkspaceSecretValueType = 'boolean' | 'json' | 'number' | 'string';

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

type PolicyRule = (name: string) => WorkspaceSecretPolicy | null;

const CONFIG = (type: WorkspaceSecretValueType): WorkspaceSecretPolicy => ({
  clientVisible: true,
  tier: 'config',
  type,
});

const CREDENTIAL: WorkspaceSecretPolicy = {
  clientVisible: false,
  tier: 'credential',
  type: 'string',
};

/** Credential-tier names known today. Unknown names are credential too. */
export const WORKSPACE_CREDENTIAL_SECRET_NAMES = [
  'DRIVE_R2_ACCESS_KEY_ID',
  'DRIVE_R2_SECRET_ACCESS_KEY',
  'DRIVE_AUTO_EXTRACT_PROXY_TOKEN',
  'AI_AGENT_CHAT_SDK_STATE_REDIS_URL',
  'AI_AGENT_DISCORD_GATEWAY_WATCHER_SECRET',
  'mobile_calendar_gateway:v1',
] as const;

/**
 * Config-tier names Postgres reads that are still credential grade, so their
 * values stay server-side.
 */
export const WORKSPACE_SERVER_ONLY_CONFIG_SECRET_NAMES = [
  'EXTERNAL_APP_MANAGED_CRON_TOKEN',
] as const;

const CONFIG_EXACT = new Map<string, WorkspaceSecretValueType>(
  Object.entries({
    AUTO_SEND_APPROVED_REPORTS: 'boolean',
    DRIVE_AUTO_EXTRACT_PROXY_URL: 'string',
    DRIVE_AUTO_EXTRACT_ZIP: 'boolean',
    DRIVE_R2_BUCKET: 'string',
    DRIVE_R2_ENDPOINT: 'string',
    DRIVE_STORAGE_PROVIDER: 'string',
    FINANCE_SHOW_INVOICES: 'boolean',
    MANAGED_CRON_ENABLED: 'boolean',
    MOBILE_HIDDEN_MODULES: 'json',
    MOBILE_HIDE_EXPERIMENTAL_MODULES: 'boolean',
    STORAGE_LIMIT_BYTES: 'number',
  } satisfies Record<string, WorkspaceSecretValueType>)
);

const CONFIG_PREFIXES: ReadonlyArray<
  readonly [prefix: string, type: WorkspaceSecretValueType]
> = [
  ['ENABLE_', 'boolean'],
  ['DISABLE_', 'boolean'],
  ['ALLOW_', 'boolean'],
  ['PREVENT_', 'boolean'],
  ['HIDE_', 'boolean'],
  ['SHOW_', 'boolean'],
  ['RATE_LIMIT_', 'number'],
  ['EMAIL_RATE_LIMIT_', 'number'],
  ['INVITE_RATE_LIMIT_', 'number'],
  ['EXTERNAL_PROJECT_', 'string'],
];

const AI_AGENT_REGISTRY_PREFIX = 'AI_AGENT_REGISTRY:';
const AI_AGENT_IDENTITY_PREFIX = 'AI_AGENT_IDENTITY:';
const EXTERNAL_APP_REGISTRY_PREFIX = 'EXTERNAL_APP_REGISTRY:';
const EXTERNAL_APP_CREDENTIAL_FIELDS = new Set(['secretHash']);
const SESSION_TTL_PATTERN = /^TUTURUUU_[A-Z0-9_]+_SECONDS$/u;

function isAiAgentChannelSecret(name: string) {
  // AI_AGENT_REGISTRY:<agent>:channel:<channel>:secret:<field>
  const parts = name.split(':');
  return parts[2] === 'channel' && parts[4] === 'secret';
}

function isExternalAppCredentialField(name: string) {
  const field = name.split(':')[2];
  return field ? EXTERNAL_APP_CREDENTIAL_FIELDS.has(field) : false;
}

const RULES: PolicyRule[] = [
  (name) =>
    (WORKSPACE_CREDENTIAL_SECRET_NAMES as readonly string[]).includes(name)
      ? CREDENTIAL
      : null,
  (name) =>
    (WORKSPACE_SERVER_ONLY_CONFIG_SECRET_NAMES as readonly string[]).includes(
      name
    )
      ? { clientVisible: false, tier: 'config', type: 'string' }
      : null,
  (name) =>
    name.startsWith(AI_AGENT_REGISTRY_PREFIX) && isAiAgentChannelSecret(name)
      ? CREDENTIAL
      : null,
  (name) =>
    name.startsWith(EXTERNAL_APP_REGISTRY_PREFIX) &&
    isExternalAppCredentialField(name)
      ? CREDENTIAL
      : null,
  (name) =>
    name.startsWith(AI_AGENT_REGISTRY_PREFIX) ||
    name.startsWith(AI_AGENT_IDENTITY_PREFIX) ||
    name.startsWith(EXTERNAL_APP_REGISTRY_PREFIX)
      ? CONFIG('string')
      : null,
  (name) => {
    const type = CONFIG_EXACT.get(name);
    return type ? CONFIG(type) : null;
  },
  (name) => (SESSION_TTL_PATTERN.test(name) ? CONFIG('number') : null),
  (name) => {
    const entry = CONFIG_PREFIXES.find(([prefix]) => name.startsWith(prefix));
    return entry ? CONFIG(entry[1]) : null;
  },
];

export function getWorkspaceSecretPolicy(
  name: string | null | undefined
): WorkspaceSecretPolicy {
  const normalized = name?.trim() ?? '';
  if (!normalized) return CREDENTIAL;

  for (const rule of RULES) {
    const policy = rule(normalized);
    if (policy) return policy;
  }

  return CREDENTIAL;
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
