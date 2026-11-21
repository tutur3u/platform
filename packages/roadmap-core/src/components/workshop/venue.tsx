/**
 * EduFest workshop page: the venue and practical information. The map is a
 * drawn illustration linking to Google Maps, so the page loads no map tiles
 * or third-party frames.
 */
import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  Clock,
  Laptop,
  MapPin,
  Ticket,
  Users,
} from '@tuturuuu/icons';
import {
  buildIcs,
  mapHref,
  PRACTICAL,
  WORKSHOP_EVENT,
  WORKSHOP_URL,
} from '../../content/workshops/edufest-2026';
import type { EduMessages } from './shared';

const PRACTICAL_ICON = {
  date: CalendarDays,
  time: Clock,
  venue: MapPin,
  seats: Users,
  registration: Ticket,
  bring: Laptop,
} as const;

export function WsVenue({ t }: { t: EduMessages }) {
  const map = mapHref(WORKSHOP_EVENT.mapQuery);
  const ics = WORKSHOP_EVENT.isoDate
    ? buildIcs({
        isoDate: WORKSHOP_EVENT.isoDate,
        title: t.meta.title,
        location: t.hero.venueValue,
        url: WORKSHOP_URL,
      })
    : null;
  const value = (id: (typeof PRACTICAL)[number]) => {
    if (id === 'date')
      return WORKSHOP_EVENT.isoDate ? (
        <time dateTime={WORKSHOP_EVENT.isoDate}>{t.hero.dateValue}</time>
      ) : (
        t.hero.toBeAnnounced
      );
    if (id === 'venue')
      return WORKSHOP_EVENT.mapQuery ? t.hero.venueValue : t.hero.toBeAnnounced;
    return t.practical.items[id];
  };
  return (
    <section className="section" aria-labelledby="ws-practical">
      <header className="section-head">
        <h2 id="ws-practical">{t.practical.title}</h2>
      </header>
      <div className="ws-venue">
        <figure className="ws-map">
          <svg viewBox="0 0 320 200" aria-hidden className="ws-map-art">
            <path className="ws-map-road major" d="M-10 150 L330 118" />
            <path className="ws-map-road" d="M70 -10 L104 210" />
            <path className="ws-map-road" d="M228 -10 L250 210" />
            <path
              className="ws-map-water"
              d="M-10 30 Q 80 60 160 34 T 330 40"
            />
            <rect
              className="ws-map-block"
              x="120"
              y="64"
              width="86"
              height="52"
              rx="8"
            />
            <rect
              className="ws-map-block soft"
              x="20"
              y="72"
              width="60"
              height="36"
              rx="8"
            />
            <rect
              className="ws-map-block soft"
              x="262"
              y="70"
              width="48"
              height="30"
              rx="8"
            />
            <g className="ws-map-pin" transform="translate(163 70)">
              <circle className="ws-map-halo" r="20" />
              <path d="M0 -22 C 12 -22 18 -13 18 -6 C 18 6 0 18 0 18 C 0 18 -18 6 -18 -6 C -18 -13 -12 -22 0 -22 Z" />
              <circle className="ws-map-dot" cy="-6" r="6" />
            </g>
          </svg>
          <figcaption>
            <strong>{t.practical.campus}</strong>
            <span>{t.practical.building}</span>
          </figcaption>
        </figure>
        <div className="ws-venue-info">
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
          <p className="ws-venue-actions">
            {map ? (
              <a
                className="ws-practical-link"
                href={map}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MapPin size={16} aria-hidden />
                {t.hero.openMap}
                <ArrowRight size={15} aria-hidden className="ws-link-arrow" />
              </a>
            ) : null}
            {ics ? (
              <a
                className="ws-practical-link"
                href={`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`}
                download="edufest-2026-workshop.ics"
              >
                <CalendarPlus size={16} aria-hidden />
                {t.hero.addToCalendar}
                <ArrowRight size={15} aria-hidden className="ws-link-arrow" />
              </a>
            ) : null}
          </p>
        </div>
      </div>
    </section>
  );
}
