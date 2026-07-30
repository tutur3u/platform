import { connection } from 'next/server';
import { authorizeAiStudioWorkspaceRequest } from '@/lib/session-api';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string; wsId: string }> }
) {
  await connection();
  const { runId, wsId } = await params;
  if (!/^[0-9a-f-]{36}$/iu.test(runId)) {
    return Response.json({ error: 'Invalid run ID' }, { status: 400 });
  }

  const auth = await authorizeAiStudioWorkspaceRequest(wsId, 'use_ai_studio');
  if (!auth.ok) return auth.response;

  const { data: run, error: runError } = await auth.sbAdmin
    .schema('private')
    .from('ai_studio_runs')
    .select('id')
    .eq('id', runId)
    .eq('ws_id', auth.workspace.id)
    .maybeSingle();
  if (runError) {
    console.error('AI Studio run detail lookup failed', {
      code: runError.code,
      workspaceId: auth.workspace.id,
    });
    return Response.json({ error: 'Run detail unavailable' }, { status: 500 });
  }
  if (!run) return Response.json({ error: 'Run not found' }, { status: 404 });

  const { data: steps, error } = await auth.sbAdmin
    .schema('private')
    .from('ai_studio_run_steps')
    .select(
      'sequence, kind, name, status, model_id, input_tokens, output_tokens, billed_credits, provider_cost_usd, latency_ms, error_class, started_at, completed_at'
    )
    .eq('run_id', run.id)
    .order('sequence');
  if (error) {
    console.error('AI Studio run steps query failed', {
      code: error.code,
      runId,
    });
    return Response.json({ error: 'Run detail unavailable' }, { status: 500 });
  }

  return Response.json(
    {
      runId,
      steps: (steps ?? []).map((step) => ({
        billedCredits: Number(step.billed_credits),
        completedAt: step.completed_at,
        errorClass: step.error_class,
        inputTokens: step.input_tokens,
        kind: step.kind,
        latencyMs: step.latency_ms,
        modelId: step.model_id,
        name: step.name,
        outputTokens: step.output_tokens,
        providerCostUsd: Number(step.provider_cost_usd),
        sequence: step.sequence,
        startedAt: step.started_at,
        status: step.status,
      })),
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
