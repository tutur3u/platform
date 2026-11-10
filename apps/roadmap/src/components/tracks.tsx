import { ChevronDown } from '@tuturuuu/icons';
import { shellNavOffset } from '@tuturuuu/marketing-shell';
import { type ReactNode, useEffect, useRef } from 'react';
import { APP_NAMES } from '../live/host-probe';
import { shippedShare, statuses } from '../live/status';
import {
  matchesFilter,
  type RoadmapView,
  type StatusFilter,
} from '../view-model';
import {
  formatDate,
  type Lang,
  type Messages,
  PrLinks,
  SectionHead,
  STATUS_ICON,
} from './shared';

export function itemNote(
  item: RoadmapView['tracks'][number]['milestones'][number]['deliverables'][number],
  t: Messages,
  lang: Lang
): ReactNode {
  const { state } = item;
  if (!state.shippedAt) return null;
  const date = formatDate(state.shippedAt, lang);
  if (state.status === 'live') return `${t.status.live} · ${date}`;
  if (item.app === 'mobile') return `${t.item.nextRelease} · ${date}`;
  if (item.requires === 'workers') return `${t.item.notOnWorkers} · ${date}`;
  if (state.unverifiedDeploy) return `${t.item.unverified} · ${date}`;
  return `${t.item.awaitingDeploy} ${APP_NAMES[item.app ?? ''] ?? item.app} · ${date}`;
}

export function TracksSection({
  t,
  lang,
  view,
  filter,
  setFilter,
  onDock,
}: {
  t: Messages;
  lang: Lang;
  view: RoadmapView;
  filter: StatusFilter;
  setFilter: (filter: StatusFilter) => void;
  /** True once this section has reached the full-size navbar. */
  onDock?: (docked: boolean) => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !onDock) return;
    // Dock against the full pill. Compacting happens after this line is
    // crossed, so the threshold must not follow the compact offset.
    const dockLine = shellNavOffset(false);
    let frame: number | null = null;
    const update = () => {
      frame = null;
      onDock(el.getBoundingClientRect().top < dockLine);
    };
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [onDock]);
  const filters: StatusFilter[] = ['all', 'shipped', 'active', 'planned'];
  const visible = view.tracks
    .map((track) => ({
      ...track,
      milestones: track.milestones
        .map((milestone) => ({
          ...milestone,
          shown: milestone.deliverables.filter((d) =>
            matchesFilter(d.state.status, filter)
          ),
        }))
        .filter((milestone) => milestone.shown.length),
    }))
    .filter((track) => track.milestones.length);
  return (
    <section className="section" id="tracks" aria-labelledby="tracks-title">
      <SectionHead
        id="tracks-title"
        title={t.tracks.title}
        subtitle={t.tracks.subtitle}
      />
      <div ref={sentinelRef} className="nav-sentinel" aria-hidden />
      <div className="sticky-bar">
        <nav className="track-nav" aria-label={t.tracks.nav}>
          {view.tracks.map((track) => (
            <a key={track.id} href={`#track-${track.id}`}>
              {track.name}
              <span>{Math.round(shippedShare(track.counts) * 100)}%</span>
            </a>
          ))}
        </nav>
        <fieldset className="segmented filters">
          <legend className="sr-only">{t.filters.label}</legend>
          {filters.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
            >
              {t.filters[item]}
            </button>
          ))}
        </fieldset>
      </div>
      {visible.length ? null : <p className="empty">{t.tracks.empty}</p>}
      <div className="track-list">
        {visible.map((track) => {
          const shipped =
            track.counts.live + track.counts.waiting_for_prod_sync;
          return (
            <article className="track" id={`track-${track.id}`} key={track.id}>
              <header>
                <div>
                  <h3>{track.name}</h3>
                  <p>{track.summary}</p>
                </div>
                <p className="track-count">
                  <b>{shipped}</b>/{track.total}{' '}
                  <span>{t.tracks.shippedOf}</span>
                </p>
              </header>
              <div className="bar" aria-hidden>
                {statuses.map((s) =>
                  track.counts[s] ? (
                    <span
                      key={s}
                      className={`seg ${s}`}
                      style={{
                        width: `${(track.counts[s] / track.total) * 100}%`,
                      }}
                    />
                  ) : null
                )}
              </div>
              <div className="milestones">
                {track.milestones.map((milestone, index) => {
                  const done =
                    milestone.counts.live +
                    milestone.counts.waiting_for_prod_sync;
                  return (
                    <details
                      key={milestone.id}
                      open={index === 0 || filter !== 'all'}
                    >
                      <summary>
                        <span className="ms-title">{milestone.title}</span>
                        <span className="ms-count">
                          {done}/{milestone.deliverables.length}
                        </span>
                        <ChevronDown size={16} aria-hidden />
                      </summary>
                      {milestone.summary ? (
                        <p className="ms-summary">{milestone.summary}</p>
                      ) : null}
                      <ul className="deliverables">
                        {milestone.shown.map((item) => {
                          const Icon = STATUS_ICON[item.state.status];
                          const note = itemNote(item, t, lang);
                          return (
                            <li key={item.id} className={item.state.status}>
                              <Icon size={18} aria-hidden className="d-icon" />
                              <div>
                                <p className="d-title">{item.title}</p>
                                <p className="meta">
                                  <span className="sr-only">
                                    {t.status[item.state.status]}.{' '}
                                  </span>
                                  {note ? (
                                    <span>{note}</span>
                                  ) : (
                                    <span>{t.status[item.state.status]}</span>
                                  )}
                                  <PrLinks prs={item.state.prs} />
                                </p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
