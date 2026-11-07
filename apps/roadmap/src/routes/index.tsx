import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { filters, filterProducts, isSnapshotStale, type RoadmapFilter, type SourceStatus, snapshot } from '../roadmap-data';

export const Route = createFileRoute('/')({ component: RoadmapPage });

function RoadmapPage() {
  const [language, setLanguage] = useState<'en' | 'vi'>('en');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<RoadmapFilter>('all');
  const t = language === 'en' ? en : vi;
  const summaryStatuses: SourceStatus[] = ['active', 'blocked', 'planned'];
  const apps = filterProducts(snapshot.apps, query, status);
  const updated = new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'vi-VN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }).format(new Date(snapshot.checkedAt));

  return (
    <div className="roadmap" lang={language} data-source-sha={__ROADMAP_BUILD_SHA__}>
      <a className="skip-link" href="#products">{t.all}</a>
      <header className="site-header">
        <a className="brand" href="https://tuturuuu.com" aria-label={t.home}>
          <span className="brand-mark" aria-hidden="true">t</span> tuturuuu
        </a>
        <nav aria-label={t.eyebrow}>
          <a href="https://github.com/tutur3u/platform">GitHub</a>
          <div className="language-switch" aria-label={t.language}>
            <button type="button" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
            <button type="button" aria-pressed={language === 'vi'} onClick={() => setLanguage('vi')}>VI</button>
          </div>
        </nav>
      </header>

      <main>
        <section className="hero" aria-labelledby="page-title">
          <div className="eyebrow"><span aria-hidden="true" />{t.eyebrow}</div>
          <h1 id="page-title">{t.title}</h1>
          <p className="intro">{t.intro}</p>
          <div className="freshness">
            <span>{t.updated} <time dateTime={snapshot.checkedAt}>{updated} UTC</time></span>
            <a href={`https://github.com/tutur3u/platform/tree/${snapshot.sourceCommit}`}>
              {t.snapshot} <code>{snapshot.sourceCommit.slice(0, 7)}</code>
            </a>
          </div>
          {isSnapshotStale(snapshot.checkedAt, Date.now()) ? <p className="notice">{t.stale}</p> : null}
        </section>

        <section className="progress-overview" aria-label={t.source}>
          {summaryStatuses.map((item) => (
            <div className="metric" key={item}>
              <span className={`status-dot ${item}`} aria-hidden="true" />
              <span>{t[item]}</span>
              <strong>{snapshot.apps.filter((app) => app.status === item).length}</strong>
            </div>
          ))}
          <div className="verification"><span>{t.live}</span><strong>{t.unverified}</strong></div>
        </section>

        <section id="products" aria-label={t.all}>
          <div className="toolbar">
            <div className="filters" aria-label={t.source}>
              {filters.map((item) => (
                <button type="button" key={item} aria-pressed={status === item} onClick={() => setStatus(item)}>
                  {t[item]}
                </button>
              ))}
            </div>
            <label className="search">
              <span className="sr-only">{t.search}</span>
              <input type="search" placeholder={t.search} value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
          </div>
          <p className="definitions">{t.definition}</p>
          <div className="product-list" aria-live="polite">
            {apps.map((app) => (
              <article className="product" key={app.id}>
                <div className="product-heading">
                  <a className="product-name" href={app.productUrl}>{app.name}</a>
                  <span className={`badge ${app.status}`}><span className="status-dot" aria-hidden="true" />{t[app.status]}</span>
                </div>
                <p>{app.summary[language]}</p>
                <details>
                  <summary>{t.evidence}</summary>
                  <ul aria-label={t.details}>{app.evidence.map((item) => (
                    <li key={item.url}><a href={item.url}>{Object.entries(t.evidenceLabels).find(([label]) => label === item.label)?.[1] ?? item.label}</a></li>
                  ))}</ul>
                </details>
              </article>
            ))}
            {apps.length === 0 ? <div className="empty-state"><p>{t.empty}</p><button type="button" onClick={() => { setQuery(''); setStatus('all'); }}>{t.reset}</button></div> : null}
          </div>
        </section>
        <aside className="snapshot-note">{t.note}</aside>
      </main>
      <footer><p>{t.footer}</p><span>{t.target}</span></footer>
    </div>
  );
}
