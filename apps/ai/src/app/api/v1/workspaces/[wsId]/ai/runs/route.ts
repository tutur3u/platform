import type { NextRequest } from 'next/server';
import { connection } from 'next/server';
import { parseAiStudioDateRange } from '@/lib/observability';
import { authorizeAiStudioWorkspaceRequest } from '@/lib/session-api';

const RUN_FIELDS =
  'id, request_id, api_key_id, feature, model_id, status, billed_credits, provider_cost_usd, input_tokens, output_tokens, reasoning_tokens, embedding_units, image_units, latency_ms, first_token_latency_ms, error_class, metadata, created_at, completed_at';
const STATUSES = new Set([
  'reserved',
  'running',
  'succeeded',
  'failed',
  'aborted',
]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const { wsId } = await params;
  const auth = await authorizeAiStudioWorkspaceRequest(wsId, 'use_ai_studio');
  if (!auth.ok) return auth.response;

  const range = parseAiStudioDateRange(request.nextUrl);
  if (!range) {
    return Response.json(
      { error: 'Run range must be valid and no longer than 366 days' },
      { status: 400 }
    );
  }

  const limit = Math.min(
    100,
    Math.max(1, Number(request.nextUrl.searchParams.get('limit')) || 50)
  );
  const status = request.nextUrl.searchParams.get('status');
  const feature = request.nextUrl.searchParams.get('feature')?.slice(0, 120);
  const model = request.nextUrl.searchParams.get('model')?.slice(0, 200);
  const cursor = parseCursor(request.nextUrl.searchParams.get('cursor'));

  if (status && !STATUSES.has(status)) {
    return Response.json({ error: 'Invalid run status' }, { status: 400 });
  }

  let query = auth.sbAdmin
    .schema('private')
    .from('ai_studio_runs')
    .select(RUN_FIELDS)
    .eq('ws_id', auth.workspace.id)
    .gte('created_at', range.from.toISOString())
    .lt('created_at', range.to.toISOString())
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (status) query = query.eq('status', status);
  if (feature) query = query.eq('feature', feature);
  if (model) query = query.eq('model_id', model);
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error('AI Studio runs query failed', {
      code: error.code,
      workspaceId: auth.workspace.id,
    });
    return Response.json({ error: 'Runs unavailable' }, { status: 500 });
  }

  const page = (data ?? []).slice(0, limit);
  const hasMore = (data?.length ?? 0) > limit;
  const last = page.at(-1);

  return Response.json(
    {
      nextCursor: hasMore && last ? `${last.created_at}~${last.id}` : null,
      runs: page.map((run) => ({
        billedCredits: Number(run.billed_credits),
        completedAt: run.completed_at,
        createdAt: run.created_at,
        embeddingUnits: run.embedding_units,
        errorClass: run.error_class,
        feature: run.feature,
        firstTokenLatencyMs: run.first_token_latency_ms,
        id: run.id,
        imageUnits: run.image_units,
        inputTokens: run.input_tokens,
        latencyMs: run.latency_ms,
        modelId: run.model_id,
        outputTokens: run.output_tokens,
        providerCostUsd: Number(run.provider_cost_usd),
        reasoningTokens: run.reasoning_tokens,
        requestId: run.request_id,
        sourceType: resolveSourceType(run.api_key_id, run.metadata),
        status: run.status,
      })),
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}

function resolveSourceType(apiKeyId: string | null, metadata: unknown) {
  if (apiKeyId) return 'api_key' as const;
  if (
    metadata &&
    !Array.isArray(metadata) &&
    typeof metadata === 'object' &&
    ('external_app_id' in metadata ||
      ('billing_mode' in metadata &&
        metadata.billing_mode === 'external_app_unmetered'))
  ) {
    return 'external_app' as const;
  }
  return 'session' as const;
}

function parseCursor(value: string | null) {
  if (!value) return null;
  const [createdAt, id] = value.split('~');
  if (
    !createdAt ||
    !id ||
    Number.isNaN(new Date(createdAt).getTime()) ||
    !/^[0-9a-f-]{36}$/i.test(id)
  ) {
    return null;
  }
  return { createdAt, id };
}
