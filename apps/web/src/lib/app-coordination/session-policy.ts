import {
  APP_COORDINATION_SESSION_POLICY_CACHE_TTL_SECONDS,
  APP_COORDINATION_SESSION_POLICY_SECRET_NAME,
  type AppCoordinationSessionPolicy,
  appCoordinationSessionPolicySchema,
  DEFAULT_APP_COORDINATION_SESSION_POLICY,
  parseAppCoordinationSessionPolicy,
  resolveInternalAppSessionPolicy,
} from '@tuturuuu/auth/app-session-policy';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';

type PolicyCacheEntry = {
  expiresAtMs: number;
  policy: AppCoordinationSessionPolicy;
  source: AppCoordinationSessionPolicySource;
};

export type AppCoordinationSessionPolicySource =
  | 'default'
  | 'environment'
  | 'secret';

export type AppCoordinationSessionPolicyResult = {
  policy: AppCoordinationSessionPolicy;
  source: AppCoordinationSessionPolicySource;
};

let cachedPolicy: PolicyCacheEntry | null = null;

function parseJson(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseEnvInteger(name: string) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function getEnvironmentFallbackPolicy() {
  const candidate = {
    ...DEFAULT_APP_COORDINATION_SESSION_POLICY,
    browserRefreshReplayGraceSeconds: parseEnvInteger(
      'TUTURUUU_BROWSER_REFRESH_REPLAY_GRACE_SECONDS'
    ),
    cliAccessTtlSeconds: parseEnvInteger('TUTURUUU_CLI_ACCESS_TTL_SECONDS'),
    cliRefreshTtlSeconds: parseEnvInteger('TUTURUUU_CLI_REFRESH_TTL_SECONDS'),
    externalAppBearerTtlSeconds: parseEnvInteger(
      'TUTURUUU_APP_COORDINATION_TOKEN_TTL_SECONDS'
    ),
    internalAppAccessTtlSeconds: parseEnvInteger(
      'TUTURUUU_INTERNAL_APP_ACCESS_TTL_SECONDS'
    ),
    internalAppRefreshEarlySeconds: parseEnvInteger(
      'TUTURUUU_INTERNAL_APP_REFRESH_EARLY_SECONDS'
    ),
    internalAppRefreshTtlSeconds: parseEnvInteger(
      'TUTURUUU_INTERNAL_APP_REFRESH_TTL_SECONDS'
    ),
  };
  const withoutUndefined = Object.fromEntries(
    Object.entries(candidate).filter(([, value]) => value !== undefined)
  );
  const parsed = appCoordinationSessionPolicySchema.safeParse(withoutUndefined);

  if (parsed.success) {
    return {
      policy: parsed.data,
      source:
        Object.keys(withoutUndefined).length > 1
          ? ('environment' as const)
          : ('default' as const),
    };
  }

  return {
    policy: DEFAULT_APP_COORDINATION_SESSION_POLICY,
    source: 'default' as const,
  };
}

async function readPolicySecretValue(db?: TypedSupabaseClient) {
  const sbAdmin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { data, error } = await sbAdmin
    .from('workspace_secrets')
    .select('value')
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .eq('name', APP_COORDINATION_SESSION_POLICY_SECRET_NAME)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.value ?? null;
}

async function resolvePolicyFromSecret(db?: TypedSupabaseClient) {
  const value = await readPolicySecretValue(db);
  const parsedJson = parseJson(value);
  const parsedPolicy =
    parsedJson === null
      ? null
      : appCoordinationSessionPolicySchema.safeParse(parsedJson);

  if (parsedPolicy?.success) {
    return {
      policy: parsedPolicy.data,
      source: 'secret' as const,
    };
  }

  return getEnvironmentFallbackPolicy();
}

export function clearAppCoordinationSessionPolicyCache() {
  cachedPolicy = null;
}

export async function getAppCoordinationSessionPolicy({
  bypassCache = false,
  db,
  now = new Date(),
}: {
  bypassCache?: boolean;
  db?: TypedSupabaseClient;
  now?: Date;
} = {}): Promise<AppCoordinationSessionPolicyResult> {
  if (
    !db &&
    !bypassCache &&
    cachedPolicy &&
    cachedPolicy.expiresAtMs > now.getTime()
  ) {
    return {
      policy: cachedPolicy.policy,
      source: cachedPolicy.source,
    };
  }

  const resolved = await resolvePolicyFromSecret(db);

  if (!db) {
    cachedPolicy = {
      expiresAtMs:
        now.getTime() +
        APP_COORDINATION_SESSION_POLICY_CACHE_TTL_SECONDS * 1000,
      policy: resolved.policy,
      source: resolved.source,
    };
  }

  return resolved;
}

export async function getInternalAppSessionPolicyForApp(appId: string) {
  const { policy } = await getAppCoordinationSessionPolicy();
  return resolveInternalAppSessionPolicy(policy, appId);
}

export async function getExternalAppBearerTtlSeconds() {
  const { policy } = await getAppCoordinationSessionPolicy();
  return policy.externalAppBearerTtlSeconds;
}

export async function getCliAppSessionPolicy() {
  const { policy } = await getAppCoordinationSessionPolicy();

  return {
    cliAccessTtlSeconds: policy.cliAccessTtlSeconds,
    cliRefreshTtlSeconds: policy.cliRefreshTtlSeconds,
  };
}

export async function saveAppCoordinationSessionPolicy({
  db,
  policy,
}: {
  db?: TypedSupabaseClient;
  policy: unknown;
}) {
  const parsedPolicy = parseAppCoordinationSessionPolicy(policy);
  const sbAdmin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { error: deleteError } = await sbAdmin
    .from('workspace_secrets')
    .delete()
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .eq('name', APP_COORDINATION_SESSION_POLICY_SECRET_NAME);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const { error: insertError } = await sbAdmin
    .from('workspace_secrets')
    .insert({
      name: APP_COORDINATION_SESSION_POLICY_SECRET_NAME,
      value: JSON.stringify(parsedPolicy),
      ws_id: ROOT_WORKSPACE_ID,
    });

  if (insertError) {
    throw new Error(insertError.message);
  }

  clearAppCoordinationSessionPolicyCache();

  return parsedPolicy;
}
