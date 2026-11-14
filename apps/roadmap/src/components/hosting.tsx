import cloudflareLogo from '../assets/brands/cloudflare-logo.png?no-inline';
import { hostBadge } from '../live/host-badge';
import { type HostingSnapshot, hostingAsOf } from '../live/hosting';
import { REPO_URL } from '../live/model';
import type { RoadmapView } from '../view-model';

const PLATFORM_ORDER = ['workers', 'vercel', 'store', 'unknown'] as const;
type Platform = (typeof PLATFORM_ORDER)[number];

/** A small glyph per platform; the label next to it carries the meaning. */
function PlatformMark({ platform }: { platform: Platform }) {
  return <span className={`platform-mark ${platform}`} aria-hidden />;
}

/**
 * Cloudflare's official logo, byte-for-byte from its press kit
 * (assets/brands/CLOUDFLARE-LOGO.md). It stands on its own plate beside the
 * heading, never inside a line of text, and is never recoloured: the plate
 * keeps a light ground in both themes.
 */
function CloudflareLogo({ t }: { t: Messages }) {
  return (
    <span className="cf-logo-plate">
      <img
        className="cf-logo"
        src={cloudflareLogo}
        alt={t.hosting.logoAlt}
        width={512}
        height={173}
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}

/** How many apps run on each platform, as one segmented bar with a legend. */
function HostSummary({
  t,
  hosts,
}: {
  t: Messages;
  hosts: RoadmapView['hosts'];
}) {
  const counts = PLATFORM_ORDER.map((platform) => ({
    platform,
    count: hosts.filter((host) => host.platform === platform).length,
  })).filter((entry) => entry.count > 0);
  const total = hosts.length || 1;
  return (
    <div className="host-summary">
      <div
        className="host-summary-bar"
        role="img"
        aria-label={counts
          .map((entry) => `${t.hosting[entry.platform]} ${entry.count}`)
          .join(', ')}
      >
        {counts.map((entry) => (
          <span
            key={entry.platform}
            className={`host-seg ${entry.platform}`}
            style={{ width: `${(entry.count / total) * 100}%` }}
            title={`${t.hosting[entry.platform]}: ${entry.count}`}
          />
        ))}
      </div>
      <ul className="host-legend">
        {counts.map((entry) => (
          <li key={entry.platform}>
            <PlatformMark platform={entry.platform} />
            {t.hosting[entry.platform]} <b>{entry.count}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
import { formatDate, type Lang, type Messages, SectionHead } from './shared';

export function HostingSection({
  t,
  lang,
  view,
  main,
  hosting,
}: {
  t: Messages;
  lang: Lang;
  view: RoadmapView;
  main: { sha: string; at: string } | null;
  /** This build's observation: providers and their as-of time. */
  hosting: HostingSnapshot;
}) {
  const asOf = hostingAsOf(hosting);
  return (
    <section className="section" aria-labelledby="hosting-title">
      <SectionHead
        id="hosting-title"
        title={t.hosting.title}
        t={t}
        info={
          <>
            <p>{t.hosting.subtitle}</p>
            <p>{t.hosting.checkedNote}</p>
          </>
        }
      />
      <div>
        {asOf ? (
          <p className="main-commit">
            {t.hosting.checked}{' '}
            <time dateTime={asOf}>{formatDate(asOf, lang, true)} (UTC+7)</time>
          </p>
        ) : null}
        {hosting.mode !== 'probed' ? (
          <p className="main-commit hosting-unverified">
            {t.hosting.notObserved}
          </p>
        ) : null}
        {main ? (
          <p className="main-commit">
            {t.hosting.main}:{' '}
            <a href={`${REPO_URL}/commit/${main.sha}`}>
              <code>{main.sha.slice(0, 7)}</code>
            </a>{' '}
            · {formatDate(main.at, lang, true)}
          </p>
        ) : null}
      </div>
      <HostSummary t={t} hosts={view.hosts} />
      {PLATFORM_ORDER.map((platform) => {
        const group = view.hosts.filter((host) => host.platform === platform);
        if (!group.length) return null;
        return (
          <div key={platform} className="host-group">
            <div className="host-group-head">
              <h3 className={`host-group-title ${platform}`}>
                <PlatformMark platform={platform} />
                {t.hosting[platform]}
                <span className="host-group-count">{group.length}</span>
              </h3>
              {platform === 'workers' ? <CloudflareLogo t={t} /> : null}
            </div>
            <ul className="hosts">
              {group.map((host) => {
                const badge = hostBadge(host);
                return (
                  <li key={host.app} className={`host-card ${platform}`}>
                    <div className="host-top">
                      <b>{host.name}</b>
                      {badge ? (
                        <span className={`host-fresh ${badge.kind}`}>
                          {badge.kind === 'build' ? (
                            <>
                              {t.hosting.buildFrom}{' '}
                              <time dateTime={badge.at}>
                                {formatDate(badge.at, lang)}
                              </time>
                            </>
                          ) : (
                            t.hosting.noCommit
                          )}
                        </span>
                      ) : null}
                    </div>
                    {host.commit ? (
                      <a
                        className="host-commit"
                        href={`${REPO_URL}/commit/${host.commit}`}
                      >
                        <code>{host.commit.slice(0, 7)}</code>
                      </a>
                    ) : (
                      <span className="host-commit is-empty" aria-hidden>
                        <code>-------</code>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {view.hosts.some((host) => host.platform === 'workers') ? (
        <p className="hint fine-print">{t.hosting.trademark}</p>
      ) : null}
    </section>
  );
}
