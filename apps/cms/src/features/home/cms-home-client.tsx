'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Eye } from '@tuturuuu/icons';
import { getWorkspaceExternalProjectSummary } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { isCmsLandingCollection } from '@/features/cms-studio/cms-editor-blueprints';
import { EXTERNAL_PROJECT_DISPLAY_NAMES } from '@/features/cms-studio/constants';
import { HomeActionGrid, HomeStatusPanel } from './cms-home-overview';
import {
  CollectionGroup,
  ContinueEditingPanel,
  formatDateTime,
  LaunchChecklist,
  QueuePanel,
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
        <Skeleton className="h-48 rounded-lg" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
        <Skeleton className="h-80 rounded-lg" />
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

  const landingHref = `/${workspaceSlug}/landing`;
  const libraryHref = `/${workspaceSlug}/library`;
  const previewHref = `/${workspaceSlug}/preview`;
  const membersHref = `/${workspaceSlug}/members`;
  const projectLabel = summary.adapter
    ? EXTERNAL_PROJECT_DISPLAY_NAMES[summary.adapter]
    : t('external-projects.epm.title');
  const landingCollections = summary.collections.filter((collection) =>
    isCmsLandingCollection(summary.adapter, collection)
  );
  const contentCollections = summary.collections.filter(
    (collection) => !isCmsLandingCollection(summary.adapter, collection)
  );
  const attentionItems = [
    ...summary.queues.draftsMissingMedia,
    ...summary.queues.scheduledSoon,
    ...summary.queues.recentlyImportedUnpublished,
  ].slice(0, 6);
  const continueItem = attentionItems[0] ?? null;
  const needsReview =
    summary.counts.drafts > 0 ||
    summary.counts.scheduled > 0 ||
    attentionItems.length > 0;
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
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-border/70 bg-card/75 p-5">
          <Badge variant="secondary" className="rounded-md">
            {t('external-projects.epm.home_badge')}
          </Badge>
          <h1 className="mt-4 text-balance font-semibold text-3xl">
            {t('external-projects.epm.home_title', { project: projectLabel })}
          </h1>
          <p className="mt-3 max-w-3xl text-muted-foreground text-sm leading-6">
            {t('external-projects.epm.home_description')}
          </p>

          <HomeActionGrid
            landingHref={landingHref}
            libraryHref={libraryHref}
            membersHref={membersHref}
            previewHref={previewHref}
          />
        </div>

        <HomeStatusPanel
          draftCount={summary.counts.drafts}
          latestImportValue={
            formatDateTime(latestImportJob?.created_at) ?? queueEmptyLabel
          }
          latestPublishValue={
            formatDateTime(latestPublishEvent?.created_at) ?? queueEmptyLabel
          }
          needsReview={needsReview}
          publishedCount={summary.counts.published}
          scheduledCount={summary.counts.scheduled}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)]">
        <ContinueEditingPanel
          description={t('external-projects.epm.continue_editing_description')}
          emptyLabel={t('external-projects.epm.home_status_ready_description')}
          href={libraryHref}
          item={continueItem}
          title={t('external-projects.epm.continue_editing_title')}
          urlPathLabel={t('external-projects.epm.slug_label')}
        />
        <LaunchChecklist
          title={t('external-projects.epm.launch_checklist_title')}
          items={[
            {
              complete: landingCollections.length > 0,
              href: landingHref,
              label: t('external-projects.epm.launch_checklist_landing'),
            },
            {
              complete: summary.counts.drafts === 0,
              href: libraryHref,
              label: t('external-projects.epm.launch_checklist_media'),
            },
            {
              complete: !needsReview,
              href: previewHref,
              label: t('external-projects.epm.launch_checklist_publish'),
            },
          ]}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <CollectionGroup
          collections={landingCollections}
          emptyLabel={t('external-projects.epm.landing_collections_empty')}
          hrefForCollection={(collection) =>
            `/${workspaceSlug}/library/collections/${collection.id}`
          }
          labels={collectionLabels}
          title={t('external-projects.epm.landing_collections_title')}
          totalLabel={t('external-projects.epm.total_entries_label')}
        />
        <CollectionGroup
          collections={contentCollections}
          emptyLabel={t('external-projects.epm.content_collections_empty')}
          hrefForCollection={(collection) =>
            `/${workspaceSlug}/library/collections/${collection.id}`
          }
          labels={collectionLabels}
          title={t('external-projects.epm.content_collections_title')}
          totalLabel={t('external-projects.epm.total_entries_label')}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <QueuePanel
          actionHref={libraryHref}
          emptyLabel={queueEmptyLabel}
          icon={<AlertCircle className="h-4 w-4" />}
          items={attentionItems}
          title={t('external-projects.epm.attention_title')}
          urlPathLabel={t('external-projects.epm.slug_label')}
        />
        <Link
          href={previewHref}
          className="rounded-lg border border-border/70 bg-card/75 p-4 transition-colors hover:border-foreground/25 hover:bg-card"
        >
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Eye className="h-4 w-4" />
            {t('external-projects.epm.open_preview_action')}
          </div>
          <h2 className="mt-3 font-semibold">
            {t('external-projects.epm.preview_title')}
          </h2>
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            {t('external-projects.epm.preview_description')}
          </p>
        </Link>
      </section>
    </main>
  );
}
