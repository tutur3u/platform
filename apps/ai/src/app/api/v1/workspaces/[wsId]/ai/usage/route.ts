import type { NextRequest } from 'next/server';
import { connection } from 'next/server';
import { getAiStudioConsumptionBreakdown } from '@/lib/consumption-data';
import { numberValue, parseAiStudioDateRange } from '@/lib/observability';
import { authorizeAiStudioWorkspaceRequest } from '@/lib/session-api';

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
      { error: 'Usage range must be valid and no longer than 366 days' },
      { status: 400 }
    );
  }

  const { data, error } = await getAiStudioConsumptionBreakdown({
    from: range.from.toISOString(),
    sbAdmin: auth.sbAdmin,
    to: range.to.toISOString(),
    userId: auth.user.id,
    workspaceId: auth.workspace.id,
  });

  if (error) {
    console.error('AI Studio usage aggregation failed', {
      code: error.code,
      workspaceId: auth.workspace.id,
    });
    return Response.json({ error: 'Usage unavailable' }, { status: 500 });
  }

  const rows = (data ?? []).map((row) => ({
    abortedCount: numberValue(row.aborted_count),
    averageLatencyMs: numberValue(row.average_latency_ms),
    billedCredits: numberValue(row.billed_credits),
    bucketDate: row.bucket_date,
    embeddingUnits: numberValue(row.embedding_units),
    failedCount: numberValue(row.failed_count),
    feature: row.feature,
    imageUnits: numberValue(row.image_units),
    inputTokens: numberValue(row.input_tokens),
    latencySampleCount: numberValue(row.latency_sample_count),
    modelId: row.model_id,
    outputTokens: numberValue(row.output_tokens),
    providerCostUsd: numberValue(row.provider_cost_usd),
    reasoningTokens: numberValue(row.reasoning_tokens),
    requestCount: numberValue(row.request_count),
    searchUnits: numberValue(row.search_units),
    sourceId: row.source_id,
    sourceType: row.source_type,
    succeededCount: numberValue(row.succeeded_count),
  }));

  const totals = rows.reduce(
    (total, row) => ({
      abortedCount: total.abortedCount + row.abortedCount,
      billedCredits: total.billedCredits + row.billedCredits,
      embeddingUnits: total.embeddingUnits + row.embeddingUnits,
      failedCount: total.failedCount + row.failedCount,
      imageUnits: total.imageUnits + row.imageUnits,
      inputTokens: total.inputTokens + row.inputTokens,
      latencySampleCount: total.latencySampleCount + row.latencySampleCount,
      outputTokens: total.outputTokens + row.outputTokens,
      providerCostUsd: total.providerCostUsd + row.providerCostUsd,
      reasoningTokens: total.reasoningTokens + row.reasoningTokens,
      requestCount: total.requestCount + row.requestCount,
      searchUnits: total.searchUnits + row.searchUnits,
      succeededCount: total.succeededCount + row.succeededCount,
      weightedLatencyMs:
        total.weightedLatencyMs + row.averageLatencyMs * row.latencySampleCount,
    }),
    {
      abortedCount: 0,
      billedCredits: 0,
      embeddingUnits: 0,
      failedCount: 0,
      imageUnits: 0,
      inputTokens: 0,
      latencySampleCount: 0,
      outputTokens: 0,
      providerCostUsd: 0,
      reasoningTokens: 0,
      requestCount: 0,
      searchUnits: 0,
      succeededCount: 0,
      weightedLatencyMs: 0,
    }
  );

  return Response.json(
    {
      from: range.from.toISOString(),
      rows,
      to: range.to.toISOString(),
      totals: {
        ...totals,
        averageLatencyMs:
          totals.latencySampleCount > 0
            ? totals.weightedLatencyMs / totals.latencySampleCount
            : 0,
        weightedLatencyMs: undefined,
      },
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
