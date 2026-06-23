'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';

export type PostEmailQueueStatusCount = {
  queued: number;
  processing: number;
  sent: number;
  failed: number;
  blocked: number;
  cancelled: number;
  total: number;
};

export type PostEmailQueueWorkspaceSummary = PostEmailQueueStatusCount & {
  ws_id: string;
};

export type PostEmailQueueBatchSummary = {
  batch_id: string;
  claimed: number;
  sent: number;
  failed: number;
  last_attempt_at: string | null;
};

export type PostEmailQueueClientPageProps = {
  summary: PostEmailQueueStatusCount;
  byWorkspace: PostEmailQueueWorkspaceSummary[];
  recentBatches: PostEmailQueueBatchSummary[];
};

type SummaryMetric = {
  key: 'queued' | 'processing' | 'sent' | 'failed';
  value: number;
};

const SUMMARY_METRICS = [
  'queued',
  'processing',
  'sent',
  'failed',
] as const satisfies readonly SummaryMetric['key'][];

function formatCount(value: number) {
  return value.toLocaleString();
}

function formatShortId(value: string) {
  return value.length > 8 ? `${value.slice(0, 8)}...` : value;
}

function formatAttemptTime(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function SummaryCards({ summary }: { summary: PostEmailQueueStatusCount }) {
  const t = useTranslations('ws-post-emails');
  const metrics = SUMMARY_METRICS.map((key) => ({
    key,
    value: summary[key],
  }));

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.key}>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              {t(metric.key)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={
                metric.key === 'failed'
                  ? 'font-bold text-2xl text-destructive'
                  : 'font-bold text-2xl'
              }
            >
              {formatCount(metric.value)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RecentBatchesCard({
  recentBatches,
}: {
  recentBatches: PostEmailQueueBatchSummary[];
}) {
  const t = useTranslations('ws-post-emails');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('recent_batches')}</CardTitle>
      </CardHeader>
      <CardContent>
        {recentBatches.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('no_batches')}</p>
        ) : (
          <div className="space-y-3">
            {recentBatches.map((batch) => {
              const attemptTime = formatAttemptTime(batch.last_attempt_at);

              return (
                <div
                  className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                  key={batch.batch_id}
                >
                  <div className="min-w-0">
                    <div
                      className="truncate font-mono text-muted-foreground text-xs"
                      title={batch.batch_id}
                    >
                      {formatShortId(batch.batch_id)}
                    </div>
                    {attemptTime ? (
                      <time
                        className="text-muted-foreground text-xs"
                        dateTime={batch.last_attempt_at ?? undefined}
                      >
                        {attemptTime}
                      </time>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="text-muted-foreground">
                      {formatCount(batch.sent)}/{formatCount(batch.claimed)}{' '}
                      {t('sent')}
                    </span>
                    {batch.failed > 0 ? (
                      <span className="text-destructive">
                        {formatCount(batch.failed)} {t('failed')}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WorkspaceBreakdownCard({
  byWorkspace,
}: {
  byWorkspace: PostEmailQueueWorkspaceSummary[];
}) {
  const t = useTranslations('ws-post-emails');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('workspace_breakdown')}</CardTitle>
      </CardHeader>
      <CardContent>
        {byWorkspace.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('no_data')}</p>
        ) : (
          <div className="space-y-2">
            {byWorkspace.map((workspace) => (
              <div
                className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                key={workspace.ws_id}
              >
                <div
                  className="truncate font-mono text-muted-foreground text-xs"
                  title={workspace.ws_id}
                >
                  {formatShortId(workspace.ws_id)}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  {workspace.queued > 0 ? (
                    <span className="text-muted-foreground">
                      {formatCount(workspace.queued)} {t('queued')}
                    </span>
                  ) : null}
                  {workspace.processing > 0 ? (
                    <span className="text-muted-foreground">
                      {formatCount(workspace.processing)} {t('processing')}
                    </span>
                  ) : null}
                  {workspace.failed > 0 ? (
                    <span className="text-destructive">
                      {formatCount(workspace.failed)} {t('failed')}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function PostEmailQueueClientPage({
  summary,
  byWorkspace,
  recentBatches,
}: PostEmailQueueClientPageProps) {
  const t = useTranslations('ws-post-emails');

  return (
    <>
      <FeatureSummary
        description={t('infrastructure_description')}
        pluralTitle={t('plural')}
        singularTitle={t('singular')}
      />
      <Separator className="my-4" />

      <div className="grid gap-6">
        <SummaryCards summary={summary} />
        <RecentBatchesCard recentBatches={recentBatches} />
        <WorkspaceBreakdownCard byWorkspace={byWorkspace} />
      </div>
    </>
  );
}
