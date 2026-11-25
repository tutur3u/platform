import { randomUUID } from 'node:crypto';
import type {
  FeatureFlagApiResult,
  FeatureFlagEnvironment,
  FeatureFlagMode,
  FeatureFlagRule,
  FeatureFlagRuleBody,
  FeatureFlagRuleCursor,
  FeatureFlagScope,
} from '../platform-feature-flags';
import { getInfrastructureOrigin } from '../platform-devbox-fleet';
import { FeatureFlagsAdminClient } from '../platform-feature-flags';
import type { TuturuuuUserClient } from '../platform';
import { type FlagValue, getFlag, isDryRun, parseCsv } from './args';

// `ttr flags`: platform admin control of runtime feature flag rules. The
// server authorizes every call from the session token; a rule write also
// carries a compare-and-swap revision, an idempotent operation id and a reason
// that lands in the audit log.
//
// Exit codes: 0 ok, 1 usage or validation, 2 revision conflict, 3 forbidden,
// 4 not found, 5 store unavailable.

export const FLAGS_EXIT = {
  conflict: 2,
  forbidden: 3,
  notFound: 4,
  ok: 0,
  rejected: 6,
  unavailable: 5,
  usage: 1,
} as const;

type Options = {
  /** Test seam; defaults to the admin client of the signed-in session. */
  api?: FeatureFlagsAdminClient;
  client: TuturuuuUserClient;
  flags: Record<string, FlagValue>;
  json: boolean;
  out?: (text: string) => void;
  positionals: string[];
};

const MODES: readonly FeatureFlagMode[] = ['on', 'off', 'staff', 'rollout'];
const ENVIRONMENTS: readonly FeatureFlagEnvironment[] = [
  'development',
  'production',
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

class UsageError extends Error {}

function api(options: Options) {
  if (options.api) return options.api;
  // The rule routes live in the infrastructure app, not on the platform origin.
  const base = options.client.getClientOptions().baseUrl;
  options.api = new FeatureFlagsAdminClient(
    options.client.getClientOptions(getInfrastructureOrigin(base ?? ''))
  );
  return options.api;
}

function exitCodeFor(status: number, error: string) {
  // Only a stale revision is safe to retry after a re-read; the other 409s
  // (operation id reuse, subject being erased) need an operator.
  if (status === 409) {
    return error === 'conflict' ? FLAGS_EXIT.conflict : FLAGS_EXIT.rejected;
  }
  if (status === 401 || status === 403) return FLAGS_EXIT.forbidden;
  if (status === 404) return FLAGS_EXIT.notFound;
  if (status >= 500) return FLAGS_EXIT.unavailable;
  return FLAGS_EXIT.usage;
}

function fail(
  options: Options,
  result: Extract<FeatureFlagApiResult<unknown>, { ok: false }>
) {
  const payload = {
    error: result.error,
    ok: false,
    ...(result.revision === undefined || result.revision === null
      ? {}
      : { revision: result.revision }),
  };
  emit(
    options,
    payload,
    `Error: ${result.error}${
      payload.revision === undefined
        ? ''
        : ` (current revision ${payload.revision})`
    }\n`
  );
  process.exitCode = exitCodeFor(result.status, result.error);
}

function emit(options: Options, value: unknown, text: string) {
  const write = options.out ?? ((chunk: string) => process.stdout.write(chunk));
  write(options.json ? `${JSON.stringify(value)}\n` : text);
}

function environmentOf(flags: Options['flags']): FeatureFlagEnvironment {
  const value = getFlag(flags, 'env') ?? 'production';
  if (!ENVIRONMENTS.includes(value as FeatureFlagEnvironment))
    throw new UsageError('--env must be production or development.');
  return value as FeatureFlagEnvironment;
}

function subjectOf(flags: Options['flags']): {
  scope: FeatureFlagScope;
  subjectId: string | null;
} {
  const workspace = getFlag(flags, 'workspace');
  const user = getFlag(flags, 'user');
  const explicit = getFlag(flags, 'scope');
  if (workspace && user)
    throw new UsageError('Use --workspace or --user, not both.');
  const scope = (explicit ??
    (workspace ? 'workspace' : user ? 'user' : 'platform')) as FeatureFlagScope;
  if (!['platform', 'workspace', 'user'].includes(scope))
    throw new UsageError('--scope must be platform, workspace or user.');
  const subjectId =
    scope === 'workspace' ? workspace : scope === 'user' ? user : null;
  if (scope === 'platform' && (workspace || user))
    throw new UsageError('A platform rule has no --workspace or --user.');
  if (scope !== 'platform') {
    if (!subjectId)
      throw new UsageError(`--scope ${scope} needs --${scope} <uuid>.`);
    if (!UUID.test(subjectId))
      throw new UsageError(`--${scope} must be a UUID.`);
  }
  return { scope, subjectId: subjectId ?? null };
}

/** Strips terminal control characters from text written by another admin. */
function printable(text: string) {
  return text.replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ');
}

function ruleText(rule: FeatureFlagRuleBody | null) {
  if (!rule || rule.mode === null) return 'unset';
  if (rule.mode === 'rollout') {
    const allow = [
      rule.allowWorkspaceIds?.length
        ? `${rule.allowWorkspaceIds.length} workspaces`
        : '',
      rule.allowUserIds?.length ? `${rule.allowUserIds.length} users` : '',
    ].filter(Boolean);
    return `rollout ${rule.percentage ?? 0}%${allow.length ? ` + ${allow.join(', ')}` : ''}`;
  }
  return rule.mode;
}

function rowText(row: FeatureFlagRule) {
  const subject = row.subjectId ? `${row.scope}:${row.subjectId}` : row.scope;
  return `${row.flagKey}  ${subject}  ${row.environment}  ${ruleText(row.rule)}  rev ${row.revision}`;
}

function sameSubject(
  row: FeatureFlagRule,
  scope: string,
  subjectId: string | null
) {
  return row.scope === scope && row.subjectId === subjectId;
}

async function findRule(
  options: Options,
  flagKey: string,
  environment: FeatureFlagEnvironment,
  scope: FeatureFlagScope,
  subjectId: string | null
) {
  let after: FeatureFlagRuleCursor | undefined;
  for (let page = 0; page < 100; page += 1) {
    const result = await api(options).rules({
      environment,
      flagKey,
      ...(after ? { after } : {}),
    });
    if (!result.ok) return result;
    const hit = result.data.rules.find((row) =>
      sameSubject(row, scope, subjectId)
    );
    if (hit) return { data: hit, ok: true as const, status: 200 };
    if (!result.data.nextCursor) break;
    after = result.data.nextCursor;
    if (page === 99)
      return {
        error: 'rule_scan_incomplete',
        ok: false as const,
        status: 503,
      };
  }
  return { data: null, ok: true as const, status: 200 };
}

async function list(options: Options) {
  const { flags } = options;
  const environment = environmentOf(flags);
  const scopeFilter = getFlag(flags, 'scope');
  const subject = getFlag(flags, 'workspace') ?? getFlag(flags, 'user');
  const flagKey = getFlag(flags, 'flag') ?? options.positionals[1];
  const rows: FeatureFlagRule[] = [];
  let after: FeatureFlagRuleCursor | undefined;
  for (let page = 0; page < 100; page += 1) {
    const result = await api(options).rules({
      environment,
      ...(flagKey ? { flagKey } : {}),
      ...(after ? { after } : {}),
    });
    if (!result.ok) return fail(options, result);
    rows.push(...result.data.rules);
    if (
      !result.data.nextCursor ||
      !(flags.all === true || scopeFilter || subject)
    )
      break;
    after = result.data.nextCursor;
  }
  const shown = rows.filter(
    (row) =>
      (!scopeFilter || row.scope === scopeFilter) &&
      (!subject || row.subjectId === subject)
  );
  emit(
    options,
    { ok: true, rules: shown },
    shown.length ? `${shown.map(rowText).join('\n')}\n` : 'No stored rules.\n'
  );
}

async function get(options: Options) {
  const key = options.positionals[1];
  if (!key) throw new UsageError('Missing flag key.');
  const environment = environmentOf(options.flags);
  const { scope, subjectId } = subjectOf(options.flags);
  const found = await findRule(options, key, environment, scope, subjectId);
  if (!found.ok) return fail(options, found);
  if (!found.data) {
    emit(
      options,
      { error: 'not_found', ok: false },
      `No stored rule for ${key}.\n`
    );
    process.exitCode = FLAGS_EXIT.notFound;
    return;
  }
  emit(options, { ok: true, rule: found.data }, `${rowText(found.data)}\n`);
}

function writeInput(options: Options, unset: boolean) {
  const { flags } = options;
  const key = options.positionals[1];
  if (!key) throw new UsageError('Missing flag key.');
  const environment = environmentOf(flags);
  const { scope, subjectId } = subjectOf(flags);
  const reason = getFlag(flags, 'reason')?.trim();
  if (!reason)
    throw new UsageError('Missing --reason "<text>" (kept in the audit log).');
  const mode = unset ? null : getFlag(flags, 'mode');
  if (!unset && !MODES.includes(mode as FeatureFlagMode))
    throw new UsageError('--mode must be on, off, staff or rollout.');
  const percent = getFlag(flags, 'percent');
  const allowWorkspaces = getFlag(flags, 'allow-workspaces');
  const allowUsers = getFlag(flags, 'allow-users');
  if (mode !== 'rollout' && (percent || allowWorkspaces || allowUsers))
    throw new UsageError('--percent and allow-lists need --mode rollout.');
  if (mode === 'rollout' && percent === undefined)
    throw new UsageError('--mode rollout needs --percent 0..100.');
  const operationId = getFlag(flags, 'operation-id') ?? randomUUID();
  if (!UUID.test(operationId))
    throw new UsageError('--operation-id must be a UUID.');
  const expected = getFlag(flags, 'expected-revision');
  if (expected !== undefined && !/^\d+$/u.test(expected))
    throw new UsageError('--expected-revision must be a non-negative integer.');
  return {
    allowUserIds: allowUsers ? parseCsv(allowUsers) : undefined,
    allowWorkspaceIds: allowWorkspaces ? parseCsv(allowWorkspaces) : undefined,
    environment,
    expectedRevision: expected === undefined ? null : Number(expected),
    flagKey: key,
    mode: (mode ?? null) as FeatureFlagMode | null,
    operationId,
    percentage: percent === undefined ? undefined : Number(percent),
    reason,
    scope,
    subjectId,
  };
}

async function write(options: Options, unset: boolean) {
  const input = writeInput(options, unset);
  if (input.environment === 'production' && !isDryRun(options.flags)) {
    if (getFlag(options.flags, 'confirm') !== input.flagKey)
      throw new UsageError(
        `Production writes need --confirm ${input.flagKey}. Add --dry-run to preview.`
      );
  }
  let expectedRevision = input.expectedRevision;
  if (expectedRevision === null) {
    const current = await findRule(
      options,
      input.flagKey,
      input.environment,
      input.scope,
      input.subjectId
    );
    if (!current.ok) return fail(options, current);
    expectedRevision = current.data?.revision ?? 0;
  }
  const request = { ...input, expectedRevision };
  if (isDryRun(options.flags)) {
    emit(
      options,
      { dryRun: true, ok: true, request },
      `Dry run: ${unset ? 'unset' : `set ${ruleText({ mode: request.mode, percentage: request.percentage ?? null })}`} ${request.flagKey} (${request.scope}${request.subjectId ? `:${request.subjectId}` : ''}, ${request.environment}) at revision ${expectedRevision}.\n`
    );
    return;
  }
  const result = await api(options).setRule(request);
  if (!result.ok) return fail(options, result);
  emit(
    options,
    {
      environment: result.data.environment,
      key: result.data.flagKey,
      mode: result.data.newRule?.mode ?? null,
      ok: true,
      operationId: result.data.operationId,
      revision: result.data.revision,
      scope: result.data.scope,
      status: result.data.status,
      subjectId: result.data.subjectId,
    },
    `${result.data.status}: ${result.data.flagKey} is ${ruleText(result.data.newRule)} (revision ${result.data.revision}).\n`
  );
}

async function audit(options: Options) {
  const limit = getFlag(options.flags, 'limit');
  if (limit !== undefined && !/^\d+$/u.test(limit))
    throw new UsageError('--limit must be a positive integer.');
  const flagKey = options.positionals[1];
  const result = await api(options).audit({
    ...(limit ? { limit: Number(limit) } : {}),
    ...(getFlag(options.flags, 'before')
      ? { before: getFlag(options.flags, 'before') }
      : {}),
    ...(getFlag(options.flags, 'before-id')
      ? { beforeId: getFlag(options.flags, 'before-id') }
      : {}),
  });
  if (!result.ok) return fail(options, result);
  const rows = flagKey
    ? result.data.rows.filter((row) => row.flagKey === flagKey)
    : result.data.rows;
  emit(
    options,
    { ok: true, rows },
    rows.length
      ? `${rows
          .map(
            (row) =>
              `${row.occurredAt}  ${row.flagKey}  ${row.scope}${row.subjectId ? `:${row.subjectId}` : ''}  ${row.environment}  ${ruleText(row.oldRule)} -> ${ruleText(row.newRule)}  [${row.client}] ${printable(row.reason)}`
          )
          .join('\n')}\n`
      : 'No audit rows.\n'
  );
}

export function flagsHelp() {
  return `ttr flags - platform admin control of runtime feature flag rules

  ttr flags list [KEY] [--scope platform|workspace|user] [--workspace ID | --user ID] [--env production|development] [--all] [--json]
  ttr flags get KEY [--workspace ID | --user ID] [--env ...] [--json]
  ttr flags set KEY --mode on|off|staff|rollout [--percent N] [--allow-workspaces a,b] [--allow-users a,b]
                [--workspace ID | --user ID] [--env production] --reason "<text>"
                [--expected-revision N] [--operation-id UUID] [--confirm KEY] [--dry-run] [--json]
  ttr flags unset KEY [--workspace ID | --user ID] [--env ...] --reason "<text>" --confirm KEY [--json]
  ttr flags audit [KEY] [--limit N] [--before ISO --before-id UUID] [--json]

Production writes need --confirm KEY (or --dry-run to preview). Without
--expected-revision the CLI reads the current revision first, so a concurrent
change fails with exit code 2 instead of being overwritten. Retrying a write
with the same --operation-id is safe.

Exit codes: 0 ok, 1 usage or validation, 2 revision conflict (re-read, then
retry), 3 forbidden, 4 not found, 5 store unavailable, 6 rejected (operation id
reused for a different rule, or the subject is being erased). Rules take effect
within about a minute. A script should pass --expected-revision when it must
not overwrite a concurrent change.
`;
}

export async function runFlagsCommand(options: Options) {
  const action = options.positionals[0] ?? 'list';
  try {
    if (action === 'list') return await list(options);
    if (action === 'get') return await get(options);
    if (action === 'set') return await write(options, false);
    if (action === 'unset') return await write(options, true);
    if (action === 'audit') return await audit(options);
    throw new UsageError(`Unknown flags command: ${action}.`);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    emit(options, { error: error.message, ok: false }, `${error.message}\n`);
    process.exitCode = FLAGS_EXIT.usage;
  }
}
