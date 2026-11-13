import cloudflareBadge from '../assets/brands/cloudflare-protected-badge.png?no-inline';
import { hostBadge } from '../live/host-badge';
import { type HostingSnapshot, hostingAsOf } from '../live/hosting';
import { REPO_URL } from '../live/model';
import { statuses } from '../live/status';
import type { RoadmapView } from '../view-model';

const PLATFORM_ORDER = ['workers', 'vercel', 'store', 'unknown'] as const;
type Platform = (typeof PLATFORM_ORDER)[number];

/** A small glyph per platform; the label next to it carries the meaning. */
function PlatformMark({ platform }: { platform: Platform }) {
  return <span className={`platform-mark ${platform}`} aria-hidden />;
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
import {
  formatDate,
  type Lang,
  type Messages,
  SectionHead,
  StatusBadge,
} from './shared';

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
        subtitle={t.hosting.subtitle}
      />
      <div className="hosting-meta">
        <div>
          {asOf ? (
            <p className="main-commit">
              {t.hosting.checked}{' '}
              <time dateTime={asOf}>
                {formatDate(asOf, lang, true)} (UTC+7)
              </time>{' '}
              {t.hosting.checkedNote}
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
        {/* Cloudflare's official web badge, unaltered (assets/brands). */}
        <img
          className="cf-badge"
          src={cloudflareBadge}
          alt={t.hosting.badgeAlt}
          width={152}
          height={53}
          loading="lazy"
          decoding="async"
        />
      </div>
      <HostSummary t={t} hosts={view.hosts} />
      {PLATFORM_ORDER.map((platform) => {
        const group = view.hosts.filter((host) => host.platform === platform);
        if (!group.length) return null;
        return (
          <div key={platform} className="host-group">
            <h3 className={`host-group-title ${platform}`}>
              <PlatformMark platform={platform} />
              {t.hosting[platform]}
              <span className="host-group-count">{group.length}</span>
            </h3>
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
    </section>
  );
}

export function Method({ t }: { t: Messages }) {
  return (
    <section className="section method" aria-labelledby="method-title">
      <h2 id="method-title">{t.method.title}</h2>
      <dl>
        {statuses.map((s) => (
          <div key={s}>
            <dt>
              <StatusBadge status={s} t={t} />
            </dt>
            <dd>{t.method[s]}</dd>
          </div>
        ))}
      </dl>
      <p className="hint">{t.method.sources}</p>
    </section>
  );
}
