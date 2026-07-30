import type { NextRequest } from 'next/server';
import { connection } from 'next/server';
import { listAiStudioConsumptionEvents } from '@/lib/consumption-data';
import { parseAiStudioDateRange } from '@/lib/observability';
import { authorizeAiStudioWorkspaceRequest } from '@/lib/session-api';

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

  const { data, error } = await listAiStudioConsumptionEvents({
    cursor,
    feature,
    from: range.from.toISOString(),
    limit: limit + 1,
    model,
    sbAdmin: auth.sbAdmin,
    status: status ?? undefined,
    to: range.to.toISOString(),
    userId: auth.user.id,
    workspaceId: auth.workspace.id,
  });
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
  const stepCounts = await loadStepCounts(
    auth.sbAdmin,
    page.map((run) => run.event_id)
  );

  return Response.json(
    {
      nextCursor:
        hasMore && last ? `${last.created_at}~${last.event_id}` : null,
      runs: page.map((run) => ({
        billedCredits: Number(run.billed_credits),
        completedAt: run.completed_at,
        createdAt: run.created_at,
        embeddingUnits: run.embedding_units,
        errorClass: run.error_class,
        feature: run.feature,
        firstTokenLatencyMs: run.first_token_latency_ms,
        id: run.event_id,
        imageUnits: run.image_units,
        inputTokens: run.input_tokens,
        latencyMs: run.latency_ms ?? null,
        modelId: run.model_id,
        outputTokens: run.output_tokens,
        providerCostUsd: Number(run.provider_cost_usd),
        reasoningTokens: run.reasoning_tokens,
        requestId: run.request_id,
        searchUnits: run.search_units,
        sourceType: run.source_type,
        status: run.status,
        stepCount: stepCounts.get(run.event_id)?.steps ?? 0,
        toolCallCount: stepCounts.get(run.event_id)?.tools ?? 0,
      })),
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}

async function loadStepCounts(
  sbAdmin: Parameters<typeof listAiStudioConsumptionEvents>[0]['sbAdmin'],
  runIds: string[]
) {
  const counts = new Map<string, { steps: number; tools: number }>();
  if (runIds.length === 0) return counts;
  try {
    const { data, error } = await sbAdmin
      .schema('private')
      .from('ai_studio_run_steps')
      .select('run_id, kind')
      .in('run_id', runIds);
    if (error) {
      console.warn('AI Studio step counts unavailable', { code: error.code });
      return counts;
    }
    for (const step of data ?? []) {
      const current = counts.get(step.run_id) ?? { steps: 0, tools: 0 };
      current.steps += 1;
      if (step.kind === 'tool') current.tools += 1;
      counts.set(step.run_id, current);
    }
  } catch {
    // Keep the run list available during rollout or in older test clients.
  }
  return counts;
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
