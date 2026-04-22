'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Layers2,
  PenSquare,
} from '@tuturuuu/icons';
import { getWorkspaceExternalProjectSummary } from '@tuturuuu/internal-api';
import type { ExternalProjectSummary } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

function MetricCard({
  description,
  icon,
  title,
  value,
}: {
  description: string;
  icon: ReactNode;
  title: string;
  value: number;
}) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardDescription>{title}</CardDescription>
          <div className="rounded-full border border-border/70 bg-background/80 p-2 text-muted-foreground">
            {icon}
          </div>
        </div>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        {description}
      </CardContent>
    </Card>
  );
}

function AttentionList({
  items,
  title,
}: {
  items: ExternalProjectSummary['queues'][keyof ExternalProjectSummary['queues']];
  title: string;
}) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <div className="text-muted-foreground text-sm">0</div>
        ) : (
          items.slice(0, 4).map((item) => (
            <div
              key={`${item.kind}-${item.entryId}`}
              className="rounded-xl border border-border/60 bg-background/70 p-3"
            >
              <div className="font-medium">{item.title}</div>
              <div className="mt-1 text-muted-foreground text-sm">
                {item.detail}
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <Badge variant="secondary">{item.collectionTitle}</Badge>
                <Badge variant="outline">{item.status}</Badge>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

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
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  if (!summary) {
    return (
      <Card className="border-border/70 bg-card/70">
        <CardHeader>
          <CardTitle>{t('common.error')}</CardTitle>
          <CardDescription>
            {t('external-projects.epm.preview_empty_description')}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="overflow-hidden border-border/70 bg-card/80">
          <CardHeader className="gap-4 border-border/70 border-b pb-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <Badge variant="secondary">
                  {t('sidebar_tabs.external_projects')}
                </Badge>
                <CardTitle className="text-3xl">
                  {t('common.dashboard')}
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-6">
                  {t('external-projects.epm.preview_description')}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href={`/${workspaceSlug}/content`}>
                    {t('common.content')}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/${workspaceSlug}/preview`}>
                    {t('common.preview')}
                  </Link>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 p-6 md:grid-cols-3">
            <MetricCard
              title={t('external-projects.epm.collections_metric_label')}
              value={summary.counts.collections}
              description={t('external-projects.epm.collection_health_title')}
              icon={<Layers2 className="h-4 w-4" />}
            />
            <MetricCard
              title={t('external-projects.epm.entries_metric_label')}
              value={summary.counts.entries}
              description={t('external-projects.epm.edit_entries_description')}
              icon={<PenSquare className="h-4 w-4" />}
            />
            <MetricCard
              title={t('external-projects.epm.published_queue')}
              value={summary.counts.published}
              description={t('external-projects.epm.preview_mode_description')}
              icon={<CheckCircle2 className="h-4 w-4" />}
            />
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80">
          <CardHeader>
            <CardTitle>
              {t('external-projects.epm.activity_feed_title')}
            </CardTitle>
            <CardDescription>
              {t('external-projects.root.audit_feed_description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.recentActivity.publishEvents.slice(0, 4).map((event) => (
              <div
                key={event.id}
                className="rounded-xl border border-border/60 bg-background/70 p-3"
              >
                <div className="font-medium">{event.event_kind}</div>
                <div className="mt-1 text-muted-foreground text-sm">
                  {new Date(event.created_at).toLocaleString()}
                </div>
              </div>
            ))}
            {summary.recentActivity.publishEvents.length === 0 ? (
              <div className="text-muted-foreground text-sm">0</div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AttentionList
          title={t('external-projects.epm.attention_title')}
          items={summary.queues.draftsMissingMedia}
        />
        <AttentionList
          title={t('external-projects.epm.scheduled_queue')}
          items={summary.queues.scheduledSoon}
        />
        <AttentionList
          title={t('external-projects.epm.archived_queue')}
          items={summary.queues.archivedBacklog}
        />
      </div>

      <Card className="border-border/70 bg-card/70">
        <CardHeader>
          <CardTitle>{t('external-projects.epm.collections_label')}</CardTitle>
          <CardDescription>
            {t('external-projects.epm.manage_collection_description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {summary.collections.map((collection) => (
            <Link
              key={collection.id}
              href={`/${workspaceSlug}/collections/${collection.id}`}
              className="rounded-2xl border border-border/60 bg-background/70 p-4 transition hover:border-foreground/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{collection.title}</div>
                  <div className="mt-1 text-muted-foreground text-sm">
                    {collection.slug}
                  </div>
                </div>
                <Badge variant={collection.isEnabled ? 'default' : 'outline'}>
                  {collection.isEnabled
                    ? t('external-projects.epm.enabled_label')
                    : t('external-projects.root.unbound_label')}
                </Badge>
              </div>
              <div className="mt-4 flex items-center gap-2 text-muted-foreground text-sm">
                <Layers2 className="h-4 w-4" />
                <span>{collection.totalEntries}</span>
                <AlertCircle className="ml-2 h-4 w-4" />
                <span>{collection.draftEntries}</span>
                <CalendarClock className="ml-2 h-4 w-4" />
                <span>{collection.scheduledEntries}</span>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
