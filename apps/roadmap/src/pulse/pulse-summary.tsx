import { GitCommitHorizontal, TrendingDown, TrendingUp } from '@tuturuuu/icons';
import {
  fill,
  formatDuration,
  formatNumber,
} from '@tuturuuu/roadmap-core/components/insights/format.ts';
import type {
  Lang,
  Messages,
} from '@tuturuuu/roadmap-core/components/shared.tsx';
import { formatDate } from '@tuturuuu/roadmap-core/components/shared.tsx';
import { REPO_URL } from '@tuturuuu/roadmap-core/live/model.ts';
import type { RoadmapView } from '@tuturuuu/roadmap-core/view-model.ts';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import type { ReactNode } from 'react';
import type { RoadmapSnapshot } from '../roadmap-snapshot';

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}) {
  return (
    <Card className="grid content-start gap-1 p-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="grid gap-1">
        <span className="font-semibold text-3xl tabular-nums tracking-tight">
          {value}
        </span>
        {note ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-sm">
            {note}
          </span>
        ) : null}
      </dd>
    </Card>
  );
}

/**
 * The compact header above the tabs: the title, which production commit is
 * live and how fresh the data is, and four headline figures.
 */
export function PulseSummary({
  t,
  lang,
  view,
  snapshot,
  sampled,
  now,
}: {
  t: Messages;
  lang: Lang;
  view: RoadmapView;
  snapshot: RoadmapSnapshot | null;
  sampled: boolean;
  now: number;
}) {
  const copy = t.pulseRoadmap;
  const n = (value: number) => formatNumber(value, lang);
  const previous = snapshot?.commits7dPrev ?? 0;
  const delta = snapshot ? snapshot.commits7d - previous : 0;
  const change = previous
    ? `${delta >= 0 ? '+' : '−'}${n((Math.abs(delta) * 100) / previous)}%`
    : null;
  const { totals } = view;
  const total = Object.values(totals).reduce((sum, count) => sum + count, 0);
  const Trend = delta < 0 ? TrendingDown : TrendingUp;

  return (
    <section className="grid gap-5" aria-labelledby="page-title">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {snapshot?.productionSha ? (
          <Badge variant="outline" asChild>
            <a
              href={`${REPO_URL}/commit/${snapshot.productionSha}`}
              className="gap-1.5"
            >
              <span
                className="size-2 rounded-full bg-dynamic-green"
                aria-hidden="true"
              />
              {copy.production}
              <GitCommitHorizontal aria-hidden="true" />
              <code>{snapshot.productionSha.slice(0, 7)}</code>
            </a>
          </Badge>
        ) : (
          <Badge variant="outline">{copy.productionUnknown}</Badge>
        )}
        {snapshot && (
          <time
            className="text-muted-foreground"
            dateTime={snapshot.generatedAt}
            title={formatDate(snapshot.generatedAt, lang, true)}
          >
            {fill(copy.updated, {
              age: formatDuration(
                Math.max(0, now - Date.parse(snapshot.generatedAt)),
                t,
                lang
              ),
            })}
          </time>
        )}
        {snapshot && !sampled && (
          <Badge variant="secondary">{copy.snapshot}</Badge>
        )}
      </div>
      <div className="grid gap-1">
        <p className="font-medium text-muted-foreground text-sm">{t.eyebrow}</p>
        <h1
          id="page-title"
          className="font-semibold text-3xl tracking-tight sm:text-4xl"
        >
          {t.title}{' '}
          <span className="text-muted-foreground">{t.titleAccent}</span>
        </h1>
      </div>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t.summary.commitsWeek}
          value={snapshot ? n(snapshot.commits7d) : '—'}
          note={
            snapshot ? (
              <>
                {change && (
                  <Badge variant={delta >= 0 ? 'success' : 'secondary'}>
                    <Trend aria-hidden="true" />
                    {change}
                  </Badge>
                )}
                <span>{fill(t.summary.previous, { count: n(previous) })}</span>
              </>
            ) : (
              copy.unavailable
            )
          }
        />
        <Stat
          label={t.stats.live}
          value={n(totals.live)}
          note={fill(t.stats.ofTotal, { n: n(total) })}
        />
        <Stat label={t.stats.waiting} value={n(totals.waiting_for_prod_sync)} />
        <Stat
          label={t.stats.inFlight}
          value={n(totals.in_progress + totals.waiting_for_merge)}
          note={`${n(totals.planned)} ${t.status.planned.toLowerCase()}`}
        />
      </dl>
    </section>
  );
}
