'use client';
import { ArrowUpRight, BookOpen } from '@tuturuuu/icons';
import type { LettinRecord } from '@tuturuuu/internal-api/lettin';
import { useLocale, useTranslations } from 'next-intl';
import { WikiBrowseControls } from './wiki-browse-controls';
import {
  applyWikiFilters,
  type WikiFilters,
  wikiTags,
} from './wiki-browse-model';
import { WikiBrowser } from './wiki-browser';
import {
  filterWiki,
  matchingRelationshipEdges,
  type WikiSection,
} from './wiki-model';
export function WikiBrowsingPanel({
  entries,
  worldId,
  section,
  disabled,
  filters,
  onChange,
  onClear,
  onSelect,
}: {
  entries: LettinRecord[];
  worldId: string;
  section: WikiSection;
  disabled: boolean;
  filters: WikiFilters;
  onChange: (filters: WikiFilters) => void;
  onClear?: () => void;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations('lettin'),
    locale = useLocale();
  // Relationship text search runs on edges, after both endpoints pass facets.
  const typed = filterWiki(
    entries,
    section,
    section === 'relationships' ? '' : filters.search
  );
  const filtered = applyWikiFilters(
    typed,
    {
      ...filters,
      sort: ['timeline', 'relationships'].includes(section)
        ? 'original'
        : filters.sort,
    },
    locale
  );
  return (
    <>
      <div className="wiki-browser-header">
        <div>
          <h2>{t(`section${section}`)}</h2>
          <p role="status">
            {section === 'relationships'
              ? t('wikiRelationshipCount', {
                  count: matchingRelationshipEdges(
                    filtered,
                    filters.search,
                    (kind) => t(`relationship${kind}`)
                  ).length,
                })
              : t('wikiEntryCount', { count: filtered.length })}
          </p>
        </div>
      </div>
      <WikiBrowseControls
        filters={filters}
        tags={wikiTags(filterWiki(entries, section, ''))}
        canSort={!['timeline', 'relationships'].includes(section)}
        disabled={disabled}
        onChange={onChange}
        onClear={onClear}
      />
      <p className="mb-5 text-muted-foreground text-sm">
        {t('wikiSavedBrowseHint')}
      </p>
      {section === 'overview' && (
        <button
          type="button"
          className="wiki-world-summary"
          disabled={disabled}
          onClick={() => onSelect(worldId)}
        >
          <BookOpen size={24} />
          <div>
            <h3>{t('worldDetails')}</h3>
            <p>{t('worldDetailsHint')}</p>
          </div>
          <ArrowUpRight size={18} />
        </button>
      )}
      <WikiBrowser
        entries={filtered}
        search={filters.search}
        section={section}
        onSelect={onSelect}
        disabled={disabled}
        showDraftChanges
      />
    </>
  );
}
