'use client';

import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FileText,
  PenSquare,
  Users,
} from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { HomeActionCard } from './cms-home-panels';

export function HomeActionGrid({
  landingHref,
  libraryHref,
  membersHref,
  previewHref,
}: {
  landingHref: string;
  libraryHref: string;
  membersHref: string;
  previewHref: string;
}) {
  const t = useTranslations();

  return (
    <div className="mt-5 grid gap-3 md:grid-cols-2">
      <HomeActionCard
        description={t('external-projects.epm.home_landing_description')}
        href={landingHref}
        icon={<PenSquare className="h-4 w-4" />}
        primary
        title={t('external-projects.epm.home_landing_title')}
      />
      <HomeActionCard
        description={t('external-projects.epm.home_content_description')}
        href={libraryHref}
        icon={<FileText className="h-4 w-4" />}
        title={t('external-projects.epm.home_content_title')}
      />
      <HomeActionCard
        description={t('external-projects.epm.home_preview_description')}
        href={previewHref}
        icon={<Eye className="h-4 w-4" />}
        title={t('external-projects.epm.home_preview_title')}
      />
      <HomeActionCard
        description={t('external-projects.epm.home_members_description')}
        href={membersHref}
        icon={<Users className="h-4 w-4" />}
        title={t('external-projects.epm.home_members_title')}
      />
    </div>
  );
}

export function HomeStatusPanel({
  draftCount,
  latestImportValue,
  latestPublishValue,
  needsReview,
  publishedCount,
  scheduledCount,
}: {
  draftCount: number;
  latestImportValue: string;
  latestPublishValue: string;
  needsReview: boolean;
  publishedCount: number;
  scheduledCount: number;
}) {
  const t = useTranslations();
  const metrics = [
    {
      label: t('external-projects.epm.status_published'),
      value: publishedCount,
    },
    {
      label: t('external-projects.epm.status_draft'),
      value: draftCount,
    },
    {
      label: t('external-projects.epm.status_scheduled'),
      value: scheduledCount,
    },
  ];

  return (
    <aside className="rounded-lg border border-border/70 bg-card/75 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-md border border-border/70 bg-background/80 text-muted-foreground">
          {needsReview ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
        </div>
        <div>
          <h2 className="font-semibold">
            {needsReview
              ? t('external-projects.epm.home_status_review_title')
              : t('external-projects.epm.home_status_ready_title')}
          </h2>
          <p className="mt-1 text-muted-foreground text-sm leading-6">
            {needsReview
              ? t('external-projects.epm.home_status_review_description')
              : t('external-projects.epm.home_status_ready_description')}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-md border border-border/70 bg-background/70 px-3 py-2"
          >
            <div className="font-semibold tabular-nums">{metric.value}</div>
            <div className="text-muted-foreground text-xs">{metric.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <ActivityRow
          label={t('external-projects.studio.publish_events_title')}
          value={latestPublishValue}
        />
        <ActivityRow
          label={t('external-projects.studio.import_jobs_title')}
          value={latestImportValue}
        />
      </div>
    </aside>
  );
}

function ActivityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/70 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}
