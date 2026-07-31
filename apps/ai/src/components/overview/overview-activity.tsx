import { Activity, ArrowUpRight } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { formatTraceDuration } from '@/lib/playground-trace';
import type { AiStudioOverviewRun } from '@/lib/studio-data';
import { RelativeTimestamp } from '../relative-timestamp';
import { SectionCard } from '../studio/section-card';
import { StudioEmptyState } from '../studio/states';
import { normalizeRunStatus, StatusPill } from '../studio/status-pill';

const VISIBLE_RUNS = 8;

export async function OverviewActivity({
  runs,
  workspaceId,
}: {
  runs: AiStudioOverviewRun[];
  workspaceId: string;
}) {
  const t = await getTranslations('ai-studio');
  const overview = await getTranslations('ai-studio.home');
  const observability = await getTranslations('ai-studio.observability');

  return (
    <SectionCard
      actions={
        <Button
          asChild
          className="h-7 px-2.5 text-xs"
          size="sm"
          variant="ghost"
        >
          <Link href={`/${workspaceId}/runs`}>
            {t('view-all')}
            <ArrowUpRight className="ml-1.5 size-3.5" />
          </Link>
        </Button>
      }
      bodyClassName="divide-y"
      description={overview('activity_description')}
      flush
      icon={Activity}
      title={t('recent-runs')}
    >
      {runs.length ? (
        runs.slice(0, VISIBLE_RUNS).map((run) => (
          <Link
            className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
            href={`/${workspaceId}/runs?run=${encodeURIComponent(run.id)}`}
            key={run.id}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-xs">{run.request_id}</div>
              <div className="mt-0.5 truncate text-muted-foreground text-xs">
                {run.model_id} · {run.feature}
              </div>
            </div>
            <div className="hidden shrink-0 text-right text-muted-foreground text-xs tabular-nums sm:block">
              {formatTraceDuration(run.latencyMs)}
            </div>
            <div className="hidden shrink-0 text-right text-xs tabular-nums md:block">
              {run.billedCredits.toLocaleString(undefined, {
                maximumFractionDigits: 4,
              })}
            </div>
            <StatusPill
              className="shrink-0"
              label={observability(
                `status_${normalizeRunStatus(run.status)}` as Parameters<
                  typeof observability
                >[0]
              )}
              status={normalizeRunStatus(run.status)}
            />
            <div className="hidden w-24 shrink-0 text-right text-muted-foreground text-xs lg:block">
              <RelativeTimestamp value={run.createdAt} />
            </div>
          </Link>
        ))
      ) : (
        <div className="p-4">
          <StudioEmptyState
            description={overview('activity_empty_description')}
            icon={Activity}
            title={t('empty')}
          />
        </div>
      )}
    </SectionCard>
  );
}
