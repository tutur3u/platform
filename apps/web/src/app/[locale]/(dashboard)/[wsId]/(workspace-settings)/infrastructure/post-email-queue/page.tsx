import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { TriggerForm } from './trigger-form';

export const metadata: Metadata = {
  title: 'Post Email Queue',
  description: 'Platform-wide observability for the post email queue system.',
};

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

async function getQueueStats() {
  const sbAdmin = await createAdminClient();

  const { data: summaryRows, error: summaryError } = await sbAdmin
    .from('post_email_queue')
    .select('status');

  if (summaryError) {
    console.error('[PostEmailQueueInfra] Error fetching queue:', summaryError);
    return null;
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

  return summary;
}

async function getWorkspaceBreakdown() {
  const sbAdmin = await createAdminClient();

  const { data: byWorkspaceRows, error: workspaceError } = await sbAdmin
    .from('post_email_queue')
    .select('ws_id, status')
    .order('created_at', { ascending: false });

  if (workspaceError) {
    console.error(
      '[PostEmailQueueInfra] Error fetching workspace breakdown:',
      workspaceError
    );
    return [];
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

  return Array.from(workspaceMap.values())
    .sort((a, b) => b.queued + b.processing - (a.queued + a.processing))
    .slice(0, 20);
}

async function getRecentBatches() {
  const sbAdmin = await createAdminClient();

  const { data: recentBatchIds, error: batchError } = await sbAdmin
    .from('post_email_queue')
    .select('batch_id, status, last_attempt_at, created_at')
    .not('batch_id', 'is', null)
    .order('last_attempt_at', { ascending: false })
    .limit(100);

  if (batchError) {
    console.error('[PostEmailQueueInfra] Error fetching batches:', batchError);
    return [];
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

  return Array.from(batchMap.values())
    .sort(
      (a, b) =>
        new Date(b.last_attempt_at ?? 0).getTime() -
        new Date(a.last_attempt_at ?? 0).getTime()
    )
    .slice(0, 10);
}

export default async function PostEmailQueuePage({ params }: Props) {
  const { wsId } = await params;
  const t = await getTranslations();

  const permissions = await getPermissions({ wsId });
  if (!permissions) notFound();
  const { containsPermission } = permissions;
  const canViewInfrastructure = containsPermission('view_infrastructure');
  if (!canViewInfrastructure) {
    notFound();
  }

  const [summary, byWorkspace, recentBatches] = await Promise.all([
    getQueueStats(),
    getWorkspaceBreakdown(),
    getRecentBatches(),
  ]);

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-post-emails.plural')}
        singularTitle={t('ws-post-emails.singular')}
        description={t('ws-post-emails.infrastructure_description')}
      />
      <Separator className="my-4" />

      <div className="grid gap-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-medium text-muted-foreground text-sm">
                {t('ws-post-emails.queued')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">
                {(summary?.queued ?? 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-medium text-muted-foreground text-sm">
                {t('ws-post-emails.processing')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">
                {(summary?.processing ?? 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-medium text-muted-foreground text-sm">
                {t('ws-post-emails.sent')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">
                {(summary?.sent ?? 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-medium text-muted-foreground text-sm">
                {t('ws-post-emails.failed')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl text-destructive">
                {(summary?.failed ?? 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('ws-post-emails.trigger_title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TriggerForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('ws-post-emails.recent_batches')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentBatches.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t('ws-post-emails.no_batches')}
              </p>
            ) : (
              <div className="space-y-3">
                {recentBatches.map((batch) => (
                  <div
                    key={batch.batch_id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="font-mono text-muted-foreground text-xs">
                      {batch.batch_id.slice(0, 8)}...
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">
                        {batch.sent}/{batch.claimed} sent
                      </span>
                      {batch.failed > 0 && (
                        <span className="text-destructive">
                          {batch.failed} failed
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('ws-post-emails.workspace_breakdown')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {byWorkspace.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t('ws-post-emails.no_data')}
              </p>
            ) : (
              <div className="space-y-2">
                {byWorkspace.map((ws) => (
                  <div
                    key={ws.ws_id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="font-mono text-muted-foreground text-xs">
                      {ws.ws_id.slice(0, 8)}...
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      {ws.queued > 0 && (
                        <span className="text-muted-foreground">
                          {ws.queued} queued
                        </span>
                      )}
                      {ws.processing > 0 && (
                        <span className="text-muted-foreground">
                          {ws.processing} processing
                        </span>
                      )}
                      {ws.failed > 0 && (
                        <span className="text-destructive">
                          {ws.failed} failed
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
