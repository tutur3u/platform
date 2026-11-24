/**
 * The tier rules for workspace secret names, as data, so TypeScript and
 * Postgres classify names from one table. The migration that creates
 * `private.workspace_secret_name_tiers` seeds exactly these rows, and a test
 * keeps the two equal.
 *
 * Rules apply in ascending `priority`; the first match wins and a name no rule
 * matches is `credential`. `pattern` rules use only syntax that JavaScript
 * regular expressions and Postgres `~` read the same way: anchors, `[...]`,
 * `[^...]`, `+`, `?`, `|` and plain groups.
 */

export type WorkspaceSecretTier = 'config' | 'credential';

export type WorkspaceSecretValueType = 'boolean' | 'json' | 'number' | 'string';

export type WorkspaceSecretTierRuleKind = 'exact' | 'pattern' | 'prefix';

export interface WorkspaceSecretTierRule {
  priority: number;
  kind: WorkspaceSecretTierRuleKind;
  match: string;
  tier: WorkspaceSecretTier;
  clientVisible: boolean;
  type: WorkspaceSecretValueType;
}

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

/** Non-secret external app registry fields; `secretHash` stays credential. */
export const EXTERNAL_APP_REGISTRY_CONFIG_FIELDS = [
  'allowedScopes',
  'allowedWorkspaceIds',
  'callbackPaths',
  'createdAt',
  'createdBy',
  'displayName',
  'enabled',
  'logoUrl',
  'maxBearerTtlSeconds',
  'origins',
  'requirePkce',
  'secretIssuedAt',
  'secretLastFour',
  'updatedAt',
  'updatedBy',
] as const;

const CONFIG_EXACT: ReadonlyArray<
  readonly [name: string, type: WorkspaceSecretValueType]
> = [
  ['AUTO_SEND_APPROVED_REPORTS', 'boolean'],
  ['DRIVE_AUTO_EXTRACT_PROXY_URL', 'string'],
  ['DRIVE_AUTO_EXTRACT_ZIP', 'boolean'],
  ['DRIVE_R2_BUCKET', 'string'],
  ['DRIVE_R2_ENDPOINT', 'string'],
  ['DRIVE_STORAGE_PROVIDER', 'string'],
  ['EXTERNAL_PROJECT_CANONICAL_ID', 'string'],
  ['EXTERNAL_PROJECT_ENABLED', 'boolean'],
  ['FINANCE_SHOW_INVOICES', 'boolean'],
  ['MANAGED_CRON_ENABLED', 'boolean'],
  ['MOBILE_HIDDEN_MODULES', 'json'],
  ['MOBILE_HIDE_EXPERIMENTAL_MODULES', 'boolean'],
  ['STORAGE_LIMIT_BYTES', 'number'],
];

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
];

/**
 * Registry rows hold one field per name. Only these exact shapes are config;
 * every other registry name, including channel secrets, a secret hash or a
 * field added later, is credential until it is listed here.
 */
const REGISTRY_CONFIG_PATTERNS = [
  // AI_AGENT_REGISTRY:<agent>:meta | :instructions | :instructions:<n>
  '^AI_AGENT_REGISTRY:[^:]+:(meta|instructions(:[0-9]+)?)$',
  // AI_AGENT_REGISTRY:<agent>:channel:<channel>:meta
  '^AI_AGENT_REGISTRY:[^:]+:channel:[^:]+:meta$',
  // AI_AGENT_IDENTITY:<workspace>:zalo:<account>:<user> -> platform user id
  '^AI_AGENT_IDENTITY:[^:]+:zalo:[^:]+:[^:]+$',
  `^EXTERNAL_APP_REGISTRY:[^:]+:(${EXTERNAL_APP_REGISTRY_CONFIG_FIELDS.join('|')})$`,
] as const;

const SESSION_TTL_PATTERN = '^TUTURUUU_[A-Z0-9_]+_SECONDS$';

function rules(): WorkspaceSecretTierRule[] {
  const list: Omit<WorkspaceSecretTierRule, 'priority'>[] = [
    ...WORKSPACE_CREDENTIAL_SECRET_NAMES.map((match) => ({
      clientVisible: false,
      kind: 'exact' as const,
      match,
      tier: 'credential' as const,
      type: 'string' as const,
    })),
    ...WORKSPACE_SERVER_ONLY_CONFIG_SECRET_NAMES.map((match) => ({
      clientVisible: false,
      kind: 'exact' as const,
      match,
      tier: 'config' as const,
      type: 'string' as const,
    })),
    ...REGISTRY_CONFIG_PATTERNS.map((match) => ({
      clientVisible: true,
      kind: 'pattern' as const,
      match,
      tier: 'config' as const,
      type: 'string' as const,
    })),
    ...CONFIG_EXACT.map(([match, type]) => ({
      clientVisible: true,
      kind: 'exact' as const,
      match,
      tier: 'config' as const,
      type,
    })),
    {
      clientVisible: true,
      kind: 'pattern',
      match: SESSION_TTL_PATTERN,
      tier: 'config',
      type: 'number',
    },
    ...CONFIG_PREFIXES.map(([match, type]) => ({
      clientVisible: true,
      kind: 'prefix' as const,
      match,
      tier: 'config' as const,
      type,
    })),
  ];
  return list.map((rule, index) => ({ ...rule, priority: (index + 1) * 10 }));
}

export const WORKSPACE_SECRET_TIER_RULES: readonly WorkspaceSecretTierRule[] =
  Object.freeze(rules());

const compiledPatterns = new Map(
  WORKSPACE_SECRET_TIER_RULES.filter((rule) => rule.kind === 'pattern').map(
    (rule) => [rule.match, new RegExp(rule.match, 'u')]
  )
);

/** The first rule matching an already-normalized name, if any. */
export function matchWorkspaceSecretTierRule(
  name: string
): WorkspaceSecretTierRule | undefined {
  return WORKSPACE_SECRET_TIER_RULES.find((rule) => {
    if (rule.kind === 'exact') return name === rule.match;
    if (rule.kind === 'prefix') return name.startsWith(rule.match);
    return compiledPatterns.get(rule.match)?.test(name) ?? false;
  });
}
