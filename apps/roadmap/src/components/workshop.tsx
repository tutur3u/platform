import {
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  CircleCheck,
  CircleDashed,
  CircleDot,
  GraduationCap,
  MapPin,
  NotebookPen,
  Sparkles,
  Users,
} from '@tuturuuu/icons';
import { useId, useMemo, useState } from 'react';
import type en from '../../messages/edufest-2026.en.json';
import { tracks } from '../content/tracks';
import {
  AGENDA,
  AI_LEVELS,
  AI_LEVELS_DELIVERABLE,
  type AiLevel,
  CAPABILITIES,
  CLASSROOM_FLOW,
  EXPERIENCES,
  FAQ,
  HIGHLIGHTS,
  INSIGHTS_DELIVERABLE,
  INSIGHTS_DEMO,
  JOURNEY,
  OUTCOMES,
  ROLES,
  type Role,
  TEACHER_SEAT_FROM,
  TOOLS,
  toWorkshopStatus,
  USE_CASES,
  type UseCase,
  buildIcs,
  mapHref,
  WORKSHOP_EVENT,
  WORKSHOP_URL,
  type WorkshopStatus,
} from '../content/workshops/edufest-2026';
import type { LiveData } from '../live/model';
import { deriveTracks, indexLiveData } from '../live/status';

export type EduMessages = typeof en;

const STATUS_ICON = {
  live: CircleCheck,
  in_progress: CircleDot,
  planned: CircleDashed,
} as const;

const BY_ID = new Map(USE_CASES.map((item) => [item.id, item]));

/** Every deliverable's page status, derived from the same live data as /roadmap. */
export function useWorkshopStatuses(data: LiveData) {
  return useMemo(() => {
    const statuses = new Map<string, WorkshopStatus>();
    for (const track of deriveTracks(tracks, indexLiveData(data)))
      for (const milestone of track.milestones)
        for (const deliverable of milestone.deliverables)
          statuses.set(
            deliverable.id,
            toWorkshopStatus(deliverable.state.status)
          );
    return statuses;
  }, [data]);
}

type Statuses = ReadonlyMap<string, WorkshopStatus>;

/** A use case's status; an unknown deliverable reads as planned, never live. */
function statusOf(item: UseCase, statuses: Statuses): WorkshopStatus {
  return statuses.get(item.deliverable) ?? 'planned';
}

export function WsBadge({
  status,
  t,
}: {
  status: WorkshopStatus;
  t: EduMessages;
}) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`badge ws-badge ${status}`}>
      <Icon size={13} aria-hidden />
      {t.status[status]}
    </span>
  );
}

function UseCaseRow({
  id,
  t,
  statuses,
}: {
  id: string;
  t: EduMessages;
  statuses: Statuses;
}) {
  const item = BY_ID.get(id);
  if (!item) return null;
  return (
    <li className="ws-use">
      <span className="ws-use-title">
        {t.capabilities.items[id as keyof EduMessages['capabilities']['items']]}
      </span>
      <span className="ws-use-meta">
        <span className="ws-tool">{t.tools.names[item.tool]}</span>
        <WsBadge status={statusOf(item, statuses)} t={t} />
      </span>
    </li>
  );
}

export function WsHero({ t }: { t: EduMessages }) {
  const noteId = useId();
  return (
    <section className="ws-hero" aria-labelledby="ws-title">
      <span className="chip glow">{t.hero.eyebrow}</span>
      <h1 id="ws-title">
        <span>{t.hero.title}</span>
        <span className="accent">{t.hero.titleAccent}</span>
      </h1>
      <p className="intro">{t.hero.subtitle}</p>
      <dl className="ws-facts">
        <div>
          <dt>{t.hero.date}</dt>
          <dd>
            {WORKSHOP_EVENT.isoDate ? (
              <time dateTime={WORKSHOP_EVENT.isoDate}>{t.hero.dateValue}</time>
            ) : (
              t.hero.toBeAnnounced
            )}
          </dd>
        </div>
        <div>
          <dt>{t.hero.venue}</dt>
          <dd>
            {WORKSHOP_EVENT.mapQuery ? t.hero.venueValue : t.hero.toBeAnnounced}
          </dd>
        </div>
        <div>
          <dt className="sr-only">{t.hero.seats}</dt>
          <dd className="ws-seats">{t.hero.seats}</dd>
        </div>
      </dl>
      <EventLinks t={t} />
      <div className="ws-cta-row">
        {/* Registration is not open: a real, focusable control that says so. */}
        <button
          type="button"
          className="ws-cta"
          aria-disabled="true"
          aria-describedby={noteId}
          onClick={(event) => event.preventDefault()}
        >
          {t.hero.cta}
        </button>
        <p id={noteId} className="ws-scarcity">
          {t.hero.scarcity}
        </p>
      </div>
    </section>
  );
}

function EventLinks({ t }: { t: EduMessages }) {
  const map = mapHref(WORKSHOP_EVENT.mapQuery);
  const ics = WORKSHOP_EVENT.isoDate
    ? buildIcs({
        isoDate: WORKSHOP_EVENT.isoDate,
        title: t.meta.title,
        location: t.hero.venueValue,
        url: WORKSHOP_URL,
      })
    : null;
  if (!map && !ics) return null;
  return (
    <p className="ws-event-links">
      {ics ? (
        <a
          href={`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`}
          download="edufest-2026-workshop.ics"
        >
          <CalendarPlus size={15} aria-hidden />
          {t.hero.addToCalendar}
        </a>
      ) : null}
      {map ? (
        <a href={map} target="_blank" rel="noopener noreferrer">
          <MapPin size={15} aria-hidden />
          {t.hero.openMap}
        </a>
      ) : null}
    </p>
  );
}

export function WsAgenda({ t }: { t: EduMessages }) {
  return (
    <section className="section" aria-labelledby="ws-agenda">
      <header className="section-head">
        <h2 id="ws-agenda">{t.agenda.title}</h2>
        <p>{t.agenda.subtitle}</p>
      </header>
      <div className="ws-two">
        <ol className="ws-agenda">
          {AGENDA.map((id, index) => (
            <li key={id}>
              <span className="ws-num" aria-hidden>
                {index + 1}
              </span>
              <div>
                <h3>{t.agenda.items[id].title}</h3>
                <p>{t.agenda.items[id].body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="ws-card">
          <h3>{t.outcomes.title}</h3>
          <ul className="ws-outcomes">
            {OUTCOMES.map((id) => (
              <li key={id}>
                <CircleCheck size={16} aria-hidden />
                {t.outcomes.items[id]}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function WsJourney({
  t,
  statuses,
}: {
  t: EduMessages;
  statuses: Statuses;
}) {
  const [index, setIndex] = useState(0);
  const step = JOURNEY[index] ?? JOURNEY[0];
  const teacherFrom = JOURNEY.findIndex(
    (item) => item.id === TEACHER_SEAT_FROM
  );
  const teacher = index >= teacherFrom;
  const copy =
    t.journey.steps[step.id as keyof EduMessages['journey']['steps']];
  return (
    <section className="section" aria-labelledby="ws-journey">
      <header className="section-head">
        <h2 id="ws-journey">{t.journey.title}</h2>
        <p>{t.journey.subtitle}</p>
      </header>
      <div className="ws-card ws-journey">
        <ol className="ws-steps">
          {JOURNEY.map((item, position) => (
            <li key={item.id}>
              <button
                type="button"
                aria-current={position === index ? 'step' : undefined}
                aria-label={`${t.journey.step} ${position + 1}: ${
                  t.journey.steps[
                    item.id as keyof EduMessages['journey']['steps']
                  ].title
                }`}
                onClick={() => setIndex(position)}
              >
                {position + 1}
              </button>
            </li>
          ))}
        </ol>
        <div className="ws-step" aria-live="polite">
          <span className={`ws-seat ${teacher ? 'teacher' : 'student'}`}>
            {teacher ? t.journey.seatTeacher : t.journey.seatStudent}
          </span>
          <h3>
            <span className="ws-step-count">
              {t.journey.step} {index + 1}/{JOURNEY.length}
            </span>{' '}
            {copy.title}
          </h3>
          <p>{copy.body}</p>
          <p className="ws-uses-label">{t.journey.uses}</p>
          <ul className="ws-uses">
            {step.uses.map((id) => (
              <UseCaseRow key={id} id={id} t={t} statuses={statuses} />
            ))}
          </ul>
        </div>
        <div className="ws-step-nav">
          <button
            type="button"
            className="ws-ghost"
            disabled={index === 0}
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
          >
            <ArrowLeft size={16} aria-hidden />
            {t.journey.previous}
          </button>
          <button
            type="button"
            className="ws-ghost"
            disabled={index === JOURNEY.length - 1}
            onClick={() =>
              setIndex((value) => Math.min(JOURNEY.length - 1, value + 1))
            }
          >
            {t.journey.next}
            <ArrowRight size={16} aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}

export function WsAiDemo({
  t,
  statuses,
}: {
  t: EduMessages;
  statuses: Statuses;
}) {
  const [level, setLevel] = useState<AiLevel>('off');
  const name = useId();
  const status = statuses.get(AI_LEVELS_DELIVERABLE) ?? 'planned';
  return (
    <section className="section" aria-labelledby="ws-ai">
      <header className="section-head">
        <h2 id="ws-ai">{t.aiDemo.title}</h2>
        <p>{t.aiDemo.subtitle}</p>
      </header>
      <div className="ws-card ws-ai">
        <fieldset className="segmented ws-levels">
          <legend className="sr-only">{t.aiDemo.legend}</legend>
          {AI_LEVELS.map((id) => (
            <label key={id} data-checked={level === id ? '' : undefined}>
              <input
                type="radio"
                name={name}
                value={id}
                checked={level === id}
                onChange={() => setLevel(id)}
              />
              {t.aiDemo.levels[id].label}
            </label>
          ))}
        </fieldset>
        <div className="ws-chat">
          <p className="ws-bubble student">
            <span className="ws-who">{t.aiDemo.student}</span>
            {t.aiDemo.question}
          </p>
          <p className={`ws-bubble assistant ${level}`} aria-live="polite">
            <span className="ws-who">{t.aiDemo.assistant}</span>
            {t.aiDemo.levels[level].reply}
          </p>
        </div>
        <p className="ws-note">
          <WsBadge status={status} t={t} /> {t.aiDemo.note}
        </p>
      </div>
    </section>
  );
}

export function WsFlow({
  t,
  statuses,
}: {
  t: EduMessages;
  statuses: Statuses;
}) {
  return (
    <section className="section" aria-labelledby="ws-flow">
      <header className="section-head">
        <h2 id="ws-flow">{t.flow.title}</h2>
        <p>{t.flow.subtitle}</p>
      </header>
      <ol className="ws-flow">
        {CLASSROOM_FLOW.map((stage, position) => (
          <li key={stage.id} className="ws-card">
            <h3>
              <span className="ws-num" aria-hidden>
                {position + 1}
              </span>
              {t.flow.stages[stage.id as keyof EduMessages['flow']['stages']]}
            </h3>
            <ul className="ws-uses">
              {stage.uses.map((id) => (
                <UseCaseRow key={id} id={id} t={t} statuses={statuses} />
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}

type RoleFilter = 'all' | Role;
type StatusFilter = 'all' | WorkshopStatus;
const STATUS_FILTERS: StatusFilter[] = [
  'all',
  'live',
  'in_progress',
  'planned',
];

/**
 * Capabilities grouped by what they do, with the role and status explorer
 * on top: one list, filtered in place, so nothing is shown twice.
 */
export function WsCapabilities({
  t,
  statuses,
}: {
  t: EduMessages;
  statuses: Statuses;
}) {
  const [role, setRole] = useState<RoleFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const shown = USE_CASES.filter(
    (item) =>
      (role === 'all' || item.roles.includes(role)) &&
      (status === 'all' || statusOf(item, statuses) === status)
  );
  const groups = CAPABILITIES.map((group) => ({
    group,
    items: shown.filter((item) => item.capability === group),
  })).filter((entry) => entry.items.length > 0);
  return (
    <section className="section" aria-labelledby="ws-capabilities">
      <header className="section-head">
        <h2 id="ws-capabilities">{t.capabilities.title}</h2>
        <p>{t.capabilities.subtitle}</p>
      </header>
      <p className="ws-honesty">{t.capabilities.honesty}</p>
      <div className="ws-explore" role="group" aria-labelledby="ws-explorer">
        <h3 id="ws-explorer">{t.explorer.title}</h3>
        <div className="ws-filters">
          <fieldset className="segmented filters">
            <legend className="sr-only">{t.explorer.role}</legend>
            {(['all', ...ROLES] as RoleFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={role === item}
                onClick={() => setRole(item)}
              >
                {item === 'all' ? t.explorer.all : t.explorer.roles[item]}
              </button>
            ))}
          </fieldset>
          <fieldset className="segmented filters">
            <legend className="sr-only">{t.explorer.status}</legend>
            {STATUS_FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={status === item}
                onClick={() => setStatus(item)}
              >
                {item === 'all' ? t.explorer.all : t.status[item]}
              </button>
            ))}
          </fieldset>
        </div>
        <p className="ws-count" aria-live="polite">
          {shown.length} {t.explorer.shown}
        </p>
      </div>
      {groups.length ? (
        <div className="ws-groups">
          {groups.map(({ group, items }) => (
            <div key={group} className="ws-card">
              <h3>{t.capabilities.groups[group]}</h3>
              <ul className="ws-uses">
                {items.map((item) => (
                  <UseCaseRow
                    key={item.id}
                    id={item.id}
                    t={t}
                    statuses={statuses}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty">{t.explorer.none}</p>
      )}
    </section>
  );
}

export function WsTools({ t, logo }: { t: EduMessages; logo: string }) {
  return (
    <section className="section ws-tools" aria-labelledby="ws-tools">
      <header className="section-head">
        <h2 id="ws-tools">{t.tools.title}</h2>
        <p>{t.tools.subtitle}</p>
      </header>
      <p className="ws-powered">
        <span>{t.tools.poweredBy}</span>
        <img src={logo} alt="" width={20} height={20} />
        <strong>Tuturuuu</strong>
        <span aria-hidden>·</span>
        <strong>Upskii</strong>
      </p>
      <ul className="ws-tool-list">
        {TOOLS.map((tool) => (
          <li key={tool} className="ws-tool">
            {t.tools.names[tool]}
          </li>
        ))}
      </ul>
      <a className="text-button" href="/roadmap">
        {t.tools.roadmap}
      </a>
    </section>
  );
}

const HIGHLIGHT_ICON = {
  seat: Users,
  agents: Sparkles,
  early: GraduationCap,
  plan: NotebookPen,
} as const;

export function WsHighlights({ t }: { t: EduMessages }) {
  return (
    <section className="section" aria-labelledby="ws-highlights">
      <header className="section-head">
        <h2 id="ws-highlights">{t.highlights.title}</h2>
      </header>
      <ul className="ws-highlights">
        {HIGHLIGHTS.map((id) => {
          const Icon = HIGHLIGHT_ICON[id];
          return (
            <li key={id} className="ws-card">
              <span className="ws-highlight-icon" aria-hidden>
                <Icon size={20} />
              </span>
              <h3>{t.highlights.items[id].title}</h3>
              <p>{t.highlights.items[id].body}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Real counts across this page's capabilities, from the live roadmap data. */
export function WsReadiness({
  t,
  statuses,
  checkedAt,
  lang,
}: {
  t: EduMessages;
  statuses: Statuses;
  checkedAt: string;
  lang: 'en' | 'vi';
}) {
  const counts = { live: 0, in_progress: 0, planned: 0 };
  for (const item of USE_CASES) counts[statusOf(item, statuses)] += 1;
  const total = USE_CASES.length;
  const order: WorkshopStatus[] = ['live', 'in_progress', 'planned'];
  const when = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'vi-VN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(checkedAt));
  return (
    <section className="section" aria-labelledby="ws-readiness">
      <header className="section-head">
        <h2 id="ws-readiness">{t.readiness.title}</h2>
        <p>{t.readiness.subtitle}</p>
      </header>
      <div className="ws-card ws-readiness">
        <dl className="ws-tiles">
          {order.map((status) => {
            const Icon = STATUS_ICON[status];
            return (
              <div key={status} className={`ws-tile ${status}`}>
                <dt>
                  <Icon size={15} aria-hidden />
                  {t.status[status]}
                </dt>
                <dd>{counts[status]}</dd>
              </div>
            );
          })}
        </dl>
        <div
          className="ws-segbar"
          role="img"
          aria-label={`${t.readiness.legend}: ${order
            .map((status) => `${t.status[status]} ${counts[status]}`)
            .join(', ')}; ${total} ${t.readiness.total}`}
        >
          {order.map((status) =>
            counts[status] ? (
              <span
                key={status}
                className={`ws-seg ${status}`}
                style={{ flexGrow: counts[status] }}
                title={`${t.status[status]}: ${counts[status]}/${total}`}
              />
            ) : null
          )}
        </div>
        <p className="ws-source">
          {t.readiness.source} <time dateTime={checkedAt}>{when}</time> ·{' '}
          <a href="/roadmap">{t.tools.roadmap}</a>
        </p>
      </div>
    </section>
  );
}

/** Seat-swap illustration: decorative, described once for screen readers. */
export function WsSeatSwap({ t }: { t: EduMessages }) {
  const rows = [0, 1, 2];
  const cols = [0, 1];
  return (
    <svg
      className="ws-illustration"
      viewBox="0 0 340 170"
      role="img"
      aria-label={t.illustration.label}
    >
      {/* The front of the room: board, empty teacher desk, the teacher leaving. */}
      <rect
        x="22"
        y="16"
        width="96"
        height="9"
        rx="4.5"
        className="ws-ill-board"
      />
      <rect
        x="36"
        y="56"
        width="68"
        height="24"
        rx="8"
        className="ws-ill-desk teacher"
      />
      <circle cx="70" cy="44" r="9" className="ws-ill-person teacher" />
      {/* The move to the student seat. */}
      <path d="M112 52 C 150 18, 196 22, 214 46" className="ws-ill-arrow" />
      <path d="M205 42 L 215 48 L 216 37" className="ws-ill-arrow" />
      {/* Student desks, each learner sitting behind one. */}
      {rows.map((row) =>
        cols.map((col) => {
          const x = 206 + col * 66;
          const y = 62 + row * 36;
          const swapped = row === 0 && col === 0;
          return (
            <g key={`${row}-${col}`}>
              <circle
                cx={x + 22}
                cy={y - 2}
                r="7.5"
                className={`ws-ill-person${swapped ? ' student' : ''}`}
              />
              <rect
                x={x}
                y={y + 6}
                width="44"
                height="16"
                rx="5"
                className="ws-ill-desk"
              />
            </g>
          );
        })
      )}
      {/* The AI agent, linked to every row. */}
      <g className="ws-ill-agent">
        <rect x="130" y="112" width="40" height="28" rx="9" />
        <circle cx="143" cy="126" r="3" />
        <circle cx="157" cy="126" r="3" />
      </g>
      {rows.map((row) => (
        <path
          key={row}
          d={`M170 126 L 202 ${76 + row * 36}`}
          className="ws-ill-link"
        />
      ))}
    </svg>
  );
}

export function WsExperience({ t }: { t: EduMessages }) {
  return (
    <section className="section" aria-labelledby="ws-experience">
      <header className="section-head">
        <h2 id="ws-experience">{t.experience.title}</h2>
        <p>{t.experience.subtitle}</p>
      </header>
      <ul className="ws-experience">
        {EXPERIENCES.map((item) => (
          <li key={item.id} className="ws-card">
            <span className={`ws-seat ${item.seat}`}>
              {t.experience.seats[item.seat]}
            </span>
            <p>
              {
                t.experience.items[
                  item.id as keyof EduMessages['experience']['items']
                ]
              }
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A mock class-insights dashboard. Every number is sample data, labelled. */
export function WsInsightsDemo({
  t,
  statuses,
}: {
  t: EduMessages;
  statuses: Statuses;
}) {
  const demo = INSIGHTS_DEMO;
  const status = statuses.get(INSIGHTS_DELIVERABLE) ?? 'planned';
  const aiOrder = ['hints', 'full', 'none'] as const;
  const quizMax = Math.max(
    ...demo.quizBuckets.map((bucket) => bucket.learners)
  );
  const tableId = useId();
  return (
    <section className="section" aria-labelledby="ws-insights">
      <header className="section-head">
        <h2 id="ws-insights">{t.insights.title}</h2>
        <p>{t.insights.subtitle}</p>
      </header>
      <div className="ws-card ws-dashboard">
        <p className="ws-demo-flag">
          <span className="ws-demo-pill">{t.insights.demo}</span>
          {t.insights.demoNote} <WsBadge status={status} t={t} />
        </p>
        <dl className="ws-kpis">
          <div>
            <dt>{t.insights.joined}</dt>
            <dd>
              {demo.joined}/{demo.learners}
            </dd>
          </div>
          <div>
            <dt>{t.insights.questions}</dt>
            <dd>{demo.questionsToAi}</dd>
          </div>
          <div>
            <dt>
              {t.insights.average} ({t.insights.outOf})
            </dt>
            <dd>
              {demo.averageQuiz.toLocaleString(undefined, {
                minimumFractionDigits: 1,
              })}
            </dd>
          </div>
        </dl>
        <div className="ws-charts">
          <figure className="ws-chart">
            <figcaption>
              <strong>{t.insights.participationTitle}</strong>
              <span>{t.insights.participationNote}</span>
            </figcaption>
            <div
              className="ws-bars"
              role="img"
              aria-label={`${t.insights.participationTitle}: ${demo.participation.map((value, index) => `${t.insights.learner} ${index + 1} ${value}%`).join(', ')}`}
            >
              {demo.participation.map((value, index) => (
                <span
                  key={index}
                  className="ws-bar"
                  style={{ height: `${value}%` }}
                  title={`${t.insights.learner} ${index + 1}: ${value}%`}
                />
              ))}
            </div>
          </figure>
          <figure className="ws-chart">
            <figcaption>
              <strong>{t.insights.aiTitle}</strong>
            </figcaption>
            <div
              className="ws-stack"
              role="img"
              aria-label={`${t.insights.aiTitle}: ${aiOrder.map((key) => `${t.insights.aiLevels[key]} ${demo.aiHelp[key]}%`).join(', ')}`}
            >
              {aiOrder.map((key) => (
                <span
                  key={key}
                  className={`ws-stack-seg ${key}`}
                  style={{ flexGrow: demo.aiHelp[key] }}
                  title={`${t.insights.aiLevels[key]}: ${demo.aiHelp[key]}%`}
                />
              ))}
            </div>
            <ul className="ws-legend">
              {aiOrder.map((key) => (
                <li key={key}>
                  <span className={`ws-swatch ${key}`} aria-hidden />
                  {t.insights.aiLevels[key]}{' '}
                  <strong>{demo.aiHelp[key]}%</strong>
                </li>
              ))}
            </ul>
          </figure>
          <figure className="ws-chart">
            <figcaption>
              <strong>{t.insights.quizTitle}</strong>
              <span>{t.insights.quizNote}</span>
            </figcaption>
            <ul className="ws-hbars">
              {demo.quizBuckets.map((bucket) => (
                <li
                  key={bucket.range}
                  title={`${bucket.range}: ${bucket.learners} ${t.insights.learnersWord}`}
                >
                  <span className="ws-hbar-label">{bucket.range}</span>
                  <span className="ws-hbar-track">
                    <span
                      className="ws-hbar"
                      style={{ width: `${(bucket.learners / quizMax) * 100}%` }}
                    />
                  </span>
                  <span className="ws-hbar-value">{bucket.learners}</span>
                </li>
              ))}
            </ul>
          </figure>
          <figure className="ws-chart">
            <figcaption>
              <strong>{t.insights.stuckTitle}</strong>
            </figcaption>
            <ol className="ws-stuck">
              {demo.stickingPoints.map((id) => (
                <li key={id}>{t.insights.stuck[id]}</li>
              ))}
            </ol>
          </figure>
        </div>
        <details className="ws-table">
          <summary aria-controls={tableId}>{t.insights.table}</summary>
          <table id={tableId}>
            <thead>
              <tr>
                <th scope="col">{t.insights.metric}</th>
                <th scope="col">{t.insights.value}</th>
              </tr>
            </thead>
            <tbody>
              {demo.participation.map((value, index) => (
                <tr key={`p${index}`}>
                  <th scope="row">
                    {t.insights.participationTitle} · {t.insights.learner}{' '}
                    {index + 1}
                  </th>
                  <td>{value}%</td>
                </tr>
              ))}
              {aiOrder.map((key) => (
                <tr key={key}>
                  <th scope="row">
                    {t.insights.aiTitle} · {t.insights.aiLevels[key]}
                  </th>
                  <td>{demo.aiHelp[key]}%</td>
                </tr>
              ))}
              {demo.quizBuckets.map((bucket) => (
                <tr key={bucket.range}>
                  <th scope="row">
                    {t.insights.quizTitle} · {bucket.range}
                  </th>
                  <td>
                    {bucket.learners} {t.insights.learnersWord}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </section>
  );
}

export function WsFaq({ t }: { t: EduMessages }) {
  return (
    <section className="section" aria-labelledby="ws-faq">
      <header className="section-head">
        <h2 id="ws-faq">{t.faq.title}</h2>
      </header>
      <div className="ws-faq">
        {FAQ.map((id) => (
          <details key={id} className="ws-card">
            <summary>{t.faq.items[id].q}</summary>
            <p>{t.faq.items[id].a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
