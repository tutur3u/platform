import type { RuleEnvironment } from './rule-validation';
import { ruleShapeError } from './rule-validation';
import { RUNTIME_RULE_SCOPES } from './runtime-definition.mjs';
import type { RuntimeRule } from './runtime-evaluate';

export interface RuntimeSnapshot {
  readonly environment: RuleEnvironment;
  readonly version: string;
  readonly rules: readonly LiveRuntimeRule[];
}

interface LiveRuntimeRule extends RuntimeRule {
  readonly revision: number;
}

export type RuntimeSnapshotRead =
  | { status: 'ready'; snapshot: RuntimeSnapshot }
  | { status: 'invalid' | 'unavailable' };

export type SnapshotRefresh = RuntimeSnapshotRead | { status: 'unchanged' };

const TTL_MS = 60_000;
const MAX_SNAPSHOT_AGE_MS = 10 * 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLiveRule(value: unknown): value is LiveRuntimeRule {
  return (
    isRecord(value) &&
    typeof value.flagKey === 'string' &&
    value.flagKey.length > 0 &&
    typeof value.revision === 'number' &&
    Number.isSafeInteger(value.revision) &&
    value.revision > 0 &&
    ruleShapeError(
      {
        ...value,
        scope: value.scope,
        subjectId: value.subjectId,
        mode: value.mode,
      },
      RUNTIME_RULE_SCOPES
    ) === null
  );
}

function parseRules(
  value: unknown,
  environment: RuleEnvironment,
  accepts: (rule: LiveRuntimeRule) => boolean
): LiveRuntimeRule[] | null {
  if (
    !isRecord(value) ||
    value.environment !== environment ||
    !Array.isArray(value.rules)
  ) {
    return null;
  }

  const rules: LiveRuntimeRule[] = [];
  const seen = new Set<string>();
  for (const candidate of value.rules) {
    if (!isLiveRule(candidate) || !accepts(candidate)) return null;
    const {
      flagKey,
      scope,
      mode,
      percentage,
      allowUserIds,
      allowWorkspaceIds,
      revision,
    } = candidate;
    const subjectId = candidate.subjectId?.toLowerCase() ?? null;
    const identity = JSON.stringify([flagKey, scope, subjectId]);
    if (seen.has(identity)) return null;
    seen.add(identity);
    rules.push({
      flagKey,
      scope,
      mode,
      subjectId,
      revision,
      ...(percentage == null ? {} : { percentage }),
      ...(allowUserIds == null
        ? {}
        : { allowUserIds: allowUserIds.map((id) => id.toLowerCase()) }),
      ...(allowWorkspaceIds == null
        ? {}
        : {
            allowWorkspaceIds: allowWorkspaceIds.map((id) => id.toLowerCase()),
          }),
    });
  }
  return rules;
}

export function parseRuntimeSnapshot(
  value: unknown,
  environment: RuleEnvironment
): RuntimeSnapshotRead {
  if (
    !isRecord(value) ||
    typeof value.version !== 'string' ||
    !/^[0-9a-f]{32}$/.test(value.version)
  ) {
    return { status: 'invalid' };
  }

  const rules = parseRules(
    value,
    environment,
    (rule) => rule.scope === 'platform'
  );
  if (rules === null) return { status: 'invalid' };
  return {
    status: 'ready',
    snapshot: { environment, version: value.version, rules },
  };
}

export function parseRuntimeSubjectRules(
  value: unknown,
  environment: RuleEnvironment,
  workspaceId: string | null,
  userId: string | null
): readonly RuntimeRule[] | null {
  return parseRules(value, environment, (rule) => {
    const id = rule.subjectId?.toLowerCase();
    return (
      (rule.scope === 'workspace' && id === workspaceId) ||
      (rule.scope === 'user' && id === userId)
    );
  });
}

export function createRuntimeSnapshotCache(
  refresh: (previous: RuntimeSnapshot | null) => Promise<SnapshotRefresh>,
  now: () => number
) {
  let snapshot: RuntimeSnapshot | null = null;
  let knownPlatformFlags = new Set<string>();
  let validatedAt = Number.NEGATIVE_INFINITY;
  let attemptedAt = Number.NEGATIVE_INFINITY;
  let invalid = false;
  let inFlight: Promise<void> | undefined;

  async function settleRefresh() {
    try {
      const read = await refresh(snapshot);
      if (read.status === 'ready') {
        knownPlatformFlags = new Set(
          read.snapshot.rules.map((rule) => rule.flagKey)
        );
        snapshot = read.snapshot;
        validatedAt = now();
        invalid = false;
      } else if (read.status === 'unchanged' && snapshot !== null) {
        validatedAt = now();
      } else if (read.status === 'invalid' || read.status === 'unchanged') {
        snapshot = null;
        invalid = true;
      }
    } catch {
      // An interrupted read follows the same age bound as an unavailable store.
    }
  }

  return {
    async read(): Promise<RuntimeSnapshotRead> {
      if (inFlight) {
        await inFlight;
      } else if (now() - Math.max(attemptedAt, validatedAt) >= TTL_MS) {
        attemptedAt = now();
        inFlight = settleRefresh().finally(() => {
          inFlight = undefined;
        });
        await inFlight;
      }

      if (invalid) return { status: 'invalid' };
      if (snapshot && now() - validatedAt < MAX_SNAPSHOT_AGE_MS) {
        return { status: 'ready', snapshot };
      }
      return { status: 'unavailable' };
    },
    hadPlatformRule: (key: string) => knownPlatformFlags.has(key),
  };
}
