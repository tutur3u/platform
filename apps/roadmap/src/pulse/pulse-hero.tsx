import type {
  Lang,
  Messages,
} from '@tuturuuu/roadmap-core/components/shared.tsx';
import { formatDate } from '@tuturuuu/roadmap-core/components/shared.tsx';
import {
  fill,
  formatDuration,
  formatNumber,
} from '@tuturuuu/roadmap-core/components/insights/format.ts';
import { REPO_URL } from '@tuturuuu/roadmap-core/live/model.ts';
import { GitCommitHorizontal, GitPullRequest } from '@tuturuuu/icons';
import type { RoadmapSnapshot } from '../roadmap-snapshot';

export function PulseBars({
  daily,
  label,
}: {
  daily: readonly number[];
  label: string;
}) {
  const max = Math.max(1, ...daily);
  return (
    <div className="pulse-bars" role="img" aria-label={label}>
      {daily.map((count, index) => (
        <span
          key={index}
          data-week={index >= daily.length - 7 ? '' : undefined}
          data-empty={count === 0 ? '' : undefined}
          style={{
            blockSize: `${Math.max(count ? 8 : 3, (count * 100) / max)}%`,
          }}
          title={String(count)}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

export function PulseHero({
  t,
  lang,
  snapshot,
  sampled,
  now,
}: {
  t: Messages;
  lang: Lang;
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
  const prs = snapshot?.products.reduce(
    (sum, product) => sum + product.prs7d,
    0
  );
  return (
    <section className="pulse-hero" aria-labelledby="page-title">
      <div className="pulse-livebar">
        {snapshot?.productionSha ? (
          <a
            className="pulse-live pulse-sha"
            href={`${REPO_URL}/commit/${snapshot.productionSha}`}
          >
            <span className="pulse-dot" aria-hidden="true" />
            {copy.production}
            <GitCommitHorizontal aria-hidden="true" size={16} />
            <code>{snapshot.productionSha.slice(0, 7)}</code>
          </a>
        ) : (
          <span className="pulse-chip">{copy.productionUnknown}</span>
        )}
        {snapshot && (
          <time
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
        {snapshot && !sampled && <span>{copy.snapshot}</span>}
      </div>
      <div className="pulse-hero-grid">
        <div>
          <h1 id="page-title">{copy.title}</h1>
          <p className="pulse-hero-number">
            {snapshot ? n(snapshot.commits7d) : '—'}
          </p>
          <p className="pulse-hero-caption">{copy.weekly}</p>
          {snapshot ? (
            <div className="pulse-chips">
              {change && (
                <span
                  className="pulse-chip"
                  data-positive={delta > 0 || undefined}
                >
                  {change}
                </span>
              )}
              <span className="pulse-chip">
                {fill(copy.previous, { count: n(previous) })}
              </span>
              {sampled && prs !== undefined && (
                <span className="pulse-chip">
                  <GitPullRequest size={14} aria-hidden="true" />
                  {fill(copy.pulls, { count: n(prs) })}
                </span>
              )}
            </div>
          ) : (
            <p>{copy.unavailable}</p>
          )}
        </div>
        {snapshot?.daily && (
          <div className="pulse-hero-chart">
            <PulseBars daily={snapshot.daily} label={copy.series} />
            <div className="pulse-axis">
              <span>{copy.firstDay}</span>
              <span>{copy.today}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
