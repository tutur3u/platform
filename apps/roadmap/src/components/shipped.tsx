import { ChevronDown } from '@tuturuuu/icons';
import { useState } from 'react';
import { REPO_URL } from '../live/model';
import { groupByDay, type RoadmapView } from '../view-model';
import {
  dayLabel,
  formatDate,
  type Lang,
  type Messages,
  PrLinks,
  SectionHead,
  StatusBadge,
} from './shared';

export const RECENT_LIMIT = 8;

export function ShippedSection({
  t,
  lang,
  view,
}: {
  t: Messages;
  lang: Lang;
  view: RoadmapView;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? view.recent : view.recent.slice(0, RECENT_LIMIT);
  const groups = groupByDay(shown, (item) => item.state.shippedAt as string);
  return (
    <section className="section" aria-labelledby="shipped-title">
      <SectionHead
        id="shipped-title"
        title={t.shipped.title}
        subtitle={t.shipped.subtitle}
      />
      {groups.length ? (
        <ol className="timeline">
          {groups.map((group) => (
            <li key={group.day}>
              <h3 className={group.day === view.today ? 'today' : ''}>
                {dayLabel(group.day, view.today, t, lang)}
              </h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item.id} className="ship">
                    <span className={`node ${item.state.status}`} aria-hidden />
                    <div>
                      <p className="ship-title">{item.title}</p>
                      <p className="meta">
                        <span className="chip">{item.trackName}</span>
                        <StatusBadge status={item.state.status} t={t} />
                        <PrLinks prs={item.state.prs} />
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : (
        <p className="empty">{t.shipped.empty}</p>
      )}
      {view.recent.length > RECENT_LIMIT ? (
        <button
          type="button"
          className="text-button"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded
            ? t.shipped.showLess
            : `${t.shipped.showAll} (${view.recent.length})`}
        </button>
      ) : null}
      {view.feed.length ? (
        <details className="feed">
          <summary>
            {t.shipped.more} <b>{view.feed.length}</b>
            <ChevronDown size={16} aria-hidden />
          </summary>
          <p className="hint">{t.shipped.moreHint}</p>
          <ul>
            {view.feed.map((item) => (
              <li key={item.number}>
                <time dateTime={item.mergedAt}>
                  {formatDate(item.mergedAt, lang)}
                </time>
                <span>{item.title}</span>
                <a href={`${REPO_URL}/pull/${item.number}`}>#{item.number}</a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
