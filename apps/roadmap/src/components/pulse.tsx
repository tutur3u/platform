import { shippedShare } from '../live/status';
import type { RoadmapView } from '../view-model';
import type { Messages } from './shared';

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
