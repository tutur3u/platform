import { Loader2, Search, X } from '@tuturuuu/icons';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

const SEARCH_DEBOUNCE_MS = 300;

/** Debounced board search; the committed query lives in the board filters. */
export function BoardSearchInput({
  isSearching,
  onSearchChange,
  searchQuery,
}: {
  isSearching: boolean;
  onSearchChange: (query: string | undefined) => void;
  searchQuery?: string;
}) {
  const t = useTranslations();
  const [localQuery, setLocalQuery] = useState(searchQuery || '');
  const committedRef = useRef(searchQuery || '');
  const onSearchChangeRef = useRef(onSearchChange);

  useEffect(() => {
    onSearchChangeRef.current = onSearchChange;
  });

  // Follow external changes (Clear, presence) without overwriting typing.
  useEffect(() => {
    const next = searchQuery || '';
    committedRef.current = next;
    setLocalQuery((current) => (current === next ? current : next));
  }, [searchQuery]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (localQuery === committedRef.current) return;
      committedRef.current = localQuery;
      onSearchChangeRef.current(localQuery || undefined);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [localQuery]);

  return (
    <div className="relative min-w-20 flex-1 basis-60 sm:max-w-60">
      {isSearching ? (
        <Loader2 className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
      )}
      <Input
        aria-label={t('common.search_tasks')}
        className="h-8 bg-background pr-8 pl-8 text-sm"
        onChange={(event) => setLocalQuery(event.target.value)}
        placeholder={t('common.search_tasks')}
        type="text"
        value={localQuery}
      />
      {localQuery && !isSearching ? (
        <button
          aria-label={t('common.clear_search')}
          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setLocalQuery('')}
          type="button"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
