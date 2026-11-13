/** EduFest workshop page: the hero, its product stage and the event links. */
import { ArrowRight, CalendarPlus, MapPin } from '@tuturuuu/icons';
import { useId } from 'react';
import {
  buildIcs,
  mapHref,
  WORKSHOP_EVENT,
  WORKSHOP_URL,
} from '../../content/workshops/edufest-2026';
import { type EduMessages } from './shared';

/** The title with its one emphasised phrase underlined, kallo-style. */
function MarkedTitle({ text, mark }: { text: string; mark: string }) {
  const at = mark ? text.indexOf(mark) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="ws-mark">{mark}</span>
      {text.slice(at + mark.length)}
    </>
  );
}

export function WsHero({ t }: { t: EduMessages }) {
  const noteId = useId();
  return (
    <section className="ws-hero" aria-labelledby="ws-title">
      <div className="ws-hero-wash" aria-hidden />
      <p className="ws-eyebrow">
        <span className="ws-eyebrow-dot" aria-hidden />
        {t.hero.eyebrow}
      </p>
      <h1 id="ws-title">
        <span className="ws-h1-main">
          <MarkedTitle text={t.hero.title} mark={t.hero.titleMark} />
        </span>
        <span className="ws-h1-sub">{t.hero.titleAccent}</span>
      </h1>
      <p className="intro">{t.hero.subtitle}</p>
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
        <EventLinks t={t} />
      </div>
      <dl className="ws-facts" aria-label={t.hero.factsLabel}>
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
      </dl>
      <p id={noteId} className="ws-scarcity">
        <span className="ws-seats">{t.hero.seats}</span> · {t.hero.scarcity}
      </p>
      <WsHeroStage t={t} />
    </section>
  );
}

/**
 * The hero's product moment: a live class seen from a student seat, with the
 * question being typed and the agent's hint. Illustrative, so it is one
 * labelled image to assistive tech.
 */
function WsHeroStage({ t }: { t: EduMessages }) {
  const seats = ['a', 'b', 'c', 'you', 'd', 'e', 'f', 'g'];
  return (
    <figure className="ws-stage-card" role="img" aria-label={t.hero.stageLabel}>
      <div className="ws-stage-scene" aria-hidden>
        <div className="ws-stage-window">
          <div className="ws-stage-bar">
            <span className="ws-stage-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="ws-stage-title">{t.hero.stageWindow}</span>
            <span className="ws-stage-live">{t.hero.stageLive}</span>
          </div>
          <div className="ws-stage-body">
            <div className="ws-stage-slide">
              <span className="ws-stage-kicker">{t.hero.stageLesson}</span>
              <strong>{t.hero.stageLessonTitle}</strong>
              <ol>
                {t.hero.stageBullets.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
            </div>
            <ul className="ws-stage-seats">
              {seats.map((seat) => (
                <li
                  key={seat}
                  className={seat === 'you' ? 'is-you' : undefined}
                >
                  {seat === 'you' ? t.hero.stageYou : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="ws-stage-composer">
          <p className="ws-stage-typing">
            {t.hero.stageTyping}
            <span className="ws-caret" />
          </p>
          <p className="ws-stage-reply">
            <b>{t.hero.stageHint}</b> {t.hero.stageReply}
          </p>
        </div>
      </div>
    </figure>
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
          <CalendarPlus size={16} aria-hidden />
          {t.hero.addToCalendar}
          <ArrowRight size={15} aria-hidden className="ws-link-arrow" />
        </a>
      ) : null}
      {map ? (
        <a href={map} target="_blank" rel="noopener noreferrer">
          <MapPin size={16} aria-hidden />
          {t.hero.openMap}
          <ArrowRight size={15} aria-hidden className="ws-link-arrow" />
        </a>
      ) : null}
    </p>
  );
}
