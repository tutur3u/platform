'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Eye, FileText } from '@tuturuuu/icons';
import { getWorkspaceExternalProjectSummary } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { EXTERNAL_PROJECT_DISPLAY_NAMES } from '@/features/cms-studio/constants';
import { CmsHomeCommerce } from './cms-home-commerce';
import { ContinueEditingPanel, QueuePanel } from './cms-home-panels';
import { CmsHomeStoreHealth } from './cms-home-store-health';

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
      <div className="space-y-6">
        <Skeleton className="h-44 rounded-lg" />
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-56 rounded-lg" />
          <Skeleton className="h-56 rounded-lg" />
        </div>
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

  const libraryHref = `/${workspaceSlug}/content`;
  const previewHref = `/${workspaceSlug}/preview`;
  const projectLabel = summary.adapter
    ? EXTERNAL_PROJECT_DISPLAY_NAMES[summary.adapter]
    : t('external-projects.epm.title');
  const attentionItems = [
    ...summary.queues.draftsMissingMedia,
    ...summary.queues.scheduledSoon,
    ...summary.queues.recentlyImportedUnpublished,
  ].slice(0, 6);
  const continueItem = attentionItems[0] ?? null;
  const urlPathLabel = t('external-projects.epm.slug_label');
  const stats = [
    {
      label: t('external-projects.epm.status_published'),
      value: summary.counts.published,
    },
    {
      label: t('external-projects.epm.status_draft'),
      value: summary.counts.drafts,
    },
    {
      label: t('external-projects.epm.status_scheduled'),
      value: summary.counts.scheduled,
    },
  ];

  return (
    <main className="space-y-6 pb-8">
      <section className="rounded-lg border border-border/70 bg-card/75 p-6">
        <Badge variant="secondary" className="rounded-md">
          {t('external-projects.epm.home_badge')}
        </Badge>
        <h1 className="mt-4 text-balance font-semibold text-3xl">
          {t('external-projects.epm.home_title', { project: projectLabel })}
        </h1>
        <p className="mt-3 max-w-3xl text-muted-foreground text-sm leading-6">
          {t('external-projects.epm.home_description')}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild>
            <Link href={libraryHref}>
              <FileText className="mr-2 h-4 w-4" />
              {t('external-projects.epm.home_content_title')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={previewHref}>
              <Eye className="mr-2 h-4 w-4" />
              {t('external-projects.epm.open_preview_action')}
            </Link>
          </Button>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3 sm:max-w-md">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-border/70 bg-background/70 px-4 py-3"
            >
              <div className="font-semibold text-2xl tabular-nums">
                {stat.value}
              </div>
              <div className="mt-1 text-muted-foreground text-xs">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      <CmsHomeCommerce workspaceId={workspaceId} />

      <CmsHomeStoreHealth
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
      />

      <section className="grid gap-4 xl:grid-cols-2">
        <ContinueEditingPanel
          description={t('external-projects.epm.continue_editing_description')}
          emptyLabel={t('external-projects.epm.home_status_ready_description')}
          href={libraryHref}
          item={continueItem}
          title={t('external-projects.epm.continue_editing_title')}
          urlPathLabel={urlPathLabel}
        />
        <QueuePanel
          actionHref={libraryHref}
          emptyLabel={t('external-projects.epm.empty_entries')}
          icon={<AlertCircle className="h-4 w-4" />}
          items={attentionItems}
          title={t('external-projects.epm.attention_title')}
          urlPathLabel={urlPathLabel}
        />
      </section>
    </main>
  );
}
