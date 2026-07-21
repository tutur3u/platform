'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertCircle } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { EXTERNAL_PROJECT_DISPLAY_NAMES } from '@/features/cms-studio/constants';
import { CmsHomeHeader } from './cms-home-header';
import { getCmsHomeAttentionItems } from './cms-home-model';
import {
  cmsHomeCommerceQueryOptions,
  cmsHomeInsightsQueryOptions,
  cmsHomeSummaryQueryOptions,
} from './cms-home-query-options';
import { CmsHomeWorkspaceTabs } from './cms-home-workspace-tabs';

export function CmsHomeClient({
  workspaceId,
  workspaceSlug,
}: {
  workspaceId: string;
  workspaceSlug: string;
}) {
  const t = useTranslations('external-projects');
  const summaryQuery = useQuery(cmsHomeSummaryQueryOptions(workspaceId));
  const commerceQuery = useQuery(cmsHomeCommerceQueryOptions(workspaceId));
  const insightsQuery = useQuery(cmsHomeInsightsQueryOptions(workspaceId));

  if (summaryQuery.isPending) return <CmsHomeLoading />;

  const summary = summaryQuery.data;
  if (!summary) {
    return (
      <CmsHomeError
        description={t('epm.home_error_description')}
        onRetry={() => summaryQuery.refetch()}
        retryLabel={t('epm.retry_action')}
        title={t('epm.home_error_title')}
      />
    );
  }

  const attentionItems = getCmsHomeAttentionItems(summary);
  const needsReview = attentionItems.length > 0;
  const isRefreshing =
    summaryQuery.isFetching ||
    commerceQuery.isFetching ||
    insightsQuery.isFetching;
  const projectLabel = summary.adapter
    ? EXTERNAL_PROJECT_DISPLAY_NAMES[summary.adapter]
    : t('epm.title');
  const stats = [
    [t('epm.status_published'), summary.counts.published],
    [t('epm.status_draft'), summary.counts.drafts],
    [t('epm.status_scheduled'), summary.counts.scheduled],
  ] as const;

  const refreshAll = () => {
    summaryQuery.refetch();
    commerceQuery.refetch();
    insightsQuery.refetch();
  };

  return (
    <main className="space-y-5 pb-8">
      <CmsHomeHeader
        description={t('epm.home_description')}
        isRefreshing={isRefreshing}
        needsReview={needsReview}
        libraryAction={t('epm.home_content_title')}
        libraryHref={`/${workspaceSlug}/content`}
        onRefresh={refreshAll}
        previewAction={t('epm.open_preview_action')}
        previewHref={`/${workspaceSlug}/preview`}
        statusDescription={t(
          needsReview
            ? 'epm.home_status_review_description'
            : 'epm.home_status_ready_description'
        )}
        statusTitle={t(
          needsReview
            ? 'epm.home_status_review_title'
            : 'epm.home_status_ready_title'
        )}
        title={t('epm.home_title', { project: projectLabel })}
      />
      <CmsHomeWorkspaceTabs
        attentionItems={attentionItems}
        commerce={{
          data: commerceQuery.data,
          isError: commerceQuery.isError,
          isPending: commerceQuery.isPending,
          retry: () => commerceQuery.refetch(),
        }}
        continueItem={attentionItems[0] ?? null}
        insights={{
          data: insightsQuery.data,
          isError: insightsQuery.isError,
          isPending: insightsQuery.isPending,
          retry: () => insightsQuery.refetch(),
        }}
        stats={stats}
        workspaceSlug={workspaceSlug}
      />
    </main>
  );
}

function CmsHomeLoading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-52 rounded-xl" />
      <Skeleton className="h-10 w-full rounded-lg sm:w-md" />
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-28 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function CmsHomeError({
  description,
  onRetry,
  retryLabel,
  title,
}: {
  description: string;
  onRetry: () => void;
  retryLabel: string;
  title: string;
}) {
  return (
    <section className="rounded-xl border border-border/70 bg-card/80 p-6">
      <AlertCircle className="size-5 text-destructive" />
      <h1 className="mt-4 font-semibold text-xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
        {description}
      </p>
      <Button className="mt-5" onClick={onRetry} size="sm">
        {retryLabel}
      </Button>
    </section>
  );
}
