import { connection, type NextRequest, NextResponse } from 'next/server';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
}

function sanitizeSearch(value: string | null) {
  return (value ?? '')
    .trim()
    .replaceAll(/[,%()]/g, '')
    .slice(0, 120);
}

export async function GET(request: NextRequest) {
  await connection();

  const auth = await authorizeInfrastructureAdminRequest(
    'manage_workspace_roles'
  );
  if (!auth.ok) return auth.response;

  const search = sanitizeSearch(request.nextUrl.searchParams.get('q'));
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'));
  let workspacesQuery = auth.sbAdmin
    .from('workspaces')
    .select('id,name')
    .order('name', { ascending: true })
    .limit(limit);

  if (search) {
    workspacesQuery = UUID_PATTERN.test(search)
      ? workspacesQuery.eq('id', search)
      : workspacesQuery.ilike('name', `%${search}%`);
  }

  const { data: workspaces, error: workspacesError } = await workspacesQuery;
  if (workspacesError) {
    console.error('Failed to search AI Studio policy workspaces', {
      code: workspacesError.code,
    });
    return NextResponse.json(
      { message: 'Unable to load workspaces' },
      { status: 500 }
    );
  }

  const workspaceIds = (workspaces ?? []).map((workspace) => workspace.id);
  if (workspaceIds.length === 0) {
    return NextResponse.json([]);
  }

  const { data: policies, error: policiesError } = await auth.sbAdmin
    .schema('private')
    .from('workspace_ai_studio_policies')
    .select(
      'ws_id,allowed_models,denied_models,capture_enabled,metadata_retention_days,content_retention_days,requests_per_minute,monthly_credit_budget,no_training_enforced,api_key_creation_approved,api_key_creation_decided_at,api_key_creation_decided_by'
    )
    .in('ws_id', workspaceIds);

  if (policiesError) {
    console.error('Failed to load AI Studio workspace policies', {
      code: policiesError.code,
    });
    return NextResponse.json(
      { message: 'Unable to load workspace policies' },
      { status: 500 }
    );
  }

  const policiesByWorkspace = new Map(
    (policies ?? []).map((policy) => [policy.ws_id, policy])
  );

  return NextResponse.json(
    (workspaces ?? []).map((workspace) => {
      const policy = policiesByWorkspace.get(workspace.id);
      return {
        allowedModels: policy?.allowed_models ?? [],
        apiKeyCreationApproved: policy?.api_key_creation_approved ?? false,
        apiKeyCreationDecidedAt: policy?.api_key_creation_decided_at ?? null,
        apiKeyCreationDecidedBy: policy?.api_key_creation_decided_by ?? null,
        captureEnabled: policy?.capture_enabled ?? null,
        contentRetentionDays: policy?.content_retention_days ?? null,
        deniedModels: policy?.denied_models ?? [],
        metadataRetentionDays: policy?.metadata_retention_days ?? null,
        monthlyCreditBudget: policy?.monthly_credit_budget
          ? Number(policy.monthly_credit_budget)
          : null,
        noTrainingEnforced: policy?.no_training_enforced ?? true,
        requestsPerMinute: policy?.requests_per_minute ?? null,
        workspaceName: workspace.name ?? '',
        wsId: workspace.id,
      };
    })
  );
}
