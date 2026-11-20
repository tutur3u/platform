import { databaseHeaders } from '../database';
import { withinDeadline } from './deadline';
import { type PrivateRpcResult, postPrivateRpc } from './maintenance-rpc';
import type { ProcessorContext, ProcessorResult } from './types';

// Expiry cleanup for disposable QA test accounts. One slot lists at most
// QA_CLEANUP_LIMIT expired accounts and deletes them one at a time through the
// ledger: begin (marker re-check, cleanup fence and a 10-minute lease), remove
// the run workspace once its last account goes and record that, ban then
// delete the Auth account, and settle only after Auth reports it absent.
// The Cron Control fence is re-checked before every destructive request. An
// unconfirmed write ends the slot as unknown; the deletion stays leased and a
// later slot re-verifies it, so nothing is replayed blindly. Meet attendance
// rows of these synthetic accounts are left to attendance retention; operator
// cleanup through the web API erases them immediately.

export const QA_CLEANUP_LIMIT = 25;
export const QA_LIST_EXPIRED_RPC = 'qa_test_list_expired';
const QA_DELETION_BAN = '876000h';
const AUTH_TIMEOUT_MS = 15_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

// deleted/skipped continue the batch; failed is a definitive refusal that
// leaves the lease to lapse; stopped and unknown end the slot.
type Step = 'deleted' | 'skipped' | 'failed' | 'stopped' | 'unknown';

function authHeaders(key: string) {
  // Secret API keys authenticate through the gateway by `apikey` alone; legacy
  // JWT service keys must also be the bearer token.
  return {
    apikey: key,
    ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }),
    'Content-Type': 'application/json',
  };
}

function requestSignal(context: ProcessorContext) {
  const timeout = AbortSignal.timeout(
    Math.max(1, Math.min(AUTH_TIMEOUT_MS, context.deadline - context.now()))
  );
  return context.signal ? AbortSignal.any([context.signal, timeout]) : timeout;
}

async function request(
  context: ProcessorContext,
  url: URL,
  init: { method: string; body?: string; headers: Record<string, string> }
) {
  const response = await withinDeadline(context, () =>
    context.fetch(url, {
      ...init,
      redirect: 'manual',
      signal: requestSignal(context),
    })
  );
  void response.body?.cancel().catch(() => undefined);
  return response.status;
}

function authUserUrl(context: ProcessorContext, userId: string) {
  return new URL(`/auth/v1/admin/users/${userId}`, context.env.SUPABASE_URL);
}

const fenceOpen = (context: ProcessorContext) =>
  withinDeadline(context, context.fence);

function rpcObject(result: PrivateRpcResult) {
  return result.kind === 'ok' &&
    typeof result.value === 'object' &&
    result.value !== null &&
    !Array.isArray(result.value)
    ? (result.value as Record<string, unknown>)
    : null;
}

const refused = (status: number) => status >= 400 && status < 500;

/**
 * Only a 4xx is a definitive refusal whose transaction rolled back. A 5xx or an
 * unreadable response may have committed, so its outcome is unknown.
 */
const rpcFailure = (result: PrivateRpcResult): Step =>
  result.kind === 'http' && refused(result.status) ? 'failed' : 'unknown';

async function deleteRunWorkspace(
  context: ProcessorContext,
  wsId: string,
  runId: unknown
): Promise<Step | null> {
  if (!(await fenceOpen(context))) return 'stopped';
  const url = new URL('/rest/v1/workspaces', context.env.SUPABASE_URL);
  url.searchParams.set('id', `eq.${wsId}`);
  url.searchParams.set('personal', 'eq.false');
  const status = await request(context, url, {
    method: 'DELETE',
    headers: {
      ...databaseHeaders(context.env),
      'Accept-Profile': 'public',
      'Content-Profile': 'public',
    },
  });
  // A redirect or 5xx leaves the delete unconfirmed.
  if (status < 200 || status >= 300)
    return refused(status) ? 'failed' : 'unknown';
  // The removal must be recorded before the last account settles, or nothing
  // would reconcile the workspace later.
  const recorded = await postPrivateRpc(
    context,
    'qa_test_finish_workspace_delete',
    { p_run_id: runId, p_actor: 'cron', p_actor_user: null }
  );
  if (recorded.kind !== 'ok') return rpcFailure(recorded);
  return recorded.value === true ? null : 'failed';
}

async function deleteAuthUser(
  context: ProcessorContext,
  userId: string
): Promise<Step | null> {
  const headers = authHeaders(context.env.SUPABASE_SECRET_KEY);
  if (!(await fenceOpen(context))) return 'stopped';
  // The ban stops token refresh even when the delete has to be retried.
  const banned = await request(context, authUserUrl(context, userId), {
    method: 'PUT',
    headers,
    body: JSON.stringify({ ban_duration: QA_DELETION_BAN }),
  });
  if ((banned < 200 || banned >= 300) && banned !== 404)
    return refused(banned) ? 'failed' : 'unknown';
  if (!(await fenceOpen(context))) return 'stopped';
  const deleted = await request(context, authUserUrl(context, userId), {
    method: 'DELETE',
    headers,
  });
  // Only Auth's own presence answer settles the deletion. A present account
  // after a definitive refusal fails; any other combination is unconfirmed.
  const presence = await request(context, authUserUrl(context, userId), {
    method: 'GET',
    headers,
  });
  if (presence === 404) return null;
  return presence === 200 && refused(deleted) && deleted !== 404
    ? 'failed'
    : 'unknown';
}

async function deleteOne(
  context: ProcessorContext,
  userId: string
): Promise<Step> {
  const begin = await postPrivateRpc(context, 'qa_test_begin_delete', {
    p_user_id: userId,
    p_actor: 'cron',
    p_actor_user: null,
  });
  const begun = rpcObject(begin);
  if (!begun) return rpcFailure(begin);
  if (begun.state === 'fenced') return 'stopped';
  if (begun.state === 'deleted' || begun.state === 'not_found')
    return 'deleted';
  if (begun.state === 'busy') return 'skipped';
  if (begun.state !== 'deleting') return 'unknown';

  const wsId = begun.runWorkspaceId;
  if (typeof wsId === 'string' && UUID.test(wsId)) {
    const workspace = await deleteRunWorkspace(context, wsId, begun.runId);
    if (workspace) return workspace;
  }
  if (begun.authPresent === true) {
    const auth = await deleteAuthUser(context, userId);
    if (auth) return auth;
  }
  const finish = await postPrivateRpc(context, 'qa_test_finish_delete', {
    p_user_id: userId,
    p_actor: 'cron',
    p_actor_user: null,
  });
  const finished = rpcObject(finish);
  if (!finished) return rpcFailure(finish);
  return finished.state === 'deleted' ? 'deleted' : 'failed';
}

export async function cleanupQaTestUsers(
  context: ProcessorContext
): Promise<ProcessorResult> {
  if (!(await fenceOpen(context))) return { detail: {}, outcome: 'stopped' };
  const listing = await postPrivateRpc(
    context,
    QA_LIST_EXPIRED_RPC,
    { p_limit: QA_CLEANUP_LIMIT },
    4_096
  );
  if (listing.kind === 'http') return { detail: {}, outcome: 'failed' };
  const listed = rpcObject(listing);
  if (!listed) return { detail: {}, outcome: 'unknown' };
  if (listed.mode === 'fenced') return { detail: { fenced: 1 }, outcome: 'ok' };
  const userIds = listed.userIds;
  if (
    listed.mode !== 'run' ||
    !Array.isArray(userIds) ||
    userIds.length > QA_CLEANUP_LIMIT ||
    !userIds.every((id) => typeof id === 'string' && UUID.test(id))
  )
    return { detail: {}, outcome: 'unknown' };

  const detail = { deleted: 0, unsettled: 0, skipped: 0 };
  for (const [index, userId] of (userIds as string[]).entries()) {
    let step: Step;
    try {
      step = (await fenceOpen(context))
        ? await deleteOne(context, userId)
        : 'stopped';
    } catch {
      // Deadline or network failure: the write may have landed, so this
      // deletion stays leased and the slot ends before another delete.
      step = 'unknown';
    }
    if (step === 'stopped' || step === 'unknown') {
      detail.skipped += userIds.length - index - (step === 'unknown' ? 1 : 0);
      if (step === 'unknown') detail.unsettled += 1;
      return { detail, outcome: step };
    }
    if (step === 'failed') detail.unsettled += 1;
    else detail[step] += 1;
  }
  return { detail, outcome: detail.unsettled === 0 ? 'ok' : 'failed' };
}
