import { featureFlagCatalog } from './catalog';
import type { CatalogFlag } from './lifecycle.mjs';
import {
  isIncluded,
  isUuid,
  RULE_ENVIRONMENTS,
  type RuleEnvironment,
} from './rule-validation';
import type { RuntimeEnvironment } from './runtime-environment';
import { evaluateRuntimeFlag, type RuntimeDecision } from './runtime-evaluate';
import type { PrivateRpc } from './runtime-rpc';
import {
  createRuntimeSnapshotCache,
  parseRuntimeSnapshot,
  parseRuntimeSubjectRules,
  type RuntimeSnapshotRead,
} from './runtime-snapshot';

export interface RuntimeReaderContext {
  readonly environment: RuntimeEnvironment;
  readonly workspaceId?: string | null;
  readonly userId?: string | null;
  readonly isStaff?: boolean;
}

export interface RuntimeReaderOptions {
  readonly rpc: PrivateRpc;
  readonly now?: () => number;
  readonly readEnv?: (name: string) => string | undefined;
  readonly flags?: readonly CatalogFlag[];
}

export function denyRuntimeFlag(reason: string): RuntimeDecision {
  return { enabled: false, source: 'invalid-rules', trace: [reason] };
}

export async function readRuntimePlatformSnapshot(
  rpc: PrivateRpc,
  environment: RuleEnvironment
): Promise<RuntimeSnapshotRead> {
  try {
    const result = await rpc('feature_flag_read_snapshot', {
      p_environment: environment,
    });
    if (result.error) return { status: 'unavailable' };
    return parseRuntimeSnapshot(result.data, environment);
  } catch {
    return { status: 'unavailable' };
  }
}

export function createRuntimeReader({
  rpc,
  readEnv,
  flags = featureFlagCatalog.flags,
  now = Date.now,
}: RuntimeReaderOptions) {
  const catalog = new Map(flags.map((flag) => [flag.key, flag]));
  const caches = new Map(
    RULE_ENVIRONMENTS.map((environment) => [
      environment,
      createRuntimeSnapshotCache(
        () => readRuntimePlatformSnapshot(rpc, environment),
        now
      ),
    ])
  );

  async function evaluateFlags(
    keys: readonly string[],
    {
      environment,
      workspaceId: workspace,
      userId: user,
      isStaff = false,
    }: RuntimeReaderContext
  ): Promise<ReadonlyMap<string, RuntimeDecision>> {
    const entries = [...new Set(keys)].map((key) => {
      const flag = catalog.get(key);
      return { key, flag: flag?.family === 'runtime' ? flag : undefined };
    });
    if (
      (workspace != null && !isUuid(workspace)) ||
      (user != null && !isUuid(user))
    ) {
      return new Map(
        entries.map(({ key }) => [key, denyRuntimeFlag('invalid subject ID')])
      );
    }
    const workspaceId = workspace?.toLowerCase() ?? null;
    const userId = user?.toLowerCase() ?? null;
    const context = { workspaceId, userId, isStaff };
    const needsWorkspace = (flag: CatalogFlag | undefined) =>
      workspaceId !== null && flag?.runtime?.scopes.includes('workspace');
    const needsUser = (flag: CatalogFlag | undefined) =>
      userId !== null && flag?.runtime?.scopes.includes('user');
    const p_workspace_id = entries.some(({ flag }) => needsWorkspace(flag))
      ? workspaceId
      : null;
    const p_user_id = entries.some(({ flag }) => needsUser(flag))
      ? userId
      : null;

    const cache = isIncluded(RULE_ENVIRONMENTS, environment)
      ? caches.get(environment)
      : undefined;
    const snapshot = entries.some(({ flag }) => flag)
      ? await cache?.read()
      : undefined;

    const subjectRules = await (async () => {
      if (p_workspace_id === null && p_user_id === null) return [];
      if (
        !isIncluded(RULE_ENVIRONMENTS, environment) ||
        snapshot?.status === 'invalid'
      )
        return null;
      try {
        const { data, error } = await rpc('feature_flag_read_subject_rules', {
          p_environment: environment,
          p_workspace_id,
          p_user_id,
        });
        return error
          ? null
          : parseRuntimeSubjectRules(
              data,
              environment,
              p_workspace_id,
              p_user_id
            );
      } catch {
        return null;
      }
    })();

    return new Map(
      entries.map(({ key, flag }) => {
        if (!flag?.runtime)
          return [key, denyRuntimeFlag('unknown runtime flag')];
        if (snapshot?.status === 'invalid')
          return [key, denyRuntimeFlag('malformed platform snapshot')];

        const needsSubject = needsWorkspace(flag) || needsUser(flag);
        if (needsSubject && subjectRules === null) {
          return [key, denyRuntimeFlag('subject rules unavailable')];
        }

        const fallback = flag.runtime.envFallback;
        const envValue = fallback === null ? undefined : readEnv?.(fallback);
        if (snapshot?.status !== 'ready') {
          if (
            cache?.hadPlatformRule(key) ||
            (needsSubject && subjectRules?.some((rule) => rule.flagKey === key))
          ) {
            return [key, denyRuntimeFlag('platform snapshot unavailable')];
          }
          return [
            key,
            evaluateRuntimeFlag({ flag, context, rules: null, envValue }),
          ];
        }

        const rules = needsSubject
          ? [...snapshot.snapshot.rules, ...(subjectRules ?? [])]
          : snapshot.snapshot.rules;
        return [key, evaluateRuntimeFlag({ flag, context, rules, envValue })];
      })
    );
  }

  return {
    evaluateFlags,
    async evaluateFlag(
      key: string,
      context: RuntimeReaderContext
    ): Promise<RuntimeDecision> {
      const decisions = await evaluateFlags([key], context);
      return decisions.get(key) ?? denyRuntimeFlag('unknown runtime flag');
    },
  };
}
