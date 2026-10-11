'use client';
import type { LettinImportPreview } from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const pageSize = 20;
function searchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
/** Presentation only: the server preview and final creation scope stay intact. */
export function NotebookImportEntries({
  preview,
  pending,
}: {
  preview: LettinImportPreview;
  pending: boolean;
}) {
  const t = useTranslations('lettin');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const needle = searchText(query.trim());
  const matches = preview.entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => searchText(entry.title).includes(needle));
  const lastPage = Math.max(0, Math.ceil(matches.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const offset = currentPage * pageSize;
  const visible = matches.slice(offset, offset + pageSize);
  return (
    <div className="space-y-3">
      <label className="block space-y-2 text-sm">
        {t('importEntrySearch')}
        <Input
          value={query}
          maxLength={160}
          disabled={pending}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
        />
      </label>
      <p className="text-muted-foreground text-xs">{t('importEntriesHint')}</p>
      <p role="status" className="text-sm">
        {t('importEntriesResults', {
          from: matches.length ? offset + 1 : 0,
          to: offset + visible.length,
          matching: matches.length,
          total: preview.count,
        })}
      </p>
      {visible.length ? (
        <ul className="max-h-60 overflow-y-auto rounded border p-4">
          {visible.map(({ entry, index }) => (
            <li key={index}>
              {entry.title} — {t(`kind${entry.kind}`)}
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('importEntriesEmpty')}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending || currentPage === 0}
          onClick={() => setPage(currentPage - 1)}
        >
          {t('importEntriesPrevious')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending || currentPage === lastPage}
          onClick={() => setPage(currentPage + 1)}
        >
          {t('importEntriesNext')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending || !query}
          onClick={() => {
            setQuery('');
            setPage(0);
          }}
        >
          {t('clearImportEntrySearch')}
        </Button>
      </div>
    </div>
  );
}
