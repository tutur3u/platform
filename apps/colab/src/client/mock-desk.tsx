import type { MockApp, Team } from '@tuturuuu/multiplayer';
import { useState } from 'react';
import { appNames, useCopy } from './i18n';

export function MockDesk({ team }: { team: Team }) {
  const c = useCopy();
  const [app, setApp] = useState<MockApp>('drive');
  const [query, setQuery] = useState('');
  const records = team.records.filter(
    (r) =>
      r.app === app &&
      `${r.title} ${r.content}`.toLowerCase().includes(query.toLowerCase())
  );
  const chat = ['zalo', 'messenger', 'teams'].includes(app);
  const board = ['jira', 'trello'].includes(app);
  return (
    <section id="sandbox-desk" className="panel mock-panel">
      <div className="panel-heading">
        <div>
          <span className="section-number">03 / {c.sandboxSection}</span>
          <h2>{c.mockDesk}</h2>
        </div>
        <span className="sandbox-label">{c.sandbox.split(' · ')[0]}</span>
      </div>
      <nav className="app-tabs" aria-label={c.mockDesk}>
        {Object.entries(appNames).map(([id, name]) => (
          <button
            type="button"
            aria-pressed={id === app}
            key={id}
            onClick={() => {
              setApp(id as MockApp);
              setQuery('');
            }}
          >
            {name}
          </button>
        ))}
      </nav>
      <div className="mock-window">
        <div className="mock-titlebar">
          <span className="mock-monogram">{appNames[app].slice(0, 1)}</span>
          <strong>{appNames[app]}</strong>
          <span className="mock-caption">{c.simulated}</span>
        </div>
        <label className="mock-search">
          <span className="sr-only">{c.searchRecords}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={c.searchRecords}
          />
        </label>
        <div
          className={`mock-content ${chat ? 'mock-chat' : board ? 'mock-board' : app === 'calendar' ? 'mock-calendar' : 'mock-documents'}`}
        >
          {records.map((record, i) => (
            <article className="mock-item" key={record.id}>
              {chat && (
                <span className="avatar">{record.title.slice(0, 1)}</span>
              )}
              {app === 'calendar' && (
                <span className="time-label">{`${9 + i}:00`}</span>
              )}
              <div className="mock-item-body">
                <div className="mock-item-heading">
                  {app === 'drive' && <span className="document-mark">▤</span>}
                  {board && <span className="board-tag">{record.id}</span>}
                  <h3>{record.title}</h3>
                </div>
                <p>{record.content}</p>
                <code>{record.id}</code>
              </div>
            </article>
          ))}
          {!records.length && <p className="empty">{c.mockEmpty}</p>}
        </div>
      </div>
    </section>
  );
}
