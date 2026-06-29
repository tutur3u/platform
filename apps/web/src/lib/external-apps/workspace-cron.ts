import {
  getBearerAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import {
  getPermissions,
  type PermissionsResult,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { validate as validateUUID } from 'uuid';
import { z } from 'zod';
import { getExternalAppById } from '@/lib/app-coordination/external-apps';
import {
  serverLogger,
  setLogDrainUserContext,
  withRequestLogDrain,
} from '@/lib/infrastructure/log-drain';
import { listEnabledManagedCronDomains } from '@/lib/managed-cron/domain-repository';
import { callManagedCronRpc, ensureRpcArray } from '@/lib/managed-cron/rpc';
import { runExternalManagedCronJobNow } from '@/lib/managed-cron/service';
import {
  getNextManagedCronRunAt,
  validateManagedCronEndpointUrl,
} from '@/lib/managed-cron/validation';

type AdminDb = TypedSupabaseClient;

const WORKSPACE_CRON_READ_SCOPE = 'workspace:cron:read';
const WORKSPACE_CRON_WRITE_SCOPE = 'workspace:cron:write';
const SCOPE_NOT_ALLOWED_ERROR = 'Requested scope is not allowed for this app';
const MANAGED_CRON_ENABLED_SECRET = 'MANAGED_CRON_ENABLED';
const MANAGED_CRON_TOKEN_SECRET = 'EXTERNAL_APP_MANAGED_CRON_TOKEN';

const MANAGED_JOBS = [
  {
    jobKey: 'process-queue',
    name: 'Managed scheduler process queue',
    path: '/api/cron/scans/process-queue',
    schedule: '*/5 * * * *',
  },
  {
    jobKey: 'enqueue-tracked-sources',
    name: 'Managed scheduler enqueue tracked sources',
    path: '/api/cron/scans/enqueue-tracked-sources',
    schedule: '0 * * * *',
  },
] as const;

const setupSchema = z.object({
  callbackBaseUrl: z.string().trim().url().max(512),
  origin: z.string().trim().url().max(512),
  token: z.string().trim().min(32).max(256),
});

const jobPatchSchema = z.object({
  enabled: z.boolean(),
});

type RequiredScope =
  | typeof WORKSPACE_CRON_READ_SCOPE
  | typeof WORKSPACE_CRON_WRITE_SCOPE;

type ManagedCronOperation = 'job_update' | 'run_now' | 'setup' | 'status';

type ManagedCronFailureReason =
  | 'supabase_admin_unavailable'
  | 'schema_not_ready'
  | 'unexpected_error';

const MANAGED_CRON_SUPABASE_ADMIN_ENV_KEYS = [
  'SUPABASE_SERVER_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
] as const;
const MANAGED_CRON_REQUIRED_MIGRATIONS = [
  '20260625232000_managed_workspace_cron.sql',
  '20260628120000_external_app_managed_cron_jobs.sql',
  '20260629160000_managed_cron_private_rpcs.sql',
] as const;
const MANAGED_CRON_SCHEMA_IDENTIFIERS = [
  'external_app_managed_cron_setup',
  'external_app_managed_cron_status',
  'external_app_managed_cron_update_job',
  'external_app_id',
  'external_job_key',
  'managed_cron_claim_due_jobs',
  'managed_cron_whitelisted_domains',
  'workspace_cron_executions',
  'workspace_cron_jobs',
  'workspace_secrets',
] as const;
const MANAGED_CRON_OPERATION_FAILURE_CODES: Record<
  ManagedCronOperation,
  string
> = {
  job_update: 'MANAGED_CRON_JOB_UPDATE_FAILED',
  run_now: 'MANAGED_CRON_RUN_NOW_FAILED',
  setup: 'MANAGED_CRON_SETUP_FAILED',
  status: 'MANAGED_CRON_STATUS_CHECK_FAILED',
};
const MANAGED_CRON_ADMIN_RECOVERY_PATH =
  '/vi/internal/infrastructure/monitoring/cron?focus=cron-runner';

type ManagedCronFailure = {
  code: string;
  developerDebug: {
    operation: ManagedCronOperation;
    reason: ManagedCronFailureReason;
    requiredEnv?: string[];
    requiredMigrations?: string[];
  };
  hint: string;
  reason: ManagedCronFailureReason;
  setupDisabledReason: string;
  status: 500 | 503;
};

export type ExternalAppWorkspaceCronAccess = {
  admin: AdminDb;
  normalizedWorkspaceId: string;
  permissions: PermissionsResult;
  targetApp: {
    allowedWorkspaceIds: string[];
    id: string;
    origins: string[];
  };
  user: {
    email: string | null;
    id: string;
  };
};

type ExternalAppWorkspaceCronStatus = {
  configured: boolean;
  enabled: boolean;
  jobs: Array<{
    active: boolean;
    failureCount: number;
    jobKey: string;
    lastRunAt: string | null;
    lastStatus: string | null;
    name: string;
    nextRunAt: string | null;
    schedule: string;
  }>;
};

function hasScope(scopes: string[], requiredScope: RequiredScope) {
  if (scopes.includes('*') || scopes.includes(requiredScope)) return true;

  return scopes.some(
    (scope) =>
      scope.endsWith(':*') && requiredScope.startsWith(scope.slice(0, -1))
  );
}

function accessError(
  message: string,
  status: 400 | 401 | 403 | 500,
  extra?: Record<string, unknown>
) {
  return {
    ok: false as const,
    response: NextResponse.json({ ...extra, error: message }, { status }),
  };
}

function approvalRequired(extra: Record<string, unknown>) {
  return accessError('Managed scheduler approval required', 403, {
    code: 'CRON_APPROVAL_REQUIRED',
    ...extra,
  });
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : '';
  }
  return typeof error === 'string' ? error : '';
}

function errorName(error: unknown) {
  if (error instanceof Error) return error.name;
  if (typeof error === 'object' && error !== null && 'name' in error) {
    const name = (error as { name?: unknown }).name;
    return typeof name === 'string' ? name : null;
  }
  return null;
}

function postgresErrorCode(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function isManagedCronSupabaseAdminUnavailable(error: unknown) {
  const message = errorMessage(error);
  return (
    message.includes('Missing Supabase URL') ||
    message.includes('Missing Supabase key')
  );
}

function isManagedCronSchemaNotReady(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  const code = postgresErrorCode(error);
  const schemaCode = code
    ? ['3F000', '42703', '42P01', '42704', 'PGRST202'].includes(code)
    : false;
  const schemaMessage =
    /column|function|relation|rpc|schema|table/u.test(message) &&
    /does not exist|not exist|missing/u.test(message);

  if (!schemaCode && !schemaMessage) return false;
  return MANAGED_CRON_SCHEMA_IDENTIFIERS.some((identifier) =>
    message.includes(identifier)
  );
}

function managedCronFailureForOperation(
  operation: ManagedCronOperation,
  error: unknown
): ManagedCronFailure {
  if (isManagedCronSupabaseAdminUnavailable(error)) {
    const setupDisabledReason =
      'Managed cron Supabase admin access is unavailable. Configure Supabase service-role access for Tuturuuu, then retry.';
    return {
      code: 'MANAGED_CRON_SUPABASE_ADMIN_UNAVAILABLE',
      developerDebug: {
        operation,
        reason: 'supabase_admin_unavailable',
        requiredEnv: [...MANAGED_CRON_SUPABASE_ADMIN_ENV_KEYS],
      },
      hint: `Set Supabase service-role env: ${MANAGED_CRON_SUPABASE_ADMIN_ENV_KEYS.join(', ')}.`,
      reason: 'supabase_admin_unavailable',
      setupDisabledReason,
      status: 503,
    };
  }

  if (isManagedCronSchemaNotReady(error)) {
    const setupDisabledReason =
      'Managed cron database schema is not ready. Apply the managed-cron database migrations, then retry.';
    return {
      code: 'MANAGED_CRON_SCHEMA_NOT_READY',
      developerDebug: {
        operation,
        reason: 'schema_not_ready',
        requiredMigrations: [...MANAGED_CRON_REQUIRED_MIGRATIONS],
      },
      hint: `Apply migrations: ${MANAGED_CRON_REQUIRED_MIGRATIONS.join(', ')}.`,
      reason: 'schema_not_ready',
      setupDisabledReason,
      status: 503,
    };
  }

  const setupDisabledReason =
    'Managed cron operation failed inside Tuturuuu. Check Tuturuuu server logs, then retry.';
  return {
    code: MANAGED_CRON_OPERATION_FAILURE_CODES[operation],
    developerDebug: {
      operation,
      reason: 'unexpected_error',
    },
    hint: 'Check Tuturuuu server logs for the managed-cron operation.',
    reason: 'unexpected_error',
    setupDisabledReason,
    status: 500,
  };
}

function managedCronFailureResponse({
  access,
  error,
  operation,
  request,
  route,
  wsId,
}: {
  access?: ExternalAppWorkspaceCronAccess | null;
  error: unknown;
  operation: ManagedCronOperation;
  request: Request;
  route: string;
  wsId: string;
}) {
  const failure = managedCronFailureForOperation(operation, error);
  const adminRecoveryHref = buildManagedCronAdminRecoveryHref(request);

  serverLogger.error('External app managed cron operation failed', {
    code: failure.code,
    errorName: errorName(error),
    externalAppId: access?.targetApp.id ?? null,
    hint: failure.hint,
    operation,
    postgresCode: postgresErrorCode(error),
    reason: failure.reason,
    route,
    userId: access?.user.id ?? null,
    workspaceId: access?.normalizedWorkspaceId ?? wsId,
  });

  return NextResponse.json(
    {
      adminRecoveryHref,
      adminRecoveryReason: failure.setupDisabledReason,
      code: failure.code,
      configured: false,
      developerDebug: failure.developerDebug,
      enabled: false,
      error: failure.setupDisabledReason,
      jobs: [],
      setupDisabledReason: failure.setupDisabledReason,
    },
    { status: failure.status }
  );
}

function buildManagedCronAdminRecoveryHref(request: Request) {
  return new URL(MANAGED_CRON_ADMIN_RECOVERY_PATH, request.url).toString();
}

function isWorkspaceHandleCandidate(value: string) {
  return /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/u.test(value);
}

async function normalizeWorkspaceIdForUser({
  admin,
  userId,
  wsId,
}: {
  admin: AdminDb;
  userId: string;
  wsId: string;
}) {
  const resolvedWorkspaceId = resolveWorkspaceId(wsId);

  if (resolvedWorkspaceId === ROOT_WORKSPACE_ID) {
    return ROOT_WORKSPACE_ID;
  }

  if (resolvedWorkspaceId.toLowerCase() === PERSONAL_WORKSPACE_SLUG) {
    const { data, error } = await admin
      .from('workspaces')
      .select('id, workspace_members!inner(user_id, type)')
      .eq('personal', true)
      .eq('workspace_members.user_id', userId)
      .eq('workspace_members.type', 'MEMBER')
      .maybeSingle();

    if (error || !data?.id) {
      throw new Error('Personal workspace not found');
    }

    return data.id;
  }

  if (validateUUID(resolvedWorkspaceId)) {
    return resolvedWorkspaceId;
  }

  const handle = resolvedWorkspaceId.trim().toLowerCase();

  if (!isWorkspaceHandleCandidate(handle)) {
    return resolvedWorkspaceId;
  }

  const { data } = await admin
    .from('workspaces')
    .select('id')
    .eq('handle', handle)
    .maybeSingle();

  return data?.id ?? resolvedWorkspaceId;
}

export async function requireExternalAppWorkspaceCronAccess({
  request,
  requiredScopes,
  wsId,
}: {
  request: Request;
  requiredScopes: RequiredScope[];
  wsId: string;
}) {
  const token = getBearerAppCoordinationToken(request);

  if (!token) {
    return accessError('Unauthorized', 401);
  }

  const verification = verifyAppCoordinationToken(token);

  if (!verification.ok) {
    return accessError('Unauthorized', 401);
  }

  for (const requiredScope of requiredScopes) {
    if (!hasScope(verification.claims.scopes, requiredScope)) {
      return accessError(SCOPE_NOT_ALLOWED_ERROR, 403);
    }
  }

  const admin = (await createAdminClient()) as TypedSupabaseClient;
  const app = await getExternalAppById(verification.claims.target_app, admin);

  if (!app?.enabled) {
    return accessError('Forbidden', 403);
  }

  let normalizedWorkspaceId: string;
  try {
    normalizedWorkspaceId = await normalizeWorkspaceIdForUser({
      admin,
      userId: verification.claims.sub,
      wsId,
    });
  } catch {
    return accessError('Forbidden', 403);
  }

  if (!app.allowedWorkspaceIds.includes(normalizedWorkspaceId.toLowerCase())) {
    return approvalRequired({
      missing: ['workspace'],
      workspaceId: normalizedWorkspaceId,
    });
  }

  const membership = await verifyWorkspaceMembershipType({
    requiredType: 'MEMBER',
    supabase: admin,
    userId: verification.claims.sub,
    wsId: normalizedWorkspaceId,
  });

  if (membership.error === 'membership_lookup_failed') {
    return accessError('Failed to verify workspace membership', 500);
  }

  if (!membership.ok) {
    return accessError('Forbidden', 403);
  }

  const permissions = await getPermissions({
    user: {
      email: verification.claims.email,
      id: verification.claims.sub,
    },
    wsId: normalizedWorkspaceId,
  });

  if (
    !permissions ||
    permissions.withoutPermission('manage_workspace_members') ||
    permissions.withoutPermission('manage_workspace_roles')
  ) {
    return accessError('Forbidden', 403);
  }

  return {
    admin,
    normalizedWorkspaceId,
    ok: true as const,
    permissions,
    targetApp: {
      allowedWorkspaceIds: app.allowedWorkspaceIds,
      id: app.id,
      origins: app.origins,
    },
    user: {
      email: verification.claims.email,
      id: verification.claims.sub,
    },
  };
}

export async function handleExternalAppWorkspaceCronRoute({
  handler,
  operation,
  request,
  requiredScopes,
  route,
  wsId,
}: {
  handler: (access: ExternalAppWorkspaceCronAccess) => Promise<Response>;
  operation: ManagedCronOperation;
  request: Request;
  requiredScopes: RequiredScope[];
  route: string;
  wsId: string;
}) {
  return withRequestLogDrain({ request, route }, async () => {
    let access: ExternalAppWorkspaceCronAccess | null = null;

    try {
      const accessResult = await requireExternalAppWorkspaceCronAccess({
        request,
        requiredScopes,
        wsId,
      });

      if (!accessResult.ok) {
        return accessResult.response;
      }

      access = accessResult;
      setLogDrainUserContext({
        userEmail: access.user.email,
        userId: access.user.id,
      });

      return await handler(access);
    } catch (error) {
      return managedCronFailureResponse({
        access,
        error,
        operation,
        request,
        route,
        wsId,
      });
    }
  });
}

export async function loadExternalAppWorkspaceCron(
  access: ExternalAppWorkspaceCronAccess
): Promise<ExternalAppWorkspaceCronStatus> {
  const payload = await callManagedCronRpc<ExternalAppWorkspaceCronStatus>(
    'external_app_managed_cron_status',
    {
      p_enabled_secret: MANAGED_CRON_ENABLED_SECRET,
      p_expected_job_count: MANAGED_JOBS.length,
      p_external_app_id: access.targetApp.id,
      p_token_secret: MANAGED_CRON_TOKEN_SECRET,
      p_ws_id: access.normalizedWorkspaceId,
    }
  );

  return {
    configured: Boolean(payload.configured),
    enabled: Boolean(payload.enabled),
    jobs: ensureRpcArray<ExternalAppWorkspaceCronStatus['jobs'][number]>(
      payload.jobs
    ),
  };
}

export async function setupExternalAppWorkspaceCron({
  access,
  request,
}: {
  access: ExternalAppWorkspaceCronAccess;
  request: Request;
}) {
  const validation = setupSchema.safeParse(
    await request.json().catch(() => null)
  );

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid managed scheduler setup payload' },
      { status: 400 }
    );
  }

  const callbackBaseUrl = new URL(validation.data.callbackBaseUrl);
  callbackBaseUrl.pathname = '';
  callbackBaseUrl.search = '';
  callbackBaseUrl.hash = '';
  const origin = new URL(validation.data.origin).origin;
  const missing: string[] = [];

  if (!access.targetApp.origins.includes(origin)) {
    missing.push('origin');
  }

  const allowedDomains = await listEnabledManagedCronDomains();
  const endpointUrls = MANAGED_JOBS.map((job) =>
    new URL(job.path, callbackBaseUrl).toString()
  );
  const invalidEndpoint = endpointUrls
    .map((endpointUrl) =>
      validateManagedCronEndpointUrl(endpointUrl, allowedDomains)
    )
    .find((result) => !result.ok);

  if (invalidEndpoint) {
    missing.push('domain');
  }

  if (missing.length > 0) {
    return approvalRequired({
      missing: [...new Set(missing)].sort(),
      origin,
      workspaceId: access.normalizedWorkspaceId,
    }).response;
  }

  const status = await callManagedCronRpc<ExternalAppWorkspaceCronStatus>(
    'external_app_managed_cron_setup',
    {
      p_enabled_secret: MANAGED_CRON_ENABLED_SECRET,
      p_external_app_id: access.targetApp.id,
      p_jobs: MANAGED_JOBS.map((job) => ({
        endpointUrl: new URL(job.path, callbackBaseUrl).toString(),
        headersConfig: [
          { name: 'Authorization', secretName: MANAGED_CRON_TOKEN_SECRET },
        ],
        jobKey: job.jobKey,
        name: job.name,
        nextRunAt: getNextManagedCronRunAt(job.schedule).toISOString(),
        retryCount: 1,
        schedule: job.schedule,
        timeoutMs: 15000,
      })),
      p_token_secret: MANAGED_CRON_TOKEN_SECRET,
      p_token_value: `Bearer ${validation.data.token}`,
      p_ws_id: access.normalizedWorkspaceId,
    }
  );

  return NextResponse.json({
    configured: Boolean(status.configured),
    enabled: Boolean(status.enabled),
    jobs: ensureRpcArray<ExternalAppWorkspaceCronStatus['jobs'][number]>(
      status.jobs
    ),
  });
}

export async function updateExternalAppWorkspaceCronJob({
  access,
  jobKey,
  request,
}: {
  access: ExternalAppWorkspaceCronAccess;
  jobKey: string;
  request: Request;
}) {
  const validation = jobPatchSchema.safeParse(
    await request.json().catch(() => null)
  );

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid managed scheduler job payload' },
      { status: 400 }
    );
  }

  const job = MANAGED_JOBS.find((entry) => entry.jobKey === jobKey);
  if (!job)
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const updated = await callManagedCronRpc<boolean>(
    'external_app_managed_cron_update_job',
    {
      p_enabled: validation.data.enabled,
      p_external_app_id: access.targetApp.id,
      p_external_job_key: jobKey,
      p_next_run_at: getNextManagedCronRunAt(job.schedule).toISOString(),
      p_ws_id: access.normalizedWorkspaceId,
    }
  );

  if (!updated) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json(await loadExternalAppWorkspaceCron(access));
}

export async function runExternalAppWorkspaceCronJobNow({
  access,
  jobKey,
}: {
  access: ExternalAppWorkspaceCronAccess;
  jobKey: string;
}) {
  const job = MANAGED_JOBS.find((entry) => entry.jobKey === jobKey);
  if (!job)
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const result = await runExternalManagedCronJobNow({
    externalAppId: access.targetApp.id,
    jobKey,
    wsId: access.normalizedWorkspaceId,
  });

  if (!result) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({ result });
}

export const externalAppWorkspaceCronScopes = {
  cronRead: WORKSPACE_CRON_READ_SCOPE,
  cronWrite: WORKSPACE_CRON_WRITE_SCOPE,
} as const;
