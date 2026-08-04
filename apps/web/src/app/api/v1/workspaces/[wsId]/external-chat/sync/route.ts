import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { resolveChatRouteContext } from '@/lib/chat/private-rpc';
import { requestExternalChatControl } from '@/lib/external-chat/delivery';
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

    try {
      const remote = await requestExternalChatControl(
        wsId,
        `/control/v1/sync/${parsed.data.action}`,
        { runId, stream: parsed.data.stream ?? 'canonical' }
      );
      const remoteRun = readRemoteRun(remote, runId);
      const update = buildRunUpdate(
        remoteRun,
        parsed.data.action === 'cancel' ? 'cancelled' : 'running'
      );
      const { error: updateError } = await db
        .from('external_chat_sync_runs')
        .update(update)
        .eq('id', runId)
        .eq('ws_id', wsId);
      if (updateError) throw new Error(updateError.message);
      return NextResponse.json({ remote, runId });
    } catch (error) {
      await db
        .from('external_chat_sync_runs')
        .update({
          error_code: 'control_unavailable',
          state: 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', runId)
        .eq('ws_id', wsId);
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
  const refreshed = [];
  for (const run of runs) {
    if (!activeStates.has(String(run.state))) {
      refreshed.push(run);
      continue;
    }
    try {
      const remote = await requestExternalChatControl(
        wsId,
        '/control/v1/sync/status',
        { runId: run.id }
      );
      const remoteRun = readRemoteRun(remote, String(run.id));
      if (!remoteRun) {
        refreshed.push(run);
        continue;
      }
      const update = buildRunUpdate(remoteRun, String(run.state));
      const { error } = await db
        .from('external_chat_sync_runs')
        .update(update)
        .eq('id', run.id)
        .eq('ws_id', wsId);
      if (error) throw new Error(error.message);
      refreshed.push({ ...run, ...update });
    } catch (error) {
      console.warn('Failed to refresh external chat sync run', {
        error,
        runId: run.id,
        wsId,
      });
      refreshed.push(run);
    }
  }
  return refreshed;
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
  fallback: string
) {
  const now = new Date().toISOString();
  const remoteState = typeof remote?.state === 'string' ? remote.state : null;
  const state =
    remoteState && runStates.has(remoteState) ? remoteState : fallback;
  const update: Record<string, unknown> = { state, updated_at: now };
  assignRemoteField(update, 'cursor', remote?.cursor);
  assignRemoteField(update, 'high_water_mark', remote?.highWater);
  assignRemoteField(update, 'source_counts', remote?.sourceCounts);
  assignRemoteField(update, 'target_counts', remote?.targetCounts);
  assignRemoteField(update, 'digest_results', remote?.digestResults);
  assignRemoteField(update, 'error_code', remote?.errorCode);
  assignRemoteField(update, 'started_at', remote?.startedAt);
  assignRemoteField(update, 'finished_at', remote?.finishedAt);
  if (activeStates.has(state) && !update.started_at) update.started_at = now;
  if (terminalStates.has(state) && !update.finished_at)
    update.finished_at = now;
  return update;
}

function assignRemoteField(
  target: Record<string, unknown>,
  key: string,
  value: unknown
) {
  if (value !== undefined) target[key] = value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
