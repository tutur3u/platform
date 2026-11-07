import { createFileRoute } from '@tanstack/react-router';
import { Search } from '@tuturuuu/icons';
import { PublicSatelliteShell } from '@tuturuuu/satellite/public';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useState } from 'react';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import {
  filters,
  filterProducts,
  isSnapshotStale,
  type RoadmapFilter,
  stageCounts,
  rowSummaryKey,
  snapshot,
} from '../roadmap-data';

export const Route = createFileRoute('/')({ component: RoadmapPage });

function RoadmapPage() {
  const [language, setLanguage] = useState<'en' | 'vi'>('en');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<RoadmapFilter>('all');
  const t = language === 'en' ? en : vi;
  const [blockedOnly, setBlockedOnly] = useState(false);
  const counts = stageCounts(snapshot.apps);
  const apps = filterProducts(snapshot.apps, query, status, blockedOnly);
  const updated = new Intl.DateTimeFormat(
    language === 'en' ? 'en-GB' : 'vi-VN',
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    }
  ).format(new Date(snapshot.checkedAt));

  return (
    <div
      className="roadmap"
      lang={language}
      data-source-sha={__ROADMAP_BUILD_SHA__}
    >
      <a className="skip-link" href="#products">
        {t.all}
      </a>
      <PublicSatelliteShell
        appName={t.appName}
        appHref="https://tuturuuu.com/roadmap/"
        homeHref="https://tuturuuu.com"
        navigationLabel={t.eyebrow}
        signIn={{ href: 'https://tuturuuu.com/login', label: t.signIn }}
        navigation={
          <>
            <a href="https://github.com/tutur3u/platform">GitHub</a>
            <fieldset className="language-switch">
              <legend className="sr-only">{t.language}</legend>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={language === 'en'}
                onClick={() => setLanguage('en')}
              >
                EN
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={language === 'vi'}
                onClick={() => setLanguage('vi')}
              >
                VI
              </Button>
            </fieldset>
          </>
        }
        footer={
          <>
            <p>{t.footer}</p>
            <span>{t.target}</span>
          </>
        }
      >
        <main>
          <section className="hero" aria-labelledby="page-title">
            <div className="eyebrow">
              <span aria-hidden="true" />
              {t.eyebrow}
            </div>
            <h1 id="page-title">{t.title}</h1>
            <p className="intro">{t.intro}</p>
            <div className="freshness">
              <span>
                {t.updated}{' '}
                <time dateTime={snapshot.checkedAt}>{updated} UTC</time>
              </span>
              <a
                href={`https://github.com/tutur3u/platform/tree/${snapshot.sourceCommit}`}
              >
                {t.snapshot} <code>{snapshot.sourceCommit.slice(0, 7)}</code>
              </a>
            </div>
            {isSnapshotStale(snapshot.checkedAt, Date.now()) ? (
              <p className="notice">{t.stale}</p>
            ) : null}
          </section>

          <section className="progress-overview" aria-label={t.source}>
            {counts.map(({ stage: item, count }) => (
              <div className="metric" key={item}>
                <span className={`status-dot ${item}`} aria-hidden="true" />
                <span>{t[item]}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </section>

          <section id="products" aria-label={t.all}>
            <div className="toolbar">
              <fieldset className="filters">
                <legend className="sr-only">{t.source}</legend>
                {filters.map((item) => (
                  <Button
                    type="button"
                    key={item}
                    aria-pressed={status === item}
                    onClick={() => setStatus(item)}
                  >
                    {t[item]}
                  </Button>
                ))}
              </fieldset>
              <label className="search">
                <span className="sr-only">{t.search}</span>
                <Search aria-hidden="true" size={16} />
                <Input
                  type="search"
                  placeholder={t.search}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </div>
            <label className="blocked-filter">
              <input
                type="checkbox"
                checked={blockedOnly}
                onChange={(event) => setBlockedOnly(event.target.checked)}
              />
              {t.blocked} ({snapshot.apps.filter((app) => app.blocked).length})
            </label>
            <p className="definitions">{t.definition}</p>
            <div className="product-list" aria-live="polite">
              {apps.map((app) => (
                <article className="product" key={app.id}>
                  <div className="product-heading">
                    <a className="product-name" href={app.productUrl}>
                      {app.name}
                    </a>
                    <span className={`badge ${app.stage}`}>
                      <span className="status-dot" aria-hidden="true" />
                      {t[app.stage]}
                    </span>
                  </div>
                  {app.blocked ? (
                    <span className="badge blocked">{t.blocked}</span>
                  ) : null}
                  <p>{t.summaries[rowSummaryKey(app)]}</p>
                  {!app.stageEvidence.pr ? <p>{t.missingEvidence}</p> : null}
                  <details>
                    <summary>{t.evidence}</summary>
                    <ul aria-label={t.details}>
                      {app.evidence.map((item) => (
                        <li key={item.url}>
                          <a href={item.url}>
                            {Object.entries(t.evidenceLabels).find(
                              ([label]) => label === item.label
                            )?.[1] ?? item.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                </article>
              ))}
              {apps.length === 0 ? (
                <div className="empty-state">
                  <p>{t.empty}</p>
                  <Button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setStatus('all');
                      setBlockedOnly(false);
                    }}
                  >
                    {t.reset}
                  </Button>
                </div>
              ) : null}
            </div>
          </section>
          <aside className="snapshot-note">{t.note}</aside>
        </main>
      </PublicSatelliteShell>
    </div>
  );
}
