import { type MockApp, mockAppCatalog, type Team } from '@tuturuuu/multiplayer';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useState } from 'react';
import { appNames, useCopy } from './i18n';
import { SelectField } from './select-field';

export function MockDesk({
  team,
  active = true,
}: {
  team: Team;
  active?: boolean;
}) {
  const c = useCopy();
  const [app, setApp] = useState<MockApp>('drive');
  const [query, setQuery] = useState('');
  const appRecords = team.records.filter((record) => record.app === app);
  const records = appRecords.filter((r) =>
    `${r.title} ${r.content}`.toLowerCase().includes(query.toLowerCase())
  );
  const selectedApp = mockAppCatalog.find(({ id }) => id === app)!;
  const chat = selectedApp.kind === 'chat';
  const board = selectedApp.kind === 'board';
  const calendar = selectedApp.kind === 'calendar';
  return (
    <Card
      id={active ? 'sandbox-desk' : undefined}
      className="studio-panel mock-panel shadow-none"
    >
      <div className="panel-heading">
        <div>
          <span className="section-number">03 / {c.sandboxSection}</span>
          <h2>{c.mockDesk}</h2>
        </div>
        <Badge variant="secondary">
          {mockAppCatalog.length} {c.practiceAppsAvailable}
        </Badge>
      </div>
      <div className="mock-toolbar">
        <SelectField
          label={c.mockDesk}
          value={app}
          onValueChange={(value) => {
            setApp(value as MockApp);
            setQuery('');
          }}
        >
          {mockAppCatalog.map(({ id, name }) => (
            <option key={id} value={id}>
              {name} ·{' '}
              {team.records.filter((record) => record.app === id).length}
            </option>
          ))}
        </SelectField>
        <Label className="min-w-0">
          <span className="sr-only">{c.searchRecords}</span>
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={c.searchRecords}
          />
        </Label>
      </div>
      <div className="mock-window">
        <div className="mock-titlebar">
          <span className="mock-monogram">{appNames[app].slice(0, 1)}</span>
          <strong>{appNames[app]}</strong>
          <span className="mock-caption" aria-live="polite">
            {records.length} {query ? c.matches : c.records}
          </span>
        </div>
        <div
          className={`mock-content ${chat ? 'mock-chat' : board ? 'mock-board' : calendar ? 'mock-calendar' : 'mock-documents'}`}
        >
          {records.map((record, i) => (
            <article className="mock-item" key={record.id}>
              {chat && (
                <span className="avatar">{record.title.slice(0, 1)}</span>
              )}
              {calendar && <span className="time-label">{`${9 + i}:00`}</span>}
              <div className="mock-item-body">
                <div className="mock-item-heading">
                  {selectedApp.kind === 'documents' && (
                    <span className="document-mark">▤</span>
                  )}
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
    </Card>
  );
}
