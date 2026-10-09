'use client';
import { ArrowUpRight, BookOpen, Network } from '@tuturuuu/icons';
import type { LettinRecord } from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { hasSavedWikiChanges } from './wiki-browse-model';
import {
  matchingRelationshipEdges,
  timelineEntries,
  type WikiSection,
  wikiOf,
} from './wiki-model';
export function WikiBrowser({
  entries,
  section,
  onSelect,
  disabled,
  search = '',
  showDraftChanges = false,
}: {
  entries: LettinRecord[];
  section: WikiSection;
  search?: string;
  showDraftChanges?: boolean;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  const t = useTranslations('lettin');
  if (section === 'relationships') {
    const edges = matchingRelationshipEdges(entries, search, (kind) =>
      t(`relationship${kind}`)
    );
    return (
      <section className="wiki-connections">
        <h2>{t('relationships')}</h2>
        <p className="wiki-section-hint">{t('relationshipsHint')}</p>
        {!edges.length && (
          <div className="wiki-empty">
            <Network />
            <p>{t('noRelationships')}</p>
          </div>
        )}
        {edges.map((edge) => (
          <div
            className="wiki-connection"
            key={`${edge.source.id}-${edge.targetId}-${edge.kind}`}
          >
            <Button
              variant="ghost"
              disabled={disabled}
              onClick={() => onSelect(edge.source.id)}
            >
              {edge.source.draft.title}
            </Button>
            <span className="wiki-connection-line">
              {edge.label || t(`relationship${edge.kind}`)}
              <ArrowUpRight size={14} />
            </span>
            <Button
              variant="ghost"
              disabled={disabled}
              onClick={() => onSelect(edge.targetId)}
            >
              {edge.target.draft.title}
            </Button>
          </div>
        ))}
      </section>
    );
  }
  if (section === 'timeline') {
    const dated = timelineEntries(entries);
    const undated = entries.filter((entry) => !wikiOf(entry.draft).chronology);
    return (
      <section>
        <h2>{t('timeline')}</h2>
        <p className="wiki-section-hint">{t('timelineHint')}</p>
        <ol className="wiki-timeline">
          {dated.map((entry) => (
            <li key={entry.id}>
              <div className="wiki-timeline-date">
                <span>{wikiOf(entry.draft).chronology?.era}</span>
                <strong>{wikiOf(entry.draft).chronology?.label}</strong>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(entry.id)}
              >
                <h3>{entry.draft.title}</h3>
                <p>{entry.draft.description}</p>
              </button>
            </li>
          ))}
        </ol>
        {!dated.length && (
          <div className="wiki-empty">
            <BookOpen />
            <p>{t('noTimeline')}</p>
          </div>
        )}
        {undated.length > 0 && (
          <>
            <h3 className="mt-8 mb-3">{t('undatedEntries')}</h3>
            <EntryCards
              showDraftChanges={showDraftChanges}
              entries={undated}
              onSelect={onSelect}
              disabled={disabled}
            />
          </>
        )}
      </section>
    );
  }
  return (
    <EntryCards
      showDraftChanges={showDraftChanges}
      entries={entries}
      onSelect={onSelect}
      disabled={disabled}
    />
  );
}
function EntryCards({
  showDraftChanges,
  entries,
  onSelect,
  disabled,
}: {
  showDraftChanges: boolean;
  entries: LettinRecord[];
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  const t = useTranslations('lettin');
  return (
    <div className="wiki-entry-grid">
      {entries.map((entry) => (
        <button
          type="button"
          className="wiki-entry-card"
          key={entry.id}
          disabled={disabled}
          onClick={() => onSelect(entry.id)}
        >
          {entry.draft.image && (
            // biome-ignore lint/performance/noImgElement: Artwork access is revocable.
            <img
              src={entry.draft.image}
              alt=""
              referrerPolicy="no-referrer"
              loading="lazy"
            />
          )}
          <div>
            <span className="wiki-entry-kind">
              {t(`kind${entry.draft.kind}`)} ·{' '}
              {t(entry.published ? 'published' : 'draft')}
              {showDraftChanges && hasSavedWikiChanges(entry) && (
                <> · {t('wikiSavedChanges')}</>
              )}
            </span>
            <h3>
              {entry.draft.title}
              <ArrowUpRight size={16} />
            </h3>
            <p>{entry.draft.description || t('entryWaiting')}</p>
            {wikiOf(entry.draft).aliases.length > 0 && (
              <small>{wikiOf(entry.draft).aliases.join(' · ')}</small>
            )}
          </div>
        </button>
      ))}
      {!entries.length && (
        <div className="wiki-empty">
          <BookOpen />
          <p>{t('noWikiEntries')}</p>
        </div>
      )}
    </div>
  );
}
