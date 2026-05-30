'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FolderSync,
  Layers2,
  PenSquare,
} from '@tuturuuu/icons';
import { getWorkspaceExternalProjectSummary } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  CollectionRow,
  formatDateTime,
  QueuePanel,
  StatTile,
} from './cms-home-panels';

export function CmsHomeClient({
  workspaceId,
  workspaceSlug,
}: {
  workspaceId: string;
  workspaceSlug: string;
}) {
  const t = useTranslations();
  const summaryQuery = useQuery({
    queryFn: () => getWorkspaceExternalProjectSummary(workspaceId),
    queryKey: ['cms-summary', workspaceId],
    staleTime: 60_000,
  });

  const summary = summaryQuery.data;

  if (summaryQuery.isPending) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-28 rounded-lg" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  if (!summary) {
    return (
      <section className="rounded-lg border border-border/70 bg-card/80 p-6">
        <h1 className="font-semibold text-xl">{t('common.error')}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
          {t('external-projects.epm.preview_empty_description')}
        </p>
      </section>
    );
  }

  const libraryHref = `/${workspaceSlug}/library`;
  const previewHref = `/${workspaceSlug}/preview`;
  const membersHref = `/${workspaceSlug}/members`;
  const latestPublishEvent = summary.recentActivity.publishEvents[0];
  const latestImportJob = summary.recentActivity.importJobs[0];
  const queueEmptyLabel = t('external-projects.epm.empty_entries');
  const collectionLabels = {
    archived: t('external-projects.epm.status_archived'),
    draft: t('external-projects.epm.status_draft'),
    enabled: t('external-projects.epm.enabled_label'),
    published: t('external-projects.epm.status_published'),
    scheduled: t('external-projects.epm.status_scheduled'),
    unbound: t('external-projects.root.unbound_label'),
  };

  return (
    <main className="space-y-5 pb-8">
      <section className="rounded-lg border border-border/70 bg-card/75 p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-md">
                {t('sidebar_tabs.external_projects')}
              </Badge>
              {summary.adapter ? (
                <Badge variant="outline" className="rounded-md">
                  {summary.adapter}
                </Badge>
              ) : null}
              {summary.canonicalProjectId ? (
                <Badge variant="outline" className="rounded-md">
                  {summary.canonicalProjectId}
                </Badge>
              ) : null}
            </div>
            <div>
              <h1 className="text-balance font-semibold text-3xl">
                {t('external-projects.epm.title')}
              </h1>
              <p className="mt-2 max-w-3xl text-muted-foreground text-sm leading-6">
                {t('external-projects.studio.home_description')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={libraryHref}>{t('common.library')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={previewHref}>{t('common.preview')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={membersHref}>{t('common.members')}</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatTile
          action={t('external-projects.epm.open_collection_action')}
          href={libraryHref}
          icon={<Layers2 className="h-4 w-4" />}
          title={t('external-projects.epm.collections_metric_label')}
          value={summary.counts.collections}
        />
        <StatTile
          action={t('external-projects.epm.open_details_action')}
          href={libraryHref}
          icon={<PenSquare className="h-4 w-4" />}
          title={t('external-projects.epm.entries_metric_label')}
          value={summary.counts.entries}
        />
        <StatTile
          action={t('external-projects.epm.open_preview_action')}
          href={previewHref}
          icon={<CheckCircle2 className="h-4 w-4" />}
          title={t('external-projects.epm.status_published')}
          value={summary.counts.published}
        />
        <StatTile
          action={t('external-projects.epm.schedule_action')}
          href={libraryHref}
          icon={<CalendarClock className="h-4 w-4" />}
          title={t('external-projects.epm.status_scheduled')}
          value={summary.counts.scheduled}
        />
      </section>

      <section className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <div className="grid gap-3 xl:grid-cols-2">
            <QueuePanel
              actionHref={libraryHref}
              emptyLabel={queueEmptyLabel}
              icon={<AlertCircle className="h-4 w-4" />}
              items={summary.queues.draftsMissingMedia}
              title={t('external-projects.epm.attention_title')}
            />
            <QueuePanel
              actionHref={libraryHref}
              emptyLabel={queueEmptyLabel}
              icon={<CalendarClock className="h-4 w-4" />}
              items={summary.queues.scheduledSoon}
              title={t('external-projects.epm.scheduled_queue')}
            />
            <QueuePanel
              actionHref={libraryHref}
              emptyLabel={queueEmptyLabel}
              icon={<FolderSync className="h-4 w-4" />}
              items={summary.queues.recentlyImportedUnpublished}
              title={t('external-projects.epm.published_queue')}
            />
            <QueuePanel
              actionHref={libraryHref}
              emptyLabel={queueEmptyLabel}
              icon={<Clock className="h-4 w-4" />}
              items={summary.queues.archivedBacklog}
              title={t('external-projects.epm.archived_queue')}
            />
          </div>

          <section className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
            <div className="flex flex-col gap-2 px-4 py-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="font-semibold">
                  {t('external-projects.epm.collections_label')}
                </h2>
                <p className="mt-1 text-muted-foreground text-sm">
                  {t('external-projects.epm.manage_collection_description')}
                </p>
              </div>
              <Badge variant="outline" className="w-fit rounded-md">
                {summary.collections.length}{' '}
                {t('external-projects.epm.collections_metric_label')}
              </Badge>
            </div>
            {summary.collections.map((collection) => (
              <CollectionRow
                key={collection.id}
                collection={collection}
                href={`/${workspaceSlug}/library/collections/${collection.id}`}
                labels={collectionLabels}
              />
            ))}
            {summary.collections.length === 0 ? (
              <div className="border-border/60 border-t px-4 py-8 text-muted-foreground text-sm">
                {t('external-projects.epm.empty_collection')}
              </div>
            ) : null}
          </section>
        </div>

        <aside className="space-y-3">
          <section className="rounded-lg border border-border/70 bg-card/75 p-4">
            <h2 className="font-semibold">
              {t('external-projects.epm.activity_feed_title')}
            </h2>
            <p className="mt-1 text-muted-foreground text-sm leading-6">
              {t('external-projects.root.audit_feed_description')}
            </p>

            <div className="mt-4 space-y-3">
              <div className="rounded-md border border-border/70 bg-background/70 p-3">
                <div className="text-muted-foreground text-xs">
                  {t('external-projects.studio.publish_events_title')}
                </div>
                <div className="mt-1 font-medium">
                  {latestPublishEvent?.event_kind ?? queueEmptyLabel}
                </div>
                <div className="mt-1 text-muted-foreground text-xs">
                  {formatDateTime(latestPublishEvent?.created_at) ??
                    queueEmptyLabel}
                </div>
              </div>

              <div className="rounded-md border border-border/70 bg-background/70 p-3">
                <div className="text-muted-foreground text-xs">
                  {t('external-projects.studio.import_jobs_title')}
                </div>
                <div
                  className={cn(
                    'mt-1 font-medium',
                    !latestImportJob && 'text-muted-foreground'
                  )}
                >
                  {latestImportJob?.status ?? queueEmptyLabel}
                </div>
                <div className="mt-1 text-muted-foreground text-xs">
                  {formatDateTime(latestImportJob?.created_at) ??
                    queueEmptyLabel}
                </div>
              </div>
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
