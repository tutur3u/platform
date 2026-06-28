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
import { getPlatformSql } from '@/lib/database/platform-sql';
import { listEnabledManagedCronDomainsWithSql } from '@/lib/managed-cron/domain-repository';
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

export async function loadExternalAppWorkspaceCron(
  access: ExternalAppWorkspaceCronAccess
) {
  const sql = getPlatformSql();
  const jobs = await sql<
    Array<{
      active: boolean;
      external_job_key: string;
      failure_count: number;
      last_run_at: string | null;
      last_status: string | null;
      name: string;
      next_run_at: string | null;
      schedule: string;
    }>
  >`
    select
      active,
      external_job_key,
      failure_count,
      last_run_at::text,
      last_status,
      name,
      next_run_at::text,
      schedule
    from public.workspace_cron_jobs
    where ws_id = ${access.normalizedWorkspaceId}
      and external_app_id = ${access.targetApp.id}
      and external_job_key is not null
    order by external_job_key asc
  `;
  const secrets = await sql<Array<{ name: string; value: string | null }>>`
    select name, value
    from public.workspace_secrets
    where ws_id = ${access.normalizedWorkspaceId}
      and name in ${sql([MANAGED_CRON_ENABLED_SECRET, MANAGED_CRON_TOKEN_SECRET])}
  `;
  const enabled = secrets.some(
    (secret) =>
      secret.name === MANAGED_CRON_ENABLED_SECRET &&
      secret.value?.trim().toLowerCase() === 'true'
  );
  const tokenConfigured = secrets.some(
    (secret) => secret.name === MANAGED_CRON_TOKEN_SECRET && secret.value
  );

  return {
    configured: tokenConfigured && jobs.length >= MANAGED_JOBS.length,
    enabled,
    jobs: jobs.map((job) => ({
      active: job.active,
      failureCount: job.failure_count,
      jobKey: job.external_job_key,
      lastRunAt: job.last_run_at,
      lastStatus: job.last_status,
      name: job.name,
      nextRunAt: job.next_run_at,
      schedule: job.schedule,
    })),
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

  const sql = getPlatformSql();
  const allowedDomains = await listEnabledManagedCronDomainsWithSql(sql);
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

  await sql.begin(async (transaction) => {
    await transaction`
      delete from public.workspace_secrets
      where ws_id = ${access.normalizedWorkspaceId}
        and name in ${transaction([
          MANAGED_CRON_ENABLED_SECRET,
          MANAGED_CRON_TOKEN_SECRET,
        ])}
    `;
    await transaction`
      insert into public.workspace_secrets (ws_id, name, value)
      values
        (${access.normalizedWorkspaceId}, ${MANAGED_CRON_ENABLED_SECRET}, 'true'),
        (${access.normalizedWorkspaceId}, ${MANAGED_CRON_TOKEN_SECRET}, ${`Bearer ${validation.data.token}`})
    `;

    for (const job of MANAGED_JOBS) {
      const endpointUrl = new URL(job.path, callbackBaseUrl).toString();
      const headersConfig = JSON.stringify([
        { name: 'Authorization', secretName: MANAGED_CRON_TOKEN_SECRET },
      ]);
      await transaction`
        insert into public.workspace_cron_jobs (
          ws_id,
          name,
          dataset_id,
          schedule,
          url,
          active,
          endpoint_url,
          http_method,
          headers_config,
          timeout_ms,
          retry_count,
          next_run_at,
          external_app_id,
          external_job_key
        )
        values (
          ${access.normalizedWorkspaceId},
          ${job.name},
          null,
          ${job.schedule},
          ${endpointUrl},
          true,
          ${endpointUrl},
          'POST',
          ${headersConfig}::jsonb,
          15000,
          1,
          ${getNextManagedCronRunAt(job.schedule).toISOString()},
          ${access.targetApp.id},
          ${job.jobKey}
        )
        on conflict (ws_id, external_app_id, external_job_key)
        where external_app_id is not null
          and external_job_key is not null
        do update set
          name = excluded.name,
          schedule = excluded.schedule,
          url = excluded.url,
          active = true,
          endpoint_url = excluded.endpoint_url,
          http_method = excluded.http_method,
          headers_config = excluded.headers_config,
          timeout_ms = excluded.timeout_ms,
          retry_count = excluded.retry_count,
          next_run_at = coalesce(public.workspace_cron_jobs.next_run_at, excluded.next_run_at)
      `;
    }
  });

  return NextResponse.json(await loadExternalAppWorkspaceCron(access));
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

  const sql = getPlatformSql();
  const rows = await sql<Array<{ id: string }>>`
    update public.workspace_cron_jobs
    set
      active = ${validation.data.enabled},
      next_run_at = case
        when ${validation.data.enabled} then coalesce(next_run_at, ${getNextManagedCronRunAt(job.schedule).toISOString()})
        else next_run_at
      end
    where ws_id = ${access.normalizedWorkspaceId}
      and external_app_id = ${access.targetApp.id}
      and external_job_key = ${jobKey}
    returning id::text
  `;

  if (!rows[0]) {
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
