import { ChevronDown } from '@tuturuuu/icons';
import { shellNavOffset } from '@tuturuuu/marketing-shell';
import {
  memo,
  type ReactNode,
  Suspense,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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

type ViewTrack = RoadmapView['tracks'][number];

const FILTERS: StatusFilter[] = ['all', 'shipped', 'active', 'planned'];

/** A track's milestones narrowed to deliverables matching `filter`. */
export function filterTrack(track: ViewTrack, filter: StatusFilter) {
  return track.milestones
    .map((milestone) => ({
      ...milestone,
      shown: milestone.deliverables.filter((d) =>
        matchesFilter(d.state.status, filter)
      ),
    }))
    .filter((milestone) => milestone.shown.length);
}

export function TracksSection({
  t,
  lang,
  view,
  onDock,
}: {
  t: Messages;
  lang: Lang;
  view: RoadmapView;
  /** True once this section has reached the full-size navbar. */
  onDock?: (docked: boolean) => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  // The pressed state paints on the tap; the list follows as a deferred,
  // interruptible render (it holds hundreds of deliverables).
  const [filter, setFilter] = useState<StatusFilter>('all');
  const listFilter = useDeferredValue(filter);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !onDock) return;
    // Dock against the full pill. Compacting happens after this line is
    // crossed, so the threshold must not follow the compact offset.
    const dockLine = shellNavOffset(false);
    let frame: number | null = null;
    let docked: boolean | null = null;
    const update = () => {
      frame = null;
      const next = el.getBoundingClientRect().top < dockLine;
      if (next === docked) return;
      docked = next;
      onDock(next);
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
  return (
    <section className="section" id="tracks" aria-labelledby="tracks-title">
      <SectionHead
        id="tracks-title"
        title={t.tracks.title}
        t={t}
        info={<p>{t.tracks.subtitle}</p>}
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
          {FILTERS.map((item) => (
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
      <TrackList
        t={t}
        lang={lang}
        tracks={view.tracks}
        filter={listFilter}
        pending={listFilter !== filter}
      />
    </section>
  );
}

const TrackList = memo(function TrackList({
  t,
  lang,
  tracks,
  filter,
  pending,
}: {
  t: Messages;
  lang: Lang;
  tracks: ViewTrack[];
  filter: StatusFilter;
  pending: boolean;
}) {
  const visible = useMemo(
    () =>
      tracks
        .map((track) => ({ track, milestones: filterTrack(track, filter) }))
        .filter((entry) => entry.milestones.length),
    [tracks, filter]
  );
  return (
    <>
      {visible.length ? null : <p className="empty">{t.tracks.empty}</p>}
      <div className="track-list masonry" aria-busy={pending || undefined}>
        {visible.map(({ track, milestones }) => (
          // One hydration boundary per card: React hydrates the list in
          // small, interruptible pieces, and the card a reader taps first.
          <Suspense key={track.id}>
            <TrackCard
              t={t}
              lang={lang}
              track={track}
              milestones={milestones}
              expanded={filter !== 'all'}
            />
          </Suspense>
        ))}
      </div>
    </>
  );
});

const TrackCard = memo(function TrackCard({
  t,
  lang,
  track,
  milestones,
  expanded,
}: {
  t: Messages;
  lang: Lang;
  track: ViewTrack;
  milestones: ReturnType<typeof filterTrack>;
  expanded: boolean;
}) {
  const shipped = track.counts.live + track.counts.waiting_for_prod_sync;
  return (
    <article className="track" id={`track-${track.id}`}>
      <header>
        <div>
          <h3>{track.name}</h3>
          <p>{track.summary}</p>
        </div>
        <p className="track-count">
          <b>{shipped}</b>/{track.total} <span>{t.tracks.shippedOf}</span>
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
        {milestones.map((milestone, index) => {
          const done =
            milestone.counts.live + milestone.counts.waiting_for_prod_sync;
          return (
            <details key={milestone.id} open={index === 0 || expanded}>
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
                {milestone.shown.map((item) => (
                  <DeliverableRow key={item.id} t={t} lang={lang} item={item} />
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    </article>
  );
});

/**
 * One deliverable in as few nodes as possible (there are ~470): the status
 * glyph is a CSS mask on the row, not an inline SVG per item.
 */
function DeliverableRow({
  t,
  lang,
  item,
}: {
  t: Messages;
  lang: Lang;
  item: ViewTrack['milestones'][number]['deliverables'][number];
}) {
  const status = item.state.status;
  const note = itemNote(item, t, lang);
  return (
    <li className={status}>
      <p className="d-title">{item.title}</p>
      <p className="meta">
        {note ? (
          <>
            <span className="sr-only">{t.status[status]}. </span>
            {note}
          </>
        ) : (
          t.status[status]
        )}
        <PrLinks prs={item.state.prs} />
      </p>
    </li>
  );
}
