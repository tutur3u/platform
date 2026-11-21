/** EduFest workshop page: what you'll learn, the live demos and practical info. */
import {
  ArrowRight,
  Bot,
  CalendarDays,
  Clock,
  Gamepad2,
  GraduationCap,
  Laptop,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Ticket,
  Users,
  Video,
  Zap,
} from '@tuturuuu/icons';
import {
  DEMOS,
  demoBadge,
  LEARN,
  mapHref,
  PRACTICAL,
  WORKSHOP_EVENT,
} from '../../content/workshops/edufest-2026';
import { type EduMessages, type Statuses, WsBadge } from './shared';

const LEARN_ICON = {
  classroom: Video,
  assistant: Sparkles,
  assess: GraduationCap,
  responsible: ShieldCheck,
} as const;

export function WsLearn({ t }: { t: EduMessages }) {
  return (
    <section className="section" aria-labelledby="ws-learn">
      <header className="section-head">
        <h2 id="ws-learn">{t.learn.title}</h2>
      </header>
      <ul className="ws-learn">
        {LEARN.map((id) => {
          const Icon = LEARN_ICON[id];
          return (
            <li key={id} className="ws-card">
              <span className="ws-icon" aria-hidden>
                <Icon size={20} />
              </span>
              <h3>{t.learn.items[id].title}</h3>
              <p>{t.learn.items[id].body}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const DEMO_ICON = {
  classroom: Video,
  mira: MessageCircle,
  lms: GraduationCap,
  booth: Gamepad2,
  fleet: Bot,
  edge: Zap,
} as const;

/**
 * The live demos. A demo tied to a roadmap deliverable shows that
 * deliverable's derived status; one without a deliverable shows no badge.
 */
export function WsDemos({
  t,
  statuses,
}: {
  t: EduMessages;
  statuses: Statuses;
}) {
  return (
    <section className="section" aria-labelledby="ws-demos">
      <header className="section-head">
        <h2 id="ws-demos">{t.demos.title}</h2>
        <p>{t.demos.subtitle}</p>
      </header>
      <ul className="ws-demos">
        {DEMOS.map((demo) => {
          const Icon = DEMO_ICON[demo.id];
          const copy = t.demos.items[demo.id];
          const badge = demoBadge(demo, statuses);
          return (
            <li key={demo.id} className="ws-card ws-demo">
              <div className="ws-demo-head">
                <span className="ws-icon" aria-hidden>
                  <Icon size={20} />
                </span>
                {badge === 'coming' ? (
                  <WsBadge status="planned" label={t.demos.coming} t={t} />
                ) : badge ? (
                  <WsBadge status={badge} t={t} />
                ) : null}
              </div>
              <div className="ws-demo-body">
                <h3>{copy.title}</h3>
                <p>{copy.body}</p>
              </div>
              <p className="ws-demo-try">
                <b>{t.demos.try}</b> {copy.try}
              </p>
              {demo.href ? (
                <a
                  className="ws-demo-link"
                  href={demo.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {demo.href.replace(/^https:\/\//, '')}
                  <ArrowRight size={15} aria-hidden className="ws-link-arrow" />
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const PRACTICAL_ICON = {
  date: CalendarDays,
  time: Clock,
  venue: MapPin,
  seats: Users,
  registration: Ticket,
  bring: Laptop,
} as const;

export function WsPractical({ t }: { t: EduMessages }) {
  const map = mapHref(WORKSHOP_EVENT.mapQuery);
  const value = (id: (typeof PRACTICAL)[number]) => {
    if (id === 'date')
      return WORKSHOP_EVENT.isoDate ? (
        <time dateTime={WORKSHOP_EVENT.isoDate}>{t.hero.dateValue}</time>
      ) : (
        t.hero.toBeAnnounced
      );
    if (id === 'venue')
      return WORKSHOP_EVENT.mapQuery ? (
        <>
          {t.hero.venueValue}
          {map ? (
            <>
              {' '}
              <a
                className="ws-practical-link"
                href={map}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.hero.openMap}
              </a>
            </>
          ) : null}
        </>
      ) : (
        t.hero.toBeAnnounced
      );
    return t.practical.items[id];
  };
  return (
    <section className="section" aria-labelledby="ws-practical">
      <header className="section-head">
        <h2 id="ws-practical">{t.practical.title}</h2>
      </header>
      <dl className="ws-practical">
        {PRACTICAL.map((id) => {
          const Icon = PRACTICAL_ICON[id];
          return (
            <div key={id}>
              <dt>
                <Icon size={16} aria-hidden />
                {t.practical.labels[id]}
              </dt>
              <dd>{value(id)}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
