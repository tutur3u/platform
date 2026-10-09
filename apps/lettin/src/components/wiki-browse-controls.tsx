'use client';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import {
  initialWikiFilters,
  type WikiFilters,
  type WikiPublication,
  type WikiSort,
} from './wiki-browse-model';
export function WikiBrowseControls({
  filters,
  tags,
  canSort,
  disabled,
  onChange,
}: {
  filters: WikiFilters;
  tags: string[];
  canSort: boolean;
  disabled: boolean;
  onChange: (filters: WikiFilters) => void;
}) {
  const t = useTranslations('lettin');
  const selectClass = 'block w-full rounded border border-input bg-card p-2';
  return (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <label className="min-w-40 flex-1 text-sm">
        {t('searchWiki')}
        <Input
          value={filters.search}
          maxLength={200}
          disabled={disabled}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
      </label>
      <label className="text-sm">
        {t('wikiPublicationFilter')}
        <select
          className={selectClass}
          value={filters.publication}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              ...filters,
              publication: e.target.value as WikiPublication,
            })
          }
        >
          <option value="all">{t('wikiAllEntries')}</option>
          <option value="private">{t('wikiPrivateEntries')}</option>
          <option value="published">{t('published')}</option>
          <option value="changed">{t('wikiSavedChanges')}</option>
        </select>
      </label>
      <label className="text-sm">
        {t('wikiTagFilter')}
        <select
          className={selectClass}
          value={filters.tag}
          disabled={disabled}
          onChange={(e) => onChange({ ...filters, tag: e.target.value })}
        >
          <option value="">{t('wikiAllTags')}</option>
          {[...new Set([...tags, ...(filters.tag ? [filters.tag] : [])])].map(
            (tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            )
          )}
        </select>
      </label>
      {canSort && (
        <label className="text-sm">
          {t('wikiSort')}
          <select
            className={selectClass}
            value={filters.sort}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...filters, sort: e.target.value as WikiSort })
            }
          >
            <option value="original">{t('wikiOriginalOrder')}</option>
            <option value="titleAsc">{t('wikiTitleAsc')}</option>
            <option value="titleDesc">{t('wikiTitleDesc')}</option>
            <option value="kind">{t('wikiKindOrder')}</option>
          </select>
        </label>
      )}
      <Button
        variant="ghost"
        disabled={disabled}
        onClick={() => onChange({ ...initialWikiFilters })}
      >
        {t('clearFilters')}
      </Button>
    </div>
  );
}
