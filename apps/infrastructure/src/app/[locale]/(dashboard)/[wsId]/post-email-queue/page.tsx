import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  getPostEmailQueueObservability,
  POST_EMAIL_QUEUE_DEFAULT_DRAIN_LIMIT,
  POST_EMAIL_QUEUE_DEFAULT_SEND_LIMIT,
  type PostEmailQueueHealth,
  type PostEmailQueueObservability,
} from '@/lib/post-email-queue/observability';
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

type QueueDashboardTranslation = (
  key: string,
  values?: Record<string, unknown>
) => string;

async function getQueueAnalytics() {
  try {
    const sbAdmin = await createAdminClient();
    return await getPostEmailQueueObservability(sbAdmin);
  } catch (error) {
    serverLogger.error('[PostEmailQueueInfra] Error fetching analytics', {
      errorName: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

function formatNumber(value: number) {
  return value.toLocaleString();
}

function getHealthClassName(status: PostEmailQueueHealth['status']) {
  if (status === 'critical') {
    return 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red';
  }

  if (status === 'degraded') {
    return 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange';
  }

  return 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green';
}

function MetricCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  tone?: 'danger' | 'default' | 'success' | 'warning';
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background p-4">
      <p className="font-medium text-muted-foreground text-sm">{label}</p>
      <div
        className={cn(
          'mt-2 font-bold text-2xl',
          tone === 'danger' && 'text-dynamic-red',
          tone === 'warning' && 'text-dynamic-orange',
          tone === 'success' && 'text-dynamic-green'
        )}
      >
        {typeof value === 'number' ? formatNumber(value) : value}
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="text-muted-foreground text-sm">{label}</p>;
}

function QueueDashboard({
  analytics,
  t,
}: {
  analytics: PostEmailQueueObservability;
  t: QueueDashboardTranslation;
}) {
  const activeProblemRows =
    analytics.summary.failed + analytics.summary.blocked;

  return (
    <div className="grid gap-6">
      <div className="rounded-lg border border-border/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-lg">
              {t('ws-post-emails.queue_health')}
            </p>
            <p className="text-muted-foreground text-sm">
              {t(`ws-post-emails.queue_health_${analytics.health.status}`)}
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'px-3 py-1',
              getHealthClassName(analytics.health.status)
            )}
          >
            {t(`ws-post-emails.health_${analytics.health.status}`)}
          </Badge>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <MetricCard
            label={t('ws-post-emails.active_backlog')}
            value={analytics.health.activeBacklog}
            tone={analytics.health.activeBacklog > 0 ? 'warning' : 'success'}
          />
          <MetricCard
            label={t('ws-post-emails.stale_queued_1h')}
            value={analytics.health.staleQueued1h}
            tone={analytics.health.staleQueued1h > 0 ? 'warning' : 'success'}
          />
          <MetricCard
            label={t('ws-post-emails.stale_queued_24h')}
            value={analytics.health.staleQueued24h}
            tone={analytics.health.staleQueued24h > 0 ? 'danger' : 'success'}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={t('ws-post-emails.queued')}
          value={analytics.summary.queued}
          tone="warning"
        />
        <MetricCard
          label={t('ws-post-emails.processing')}
          value={analytics.summary.processing}
        />
        <MetricCard
          label={t('ws-post-emails.sent')}
          value={analytics.summary.sent}
          tone="success"
        />
        <MetricCard
          label={t('ws-post-emails.failed')}
          value={activeProblemRows}
          tone={activeProblemRows > 0 ? 'danger' : 'default'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('ws-post-emails.trigger_title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TriggerForm
              defaultLimit={POST_EMAIL_QUEUE_DEFAULT_DRAIN_LIMIT}
              defaultSendLimit={POST_EMAIL_QUEUE_DEFAULT_SEND_LIMIT}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('ws-post-emails.throughput')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard
                label={t('ws-post-emails.sent_last_1h')}
                value={analytics.throughput.sentLast1h}
                tone="success"
              />
              <MetricCard
                label={t('ws-post-emails.sent_last_24h')}
                value={analytics.throughput.sentLast24h}
                tone="success"
              />
              <MetricCard
                label={t('ws-post-emails.failed_last_24h')}
                value={analytics.throughput.failedLast24h}
                tone={
                  analytics.throughput.failedLast24h > 0 ? 'danger' : 'default'
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('ws-post-emails.age_buckets')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analytics.ageBuckets.map((bucket) => (
                <div
                  key={bucket.bucket}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium text-sm">
                      {t(`ws-post-emails.age_bucket_${bucket.bucket}`)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {t('ws-post-emails.age_bucket_counts', {
                        failed: bucket.failed,
                        processing: bucket.processing,
                        queued: bucket.queued,
                      })}
                    </p>
                  </div>
                  <div className="font-semibold text-lg">
                    {formatNumber(bucket.total)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('ws-post-emails.failure_reasons')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.failureReasons.length === 0 ? (
              <EmptyState label={t('ws-post-emails.no_failures')} />
            ) : (
              <div className="space-y-2">
                {analytics.failureReasons.map((reason) => (
                  <div
                    key={reason.reason}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium text-sm">
                        {t(`ws-post-emails.failure_reason_${reason.reason}`)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {t('ws-post-emails.failure_reason_counts', {
                          blocked: reason.blocked,
                          failed: reason.failed,
                        })}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {formatNumber(reason.total)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('ws-post-emails.workspace_breakdown')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.byWorkspace.length === 0 ? (
              <EmptyState label={t('ws-post-emails.no_data')} />
            ) : (
              <div className="space-y-2">
                {analytics.byWorkspace.map((workspace) => (
                  <div key={workspace.ws_id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-sm">
                          {workspace.workspaceName ??
                            workspace.ws_id.slice(0, 8)}
                        </p>
                        <p className="font-mono text-muted-foreground text-xs">
                          {workspace.ws_id}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {formatNumber(
                          workspace.queued +
                            workspace.processing +
                            workspace.failed
                        )}
                      </Badge>
                    </div>
                    <p className="mt-2 text-muted-foreground text-xs">
                      {t('ws-post-emails.workspace_queue_counts', {
                        failed: workspace.failed,
                        processing: workspace.processing,
                        queued: workspace.queued,
                        stale: workspace.staleQueued1h,
                      })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('ws-post-emails.recent_batches')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.recentBatches.length === 0 ? (
              <EmptyState label={t('ws-post-emails.no_batches')} />
            ) : (
              <div className="space-y-2">
                {analytics.recentBatches.map((batch) => (
                  <div key={batch.batch_id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-mono text-muted-foreground text-xs">
                        {batch.batch_id.slice(0, 8)}...
                      </p>
                      <Badge variant="outline">
                        {t('ws-post-emails.batch_claimed', {
                          count: batch.claimed,
                        })}
                      </Badge>
                    </div>
                    <p className="mt-2 text-muted-foreground text-xs">
                      {t('ws-post-emails.batch_counts', {
                        failed: batch.failed,
                        processing: batch.processing,
                        sent: batch.sent,
                        skipped: batch.skipped,
                      })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
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

  const analytics = await getQueueAnalytics();

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-post-emails.plural')}
        singularTitle={t('ws-post-emails.singular')}
        description={t('ws-post-emails.infrastructure_description')}
      />
      <Separator className="my-4" />

      {analytics ? (
        <QueueDashboard
          analytics={analytics}
          t={t as QueueDashboardTranslation}
        />
      ) : (
        <Card>
          <CardContent className="p-6">
            <EmptyState label={t('ws-post-emails.analytics_unavailable')} />
          </CardContent>
        </Card>
      )}
    </>
  );
}
