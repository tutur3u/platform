import { shippedShare } from '../live/status';
import type { RoadmapView } from '../view-model';
import { type GlanceBand, glanceBand, glanceOrder } from './glance-model';
import { fill } from './insights/format';
import { type Messages, SectionTitle } from './shared';

const BANDS: GlanceBand[] = ['attention', 'good', 'done'];

/** Every track as a tile with a progress ring (shipped share), linking down. */
export function TrackGlance({ t, view }: { t: Messages; view: RoadmapView }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const items = glanceOrder(
    view.tracks.map((track) => ({
      track,
      share: shippedShare(track.counts),
      shipped: track.counts.live + track.counts.waiting_for_prod_sync,
    }))
  );
  return (
    <section className="section glance" aria-labelledby="glance-title">
      <header className="section-head glance-head">
        <SectionTitle
          id="glance-title"
          title={t.glance.title}
          t={t}
          info={<p>{t.glance.subtitle}</p>}
        />
        <ul className="glance-legend" aria-label={t.glance.bandsLabel}>
          {BANDS.map((band) => (
            <li key={band} className={`glance-band-${band}`}>
              <span className="glance-legend-dot" aria-hidden />
              {t.glance.bands[band]}
            </li>
          ))}
        </ul>
      </header>
      <ul className="glance-grid">
        {items.map(({ track, share, shipped }) => {
          const pct = Math.round(share * 100);
          const left = track.total - shipped;
          return (
            <li key={track.id}>
              <a
                href={`#track-${track.id}`}
                className={`glance-tile glance-band-${glanceBand(share)}`}
              >
                <svg
                  viewBox="0 0 48 48"
                  className="glance-ring"
                  role="img"
                  aria-label={`${pct}% ${t.glance.shipped}`}
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
                    {pct}
                  </text>
                </svg>
                <span className="glance-name" title={track.name}>
                  {track.name}
                </span>
                <span className="glance-count">
                  {shipped}/{track.total} {t.glance.shipped}
                  {left > 0 ? (
                    <span className="glance-left">
                      {' · '}
                      {fill(t.glance.toGo, { n: String(left) })}
                    </span>
                  ) : null}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
