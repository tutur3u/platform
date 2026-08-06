import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { resolveChatRouteContext } from '@/lib/chat/private-rpc';
import {
  createExternalChatControlClient,
  requestExternalChatControl,
} from '@/lib/external-chat/delivery';
import { readExternalChatBinding } from '@/lib/external-chat/store';
import { safeParseBody } from '@/lib/safe-parse-body';
import {
  activeStates,
  buildRunUpdate,
  expectedControlStates,
  publicRemoteRun,
  readRemoteRun,
  runOperations,
} from './run-state';

type Params = { wsId: string };
const actionSchema = z.object({
  action: z.enum(['audit', 'start', 'resume', 'cancel', 'reconcile', 'adopt']),
  agentId: z
    .string()
    .regex(/^[1-9]\d{0,19}$/)
    .optional(),
  runId: z.string().uuid().optional(),
  stream: z.string().min(1).max(80).optional(),
});
const syncControlTimeoutMs = 60_000;

export const GET = withSessionAuth<Params>(
  async (_request, auth, params) => {
    await connection();
    const context = await resolveChatRouteContext({
      auth,
      permission: 'manage_external_projects',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;
    const wsId = context.context.normalizedWsId;
    const admin = await createAdminClient({ noCookie: true });
    const db = admin.schema('private') as any;
    const [
      { data: runs, error: runsError },
      { data: checkpoint, error: checkpointError },
    ] = await Promise.all([
      db
        .from('external_chat_sync_runs')
        .select(
          'id, operation, state, cursor, high_water_mark, source_counts, target_counts, digest_results, error_code, started_at, finished_at, created_at, updated_at'
        )
        .eq('ws_id', wsId)
        .order('created_at', { ascending: false })
        .limit(20),
      db
        .from('external_chat_sync_checkpoints')
        .select(
          'state, bridge_checked_at, ingest_checked_at, reconciled_at, pending_count, updated_at'
        )
        .eq('ws_id', wsId)
        .maybeSingle(),
    ]);
    if (runsError || checkpointError)
      return NextResponse.json(
        { error: 'sync_status_unavailable' },
        { status: 503 }
      );
    const refreshedRuns = await refreshActiveRuns(db, wsId, runs ?? []);
    return NextResponse.json({ checkpoint, runs: refreshedRuns });
  },
  {
    allowAppSessionAuth: { targetApp: ['cms', 'infra'] },
    rateLimitKind: 'read',
  }
);

export const POST = withSessionAuth<Params>(
  async (request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'manage_external_projects',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;
    const body = await safeParseBody(request, 16_384);
    if (body instanceof NextResponse) return body;
    const parsed = actionSchema.safeParse(body.data);
    if (!parsed.success)
      return NextResponse.json(
        { error: 'invalid_sync_action' },
        { status: 400 }
      );

    const wsId = context.context.normalizedWsId;
    const binding = await readExternalChatBinding(wsId);
    if (!binding)
      return NextResponse.json({ error: 'binding_not_found' }, { status: 404 });
    const connectorKey = binding.binding.canonical_project_id ?? wsId;
    const admin = await createAdminClient({ noCookie: true });
    const db = admin.schema('private') as any;
    const operation =
      parsed.data.action === 'start' ? 'backfill' : parsed.data.action;
    let runId = parsed.data.runId;
    if (
      !runId &&
      ['audit', 'start', 'reconcile'].includes(parsed.data.action)
    ) {
      const { data, error } = await db
        .from('external_chat_sync_runs')
        .insert({
          connector_key: connectorKey,
          operation,
          state: 'pending',
          ws_id: wsId,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      runId = data.id;
    }
    if (!runId)
      return NextResponse.json({ error: 'run_id_required' }, { status: 400 });

    if (parsed.data.action === 'adopt') {
      return adoptRemoteRun({ connectorKey, db, runId, wsId });
    }

    let existingStartedAt: string | null = null;
    if (parsed.data.runId) {
      const { data: existingRun, error: existingRunError } = await db
        .from('external_chat_sync_runs')
        .select('started_at')
        .eq('ws_id', wsId)
        .eq('id', runId)
        .eq('connector_key', connectorKey)
        .maybeSingle();
      if (existingRunError)
        return NextResponse.json(
          { error: 'sync_run_unavailable' },
          { status: 503 }
        );
      if (!existingRun)
        return NextResponse.json(
          { error: 'sync_run_not_found' },
          { status: 404 }
        );
      existingStartedAt = existingRun.started_at;
    }

    try {
      const remote = await requestExternalChatControl(
        wsId,
        `/control/v1/sync/${parsed.data.action}`,
        {
          ...(parsed.data.agentId ? { agentId: parsed.data.agentId } : {}),
          runId,
          stream: parsed.data.stream ?? 'canonical',
        },
        { timeoutMs: syncControlTimeoutMs }
      );
      const remoteRun = readRemoteRun(remote, runId);
      const update = buildRunUpdate(
        remoteRun,
        parsed.data.action === 'cancel' ? 'cancelled' : 'running',
        existingStartedAt,
        parsed.data.action
      );
      const expectedStates = expectedControlStates(parsed.data.action);
      const { data: applied, error: updateError } = await db.rpc(
        'external_chat_transition_sync_run',
        {
          p_expected_states: expectedStates,
          p_run_id: runId,
          p_update: update,
          p_ws_id: wsId,
        }
      );
      if (updateError) throw new Error(updateError.message);
      if (!applied)
        return NextResponse.json(
          { error: 'sync_run_changed', runId },
          { status: 409 }
        );
      return NextResponse.json({ remote, runId });
    } catch (error) {
      await db.rpc('external_chat_transition_sync_run', {
        p_expected_states: expectedControlStates(parsed.data.action),
        p_run_id: runId,
        p_update: {
          error_code: 'control_unavailable',
          state: 'failed',
          updated_at: new Date().toISOString(),
        },
        p_ws_id: wsId,
      });
      console.error('External chat sync control failed', { error, wsId });
      return NextResponse.json(
        { error: 'control_unavailable', runId },
        { status: 503 }
      );
    }
  },
  {
    allowAppSessionAuth: { targetApp: ['cms', 'infra'] },
    rateLimitKind: 'mutate',
  }
);

async function adoptRemoteRun({
  connectorKey,
  db,
  runId,
  wsId,
}: {
  connectorKey: string;
  db: any;
  runId: string;
  wsId: string;
}) {
  let remote: Record<string, unknown>;
  try {
    remote = await requestExternalChatControl(
      wsId,
      '/control/v1/sync/status',
      { runId },
      { timeoutMs: syncControlTimeoutMs }
    );
  } catch (error) {
    console.error('External chat sync adoption failed', { error, runId, wsId });
    return NextResponse.json(
      { error: 'control_unavailable', runId },
      { status: 503 }
    );
  }

  const remoteRun = readRemoteRun(remote, runId);
  if (!remoteRun)
    return NextResponse.json(
      { error: 'remote_sync_run_not_found', runId },
      { status: 404 }
    );
  const operation =
    typeof remoteRun.operation === 'string' &&
    runOperations.has(remoteRun.operation)
      ? remoteRun.operation
      : null;
  if (!operation)
    return NextResponse.json(
      { error: 'remote_sync_run_invalid', runId },
      { status: 422 }
    );

  const update = buildRunUpdate(remoteRun, 'running', null);
  const { error: upsertError } = await db
    .from('external_chat_sync_runs')
    .upsert(
      {
        connector_key: connectorKey,
        id: runId,
        operation,
        ws_id: wsId,
        ...update,
      },
      { ignoreDuplicates: true, onConflict: 'id' }
    );
  if (upsertError)
    return NextResponse.json(
      { error: 'sync_run_unavailable', runId },
      { status: 503 }
    );

  const { data: adopted, error: readError } = await db
    .from('external_chat_sync_runs')
    .select(
      'id, operation, state, cursor, high_water_mark, source_counts, target_counts, digest_results, error_code, started_at, finished_at'
    )
    .eq('ws_id', wsId)
    .eq('id', runId)
    .eq('connector_key', connectorKey)
    .maybeSingle();
  if (readError)
    return NextResponse.json(
      { error: 'sync_run_unavailable', runId },
      { status: 503 }
    );
  if (!adopted)
    return NextResponse.json(
      { error: 'sync_run_conflict', runId },
      { status: 409 }
    );

  return NextResponse.json({
    remote: publicRemoteRun(
      runId,
      typeof adopted.operation === 'string' ? adopted.operation : operation,
      adopted
    ),
    runId,
  });
}

async function refreshActiveRuns(
  db: any,
  wsId: string,
  runs: Array<Record<string, unknown>>
) {
  // Bound degraded-bridge latency without serializing every active run.
  const refreshed = [...runs];
  const activeIndexes = runs
    .flatMap((run, index) =>
      activeStates.has(String(run.state)) ? [index] : []
    )
    .slice(0, 4);
  if (activeIndexes.length === 0) return refreshed;
  let requestControl: Awaited<
    ReturnType<typeof createExternalChatControlClient>
  >;
  try {
    requestControl = await createExternalChatControlClient(wsId);
  } catch (error) {
    console.warn('Failed to prepare external chat sync refresh', {
      error,
      wsId,
    });
    return refreshed;
  }
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < activeIndexes.length) {
      const position = activeIndexes[nextIndex++];
      if (position === undefined) return;
      const run = runs[position];
      if (!run) continue;
      refreshed[position] = await refreshRun(db, wsId, run, requestControl);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(4, activeIndexes.length) }, () => worker())
  );
  return refreshed;
}

async function refreshRun(
  db: any,
  wsId: string,
  run: Record<string, unknown>,
  requestControl: Awaited<ReturnType<typeof createExternalChatControlClient>>
) {
  try {
    const remote = await requestControl(
      '/control/v1/sync/status',
      { runId: run.id },
      { timeoutMs: 2_500 }
    );
    const remoteRun = readRemoteRun(remote, String(run.id));
    if (!remoteRun) return run;
    const update = buildRunUpdate(
      remoteRun,
      String(run.state),
      typeof run.started_at === 'string' ? run.started_at : null
    );
    const { data: applied, error } = await db.rpc(
      'external_chat_compare_and_set_sync_run',
      {
        p_expected_state: String(run.state),
        p_expected_updated_at: run.updated_at,
        p_run_id: run.id,
        p_update: update,
        p_ws_id: wsId,
      }
    );
    if (error) throw new Error(error.message);
    return applied ? { ...run, ...update } : run;
  } catch (error) {
    console.warn('Failed to refresh external chat sync run', {
      error,
      runId: run.id,
      wsId,
    });
    return run;
  }
}
