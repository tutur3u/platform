import { ChevronDown, ChevronLeft, ChevronRight } from '@tuturuuu/icons';
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import {
  localDate,
  periodKey,
  shiftPeriod,
  type View,
  views,
} from '../history/periods';
import {
  parseTimelineQuery,
  plannedNext,
  scrubberPeriods,
  type TimelineDeliverable,
  type TimelineGroup,
  timelinePeriod,
  timelineSearch,
} from '../history/timeline';
import { useHistory } from '../history/use-history';
import type { LiveData } from '../live/model';
import type { RoadmapView } from '../view-model';
import {
  type Lang,
  type Messages,
  PrLinks,
  SectionHead,
  StatusBadge,
} from './shared';

const GROUP_LIMIT = 6;

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

/** Animate a state change with the View Transitions API when available. */
function transition(update: () => void) {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => unknown;
  };
  if (!doc.startViewTransition || prefersReducedMotion()) return update();
  doc.startViewTransition(() => flushSync(update));
}

function periodLabel(
  view: View,
  key: string,
  start: string,
  end: string,
  lang: Lang,
  t: Messages
) {
  const locale = lang === 'en' ? 'en-GB' : 'vi-VN';
  const date = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(
      new Date(`${iso}T00:00:00Z`)
    );
  if (view === 'year') return { title: key, range: '' };
  if (view === 'month')
    return {
      title: date(start, { month: 'long', year: 'numeric' }),
      range: '',
    };
  return {
    title: `${t.timeline.weekOf} ${Number(key.slice(6))}, ${key.slice(0, 4)}`,
    range: `${date(start, { day: 'numeric', month: 'short' })} – ${date(end, { day: 'numeric', month: 'short', year: 'numeric' })}`,
  };
}

function chipLabel(view: View, key: string, lang: Lang) {
  if (view === 'year') return key;
  const locale = lang === 'en' ? 'en-GB' : 'vi-VN';
  if (view === 'month')
    return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
      .format(new Date(`${key}-01T00:00:00Z`))
      .concat(key.endsWith('-01') ? ` ${key.slice(2, 4)}` : '');
  return `W${Number(key.slice(6))}`;
}

/** Reveal items as they scroll into view; no-op under reduced motion. */
function useReveal(deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const items = [...root.querySelectorAll<HTMLElement>('[data-reveal]')];
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      for (const item of items) item.classList.add('is-visible');
      return;
    }
    const observer = new IntersectionObserver(
      (records) => {
        for (const record of records)
          if (record.isIntersecting) {
            record.target.classList.add('is-visible');
            observer.unobserve(record.target);
          }
      },
      { rootMargin: '0px 0px -8% 0px' }
    );
    for (const item of items) observer.observe(item);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

export function TimelineSection({
  t,
  lang,
  view: roadmap,
  live,
  now,
  mounted,
}: {
  t: Messages;
  lang: Lang;
  view: RoadmapView;
  live: LiveData;
  now: number;
  mounted: boolean;
}) {
  const today = localDate(now);
  const { history, state } = useHistory(live);
  const [selection, setSelection] = useState<{ view: View; period: string }>(
    () => ({
      view: 'week',
      period: periodKey(today, 'week'),
    })
  );
  // Read the shareable URL state once on the client.
  useEffect(() => {
    setSelection(
      parseTimelineQuery(window.location.search, localDate(Date.now()))
    );
  }, []);
  // Opt into scroll-reveal only once JS runs, so SSR content is never hidden.
  useEffect(() => {
    if (!prefersReducedMotion())
      document.documentElement.classList.add('js-reveal');
  }, []);
  const select = useCallback((next: { view: View; period: string }) => {
    transition(() => setSelection(next));
    const search = timelineSearch(
      next.view,
      next.period,
      localDate(Date.now())
    );
    window.history.replaceState(
      window.history.state,
      '',
      `/roadmap${search}${window.location.hash}`
    );
  }, []);
  const deliverables: TimelineDeliverable[] = roadmap.items;
  const period = useMemo(
    () =>
      timelinePeriod({
        history,
        deliverables,
        view: selection.view,
        key: selection.period,
        today,
      }),
    [history, deliverables, selection, today]
  );
  const periods = useMemo(
    () => scrubberPeriods(history, selection.view, today),
    [history, selection.view, today]
  );
  const label = periodLabel(
    selection.view,
    period.key,
    period.start,
    period.end,
    lang,
    t
  );
  const revealRef = useReveal([period.key, period.view, history]);

  return (
    <section className="section timeline" aria-labelledby="timeline-title">
      <SectionHead
        id="timeline-title"
        title={t.timeline.title}
        subtitle={t.timeline.subtitle}
      />
      <div className="timeline-controls">
        <fieldset className="segmented view-switch">
          <legend className="sr-only">{t.timeline.title}</legend>
          {views.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={selection.view === v}
              onClick={() =>
                select({ view: v, period: periodKey(period.start, v) })
              }
            >
              {t.timeline.views[v]}
            </button>
          ))}
        </fieldset>
        <Scrubber
          t={t}
          lang={lang}
          view={selection.view}
          periods={periods}
          selected={selection.period}
          current={periodKey(today, selection.view)}
          onSelect={(key) => select({ view: selection.view, period: key })}
        />
      </div>
      {state === 'loading' && mounted ? (
        <p className="hint" aria-live="polite">
          {t.timeline.loading}
        </p>
      ) : null}
      {state === 'failed' ? <p className="hint">{t.timeline.failed}</p> : null}
      <div
        className="period-panel"
        key={`${period.view}:${period.key}`}
        ref={revealRef}
        aria-live="polite"
      >
        <header className="period-head">
          <div>
            <h3>{label.title}</h3>
            {label.range ? <p>{label.range}</p> : null}
          </div>
          <dl className="period-stats">
            <div>
              <dt>{t.timeline.deliverables}</dt>
              <dd>{period.totals.deliverables}</dd>
            </div>
            <div>
              <dt>{t.timeline.features}</dt>
              <dd>{period.totals.features}</dd>
            </div>
            <div>
              <dt>{t.timeline.merged}</dt>
              <dd>{period.totals.total}</dd>
            </div>
          </dl>
        </header>
        {period.groups.length ? (
          <div className="period-groups">
            {period.groups.map((group) => (
              <PeriodGroup key={group.track} t={t} group={group} />
            ))}
          </div>
        ) : (
          <p className="empty">{t.timeline.nothing}</p>
        )}
        {period.isCurrent ? (
          <PlannedNext t={t} items={plannedNext(deliverables)} />
        ) : null}
      </div>
    </section>
  );
}

function Scrubber({
  t,
  lang,
  view,
  periods,
  selected,
  current,
  onSelect,
}: {
  t: Messages;
  lang: Lang;
  view: View;
  periods: { key: string; total: number }[];
  selected: string;
  current: string;
  onSelect: (key: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const max = Math.max(1, ...periods.map((p) => p.total));
  const first = periods[0]?.key;
  // Keep the selected period centred without moving the page vertically.
  useLayoutEffect(() => {
    const list = listRef.current;
    const chip = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!list || !chip) return;
    const left = chip.offsetLeft - list.clientWidth / 2 + chip.clientWidth / 2;
    list.scrollTo({
      left,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [selected, view, periods.length]);
  const step = (delta: number) => {
    const next = shiftPeriod(selected, view, delta);
    if ((first && next < first) || next > current) return;
    onSelect(next);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(1);
    }
  };
  return (
    <div className="scrubber">
      <button
        type="button"
        className="icon-button"
        aria-label={t.timeline.prev}
        disabled={!first || selected <= first}
        onClick={() => step(-1)}
      >
        <ChevronLeft size={16} aria-hidden />
      </button>
      <div
        className="scrubber-track"
        ref={listRef}
        role="group"
        aria-label={t.timeline.periods}
        onKeyDown={onKey}
      >
        {periods.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`chip-period${p.key === current ? ' is-now' : ''}`}
            aria-current={p.key === selected}
            aria-label={`${p.key}: ${p.total} ${p.total === 1 ? t.timeline.changeOne : t.timeline.changes}`}
            onClick={() => onSelect(p.key)}
          >
            <span className="bar" aria-hidden>
              <span
                style={{
                  height: `${Math.max(6, Math.sqrt(p.total / max) * 100)}%`,
                }}
              />
            </span>
            <span className="chip-label">
              {p.key === current
                ? t.timeline.current
                : chipLabel(view, p.key, lang)}
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="icon-button"
        aria-label={t.timeline.next}
        disabled={selected >= current}
        onClick={() => step(1)}
      >
        <ChevronRight size={16} aria-hidden />
      </button>
    </div>
  );
}

function PeriodGroup({ t, group }: { t: Messages; group: TimelineGroup }) {
  const [open, setOpen] = useState(false);
  const rows = [
    ...group.deliverables.map((d) => ({ kind: 'deliverable' as const, d })),
    ...group.features.map((f) => ({ kind: 'feature' as const, f })),
  ];
  const shown = open ? rows : rows.slice(0, GROUP_LIMIT);
  const counts = [
    group.fixes
      ? `+${group.fixes} ${group.fixes === 1 ? t.timeline.moreFix : t.timeline.moreFixes}`
      : '',
    group.other
      ? `+${group.other} ${group.other === 1 ? t.timeline.moreOtherOne : t.timeline.moreOther}`
      : '',
  ].filter(Boolean);
  return (
    <article className="period-group" data-reveal>
      <header>
        <h4>{group.name}</h4>
        <span className="ms-count">{group.total}</span>
      </header>
      {group.track === 'other' ? (
        <p className="hint">
          {group.total} {t.timeline.otherNote}
        </p>
      ) : (
        <ul>
          {shown.map((row) =>
            row.kind === 'deliverable' ? (
              <li key={`d-${row.d.id}`} className="is-deliverable">
                <span className="d-title">{row.d.title}</span>
                <span className="meta">
                  <StatusBadge status={row.d.state.status} t={t} />
                  <PrLinks prs={row.d.prs.map((number) => ({ number }))} />
                </span>
              </li>
            ) : (
              <li key={`f-${row.f.numbers[0]}`}>
                <span className="d-title">{row.f.title}</span>
                <span className="meta">
                  <PrLinks prs={row.f.numbers.map((number) => ({ number }))} />
                </span>
              </li>
            )
          )}
        </ul>
      )}
      {group.track !== 'other' &&
      (rows.length > GROUP_LIMIT || counts.length) ? (
        <footer>
          {counts.length ? (
            <span className="hint">{counts.join(' · ')}</span>
          ) : null}
          {rows.length > GROUP_LIMIT ? (
            <button
              type="button"
              className="text-button"
              onClick={() => setOpen(!open)}
            >
              {open
                ? t.timeline.showLess
                : t.timeline.showMore.replace(
                    '{n}',
                    String(rows.length - GROUP_LIMIT)
                  )}
              <ChevronDown
                size={14}
                aria-hidden
                className={open ? 'flip' : ''}
              />
            </button>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}

function PlannedNext({
  t,
  items,
}: {
  t: Messages;
  items: TimelineDeliverable[];
}) {
  if (!items.length) return null;
  return (
    <aside className="planned-next" data-reveal>
      <h4>{t.timeline.plannedTitle}</h4>
      <p className="hint">{t.timeline.plannedNote}</p>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <span className="d-title">{item.title}</span>
            <StatusBadge status={item.state.status} t={t} />
          </li>
        ))}
      </ul>
    </aside>
  );
}
