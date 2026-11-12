import { useId } from 'react';
import type { LiveData } from '../live/model';
import { shippingPulse } from '../live/pulse';
import { shippedShare } from '../live/status';
import type { RoadmapView } from '../view-model';
import type { Lang, Messages } from './shared';

function dayLabel(day: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'vi-VN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

/** Shipping pulse: one series (merged PRs), today highlighted, table view. */
export function ShippingPulse({
  t,
  lang,
  data,
  now,
}: {
  t: Messages;
  lang: Lang;
  data: LiveData;
  now: number;
}) {
  const pulse = shippingPulse(data.prs, now);
  const max = Math.max(1, ...pulse.map((entry) => entry.merged));
  const total = pulse.reduce((sum, entry) => sum + entry.merged, 0);
  const today = pulse.at(-1);
  const tableId = useId();
  return (
    <figure className="pulse">
      <figcaption>
        <span className="pulse-title">{t.pulse.title}</span>
        <span className="pulse-total">
          <b>{total}</b> {t.pulse.merged}
        </span>
      </figcaption>
      <div
        className="pulse-bars"
        role="img"
        aria-label={`${t.pulse.title}: ${pulse
          .map((entry) => `${dayLabel(entry.day, lang)} ${entry.merged}`)
          .join(', ')}`}
      >
        {pulse.map((entry, index) => (
          <span
            key={entry.day}
            className={`pulse-bar${index === pulse.length - 1 ? ' is-today' : ''}`}
            style={{ height: `${Math.max(4, (entry.merged / max) * 100)}%` }}
            title={`${dayLabel(entry.day, lang)}: ${entry.merged} ${t.pulse.merged}`}
          />
        ))}
      </div>
      <div className="pulse-axis" aria-hidden>
        <span>{dayLabel(pulse[0]?.day ?? '', lang)}</span>
        <span>
          {t.pulse.today} · <b>{today?.merged ?? 0}</b>
        </span>
      </div>
      <p className="pulse-source">{t.pulse.source}</p>
      <details className="pulse-table">
        <summary aria-controls={tableId}>{t.pulse.table}</summary>
        <table id={tableId}>
          <tbody>
            {pulse.map((entry) => (
              <tr key={entry.day}>
                <th scope="row">{dayLabel(entry.day, lang)}</th>
                <td>{entry.merged}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Every track as a tile with a progress ring (shipped share), linking down. */
export function TrackGlance({ t, view }: { t: Messages; view: RoadmapView }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  return (
    <section className="section glance" aria-labelledby="glance-title">
      <header className="section-head">
        <h2 id="glance-title">{t.glance.title}</h2>
        <p>{t.glance.subtitle}</p>
      </header>
      <ul className="glance-grid">
        {view.tracks.map((track) => {
          const share = shippedShare(track.counts);
          const shipped =
            track.counts.live + track.counts.waiting_for_prod_sync;
          return (
            <li key={track.id}>
              <a href={`#track-${track.id}`} className="glance-tile">
                <svg
                  viewBox="0 0 48 48"
                  className="glance-ring"
                  role="img"
                  aria-label={`${Math.round(share * 100)}% ${t.glance.shipped}`}
                >
                  <circle
                    cx="24"
                    cy="24"
                    r={radius}
                    className="glance-ring-track"
                  />
                  <circle
                    cx="24"
                    cy="24"
                    r={radius}
                    className="glance-ring-value"
                    strokeDasharray={`${share * circumference} ${circumference}`}
                    transform="rotate(-90 24 24)"
                  />
                  <text
                    x="24"
                    y="28"
                    textAnchor="middle"
                    className="glance-ring-label"
                  >
                    {Math.round(share * 100)}
                  </text>
                </svg>
                <span className="glance-name">{track.name}</span>
                <span className="glance-count">
                  {shipped}/{track.total} {t.glance.shipped}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
