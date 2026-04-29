import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

async function requireRootAdmin() {
  const supabase = await createClient();

  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    return {
      error: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { data: rootWorkspaceUser } = await supabase
    .from('workspace_user_linked_users')
    .select('*')
    .eq('platform_user_id', user.id)
    .eq('ws_id', '00000000-0000-0000-0000-000000000000')
    .single();

  if (!rootWorkspaceUser) {
    return {
      error: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  return { user };
}

export async function GET() {
  const auth = await requireRootAdmin();
  if (auth.error) return auth.error;

  const sbAdmin = await createAdminClient();

  const { data: summaryRows, error: summaryError } = await sbAdmin
    .from('post_email_queue')
    .select('status');

  if (summaryError) {
    console.error('[PostEmailQueueInfra] Error fetching queue:', summaryError);
    return NextResponse.json(
      { message: 'Error fetching post email queue' },
      { status: 500 }
    );
  }

  const summary = {
    queued: 0,
    processing: 0,
    sent: 0,
    failed: 0,
    blocked: 0,
    cancelled: 0,
    total: summaryRows?.length ?? 0,
  };

  for (const row of summaryRows ?? []) {
    if (row.status === 'queued') summary.queued++;
    else if (row.status === 'processing') summary.processing++;
    else if (row.status === 'sent') summary.sent++;
    else if (row.status === 'failed') summary.failed++;
    else if (row.status === 'blocked') summary.blocked++;
    else if (row.status === 'cancelled') summary.cancelled++;
  }

  const { data: byWorkspaceRows, error: workspaceError } = await sbAdmin
    .from('post_email_queue')
    .select('ws_id, status')
    .order('created_at', { ascending: false });

  if (workspaceError) {
    console.error(
      '[PostEmailQueueInfra] Error fetching workspace breakdown:',
      workspaceError
    );
  }

  const workspaceMap = new Map<
    string,
    {
      ws_id: string;
      queued: number;
      processing: number;
      sent: number;
      failed: number;
      blocked: number;
      cancelled: number;
      total: number;
    }
  >();

  for (const row of byWorkspaceRows ?? []) {
    if (!row.ws_id) continue;
    if (!workspaceMap.has(row.ws_id)) {
      workspaceMap.set(row.ws_id, {
        ws_id: row.ws_id,
        queued: 0,
        processing: 0,
        sent: 0,
        failed: 0,
        blocked: 0,
        cancelled: 0,
        total: 0,
      });
    }
    const entry = workspaceMap.get(row.ws_id)!;
    entry.total++;
    if (row.status === 'queued') entry.queued++;
    else if (row.status === 'processing') entry.processing++;
    else if (row.status === 'sent') entry.sent++;
    else if (row.status === 'failed') entry.failed++;
    else if (row.status === 'blocked') entry.blocked++;
    else if (row.status === 'cancelled') entry.cancelled++;
  }

  const byWorkspace = Array.from(workspaceMap.values())
    .sort((a, b) => b.queued + b.processing - (a.queued + a.processing))
    .slice(0, 20);

  const { data: recentBatchIds, error: batchError } = await sbAdmin
    .from('post_email_queue')
    .select('batch_id, status, last_attempt_at, created_at')
    .not('batch_id', 'is', null)
    .order('last_attempt_at', { ascending: false })
    .limit(100);

  if (batchError) {
    console.error('[PostEmailQueueInfra] Error fetching batches:', batchError);
  }

  const batchMap = new Map<
    string,
    {
      batch_id: string;
      claimed: number;
      sent: number;
      failed: number;
      last_attempt_at: string | null;
    }
  >();

  for (const row of recentBatchIds ?? []) {
    if (!row.batch_id) continue;
    if (!batchMap.has(row.batch_id)) {
      batchMap.set(row.batch_id, {
        batch_id: row.batch_id,
        claimed: 0,
        sent: 0,
        failed: 0,
        last_attempt_at: row.last_attempt_at,
      });
    }
    const entry = batchMap.get(row.batch_id)!;
    entry.claimed++;
    if (row.status === 'sent') entry.sent++;
    if (row.status === 'failed') entry.failed++;
  }

  const recentBatches = Array.from(batchMap.values())
    .sort(
      (a, b) =>
        new Date(b.last_attempt_at ?? 0).getTime() -
        new Date(a.last_attempt_at ?? 0).getTime()
    )
    .slice(0, 10);

  return NextResponse.json({
    summary,
    byWorkspace,
    recentBatches,
  });
}
