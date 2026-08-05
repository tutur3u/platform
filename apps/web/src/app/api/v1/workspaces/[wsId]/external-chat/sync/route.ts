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

type Params = { wsId: string };
const actionSchema = z.object({
  action: z.enum(['audit', 'start', 'resume', 'cancel', 'reconcile']),
  runId: z.string().uuid().optional(),
  stream: z.string().min(1).max(80).optional(),
});

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
        { runId, stream: parsed.data.stream ?? 'canonical' }
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

const activeStates = new Set(['pending', 'running']);
const terminalStates = new Set(['cancelled', 'completed', 'failed']);
const runStates = new Set([...activeStates, ...terminalStates, 'paused']);

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

function readRemoteRun(remote: unknown, runId: string) {
  if (!isRecord(remote)) return null;
  if (remote.runId === runId) return remote;
  if (!Array.isArray(remote.runs)) return null;
  return (
    remote.runs.find(
      (run): run is Record<string, unknown> =>
        isRecord(run) && run.runId === runId
    ) ?? null
  );
}

function buildRunUpdate(
  remote: Record<string, unknown> | null,
  fallback: string,
  existingStartedAt: string | null,
  action?: z.infer<typeof actionSchema>['action']
) {
  const now = new Date().toISOString();
  const remoteState = typeof remote?.state === 'string' ? remote.state : null;
  const state =
    remoteState && runStates.has(remoteState) ? remoteState : fallback;
  const update: Record<string, unknown> = { state, updated_at: now };
  assignObjectField(update, 'cursor', remote?.cursor);
  assignObjectField(update, 'high_water_mark', remote?.highWater);
  assignObjectField(update, 'source_counts', remote?.sourceCounts);
  assignObjectField(update, 'target_counts', remote?.targetCounts);
  if (Array.isArray(remote?.digestResults))
    update.digest_results = remote.digestResults;
  if (typeof remote?.errorCode === 'string' || remote?.errorCode === null)
    update.error_code = remote.errorCode;
  if (!existingStartedAt)
    assignTimestampField(update, 'started_at', remote?.startedAt);
  assignTimestampField(update, 'finished_at', remote?.finishedAt);
  if (action === 'resume' && !terminalStates.has(state)) {
    update.error_code = null;
    update.finished_at = null;
  }
  if (state !== 'cancelled' && !update.started_at && !existingStartedAt)
    update.started_at = now;
  if (terminalStates.has(state) && !update.finished_at)
    update.finished_at = now;
  return update;
}

function assignObjectField(
  target: Record<string, unknown>,
  key: string,
  value: unknown
) {
  if (isRecord(value)) target[key] = value;
}

function assignTimestampField(
  target: Record<string, unknown>,
  key: string,
  value: unknown
) {
  if (typeof value === 'string' && Number.isFinite(Date.parse(value)))
    target[key] = value;
}

function expectedControlStates(action: z.infer<typeof actionSchema>['action']) {
  if (action === 'cancel') return ['pending', 'running'];
  if (action === 'resume') return ['failed', 'paused'];
  return ['pending'];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
