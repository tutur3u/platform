import { connection, type NextRequest, NextResponse } from 'next/server';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
}

function sanitizeSearch(value: string | null) {
  return (value ?? '').trim().slice(0, 120);
}

function parseCursor(value: string | null) {
  if (!value) return 0;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export async function GET(request: NextRequest) {
  await connection();

  const auth = await authorizeInfrastructureAdminRequest(
    'manage_workspace_roles'
  );
  if (!auth.ok) return auth.response;

  const search = sanitizeSearch(request.nextUrl.searchParams.get('q'));
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'));
  const offset = parseCursor(request.nextUrl.searchParams.get('cursor'));
  if (offset === null) {
    return NextResponse.json(
      { message: 'Invalid workspace cursor' },
      { status: 400 }
    );
  }

  const { data, error } = await auth.sbAdmin
    .schema('private')
    .rpc('search_ai_studio_policy_workspaces', {
      p_limit: limit + 1,
      p_offset: offset,
      p_query: search || undefined,
    });
  if (error) {
    console.error('Failed to search AI Studio policy workspaces', {
      code: error.code,
    });
    return NextResponse.json(
      { message: 'Unable to load workspaces' },
      { status: 500 }
    );
  }

  const page = (data ?? []).slice(0, limit);
  const hasMore = (data?.length ?? 0) > limit;

  return NextResponse.json(
    {
      items: page.map((row) => ({
        allowedModels: row.allowed_models,
        apiKeyCreationApproved: row.api_key_creation_approved,
        apiKeyCreationDecidedAt: row.api_key_creation_decided_at,
        apiKeyCreationDecidedBy: row.api_key_creation_decided_by,
        captureEnabled: row.capture_enabled,
        contentRetentionDays: row.content_retention_days,
        deniedModels: row.denied_models,
        metadataRetentionDays: row.metadata_retention_days,
        monthlyCreditBudget:
          row.monthly_credit_budget === null
            ? null
            : Number(row.monthly_credit_budget),
        noTrainingEnforced: row.no_training_enforced,
        requestsPerMinute: row.requests_per_minute,
        workspaceName: row.workspace_name ?? '',
        wsId: row.ws_id,
      })),
      nextCursor: hasMore ? String(offset + limit) : null,
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
