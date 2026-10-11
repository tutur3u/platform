'use client';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  type DocumentOutlineItem,
  outlineLimit,
} from './document-outline-model';
import {
  decodedOutlineFragment,
  focusOutlineHeading,
  outlineHeadingHref,
} from './document-outline-navigation';
import {
  filterOutlineItems,
  outlineSearchLimit,
} from './document-outline-search';

type OutlineProps = {
  items: DocumentOutlineItem[];
  truncated: boolean;
  publicEntryId?: string | null;
};
export function DocumentOutline(props: OutlineProps) {
  return (
    <SearchableOutline
      key={JSON.stringify([props.items, props.truncated, props.publicEntryId])}
      {...props}
    />
  );
}
function SearchableOutline({ items, truncated, publicEntryId }: OutlineProps) {
  const t = useTranslations('lettin');
  const [search, setSearch] = useState('');
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    if (publicEntryId === undefined) return;
    const navigate = () => {
      const id = decodedOutlineFragment(window.location.hash);
      if (items.some((item) => item.id === id))
        focusOutlineHeading(navigation.current?.closest('article') ?? null, id);
    };
    navigate();
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, [items, publicEntryId]);
  const visible = filterOutlineItems(items, search);
  if (items.length < 2) return null;
  return (
    <nav
      ref={navigation}
      aria-label={t('documentOutline')}
      className="my-6 rounded border border-border bg-muted/40 p-4"
    >
      <h2 className="mb-3 font-semibold text-base">{t('documentOutline')}</h2>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 space-y-1 text-sm">
          <span className="block">{t('outlineSearch')}</span>
          <input
            type="search"
            value={search}
            maxLength={outlineSearchLimit}
            onChange={(event) =>
              setSearch(event.target.value.slice(0, outlineSearchLimit))
            }
            className="w-full rounded border border-input bg-background p-2"
          />
        </label>
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="rounded border border-input bg-background px-3 py-2 text-sm"
          >
            {t('outlineSearchClear')}
          </button>
        )}
      </div>
      {visible.length === 0 && (
        <p role="status" className="mb-3 text-sm">
          {t('outlineSearchEmpty')}
        </p>
      )}
      {publicEntryId !== undefined && (
        <p className="mb-3 text-muted-foreground text-sm">
          {t('outlinePublishedLinksHint')}
        </p>
      )}
      <ol className="max-h-72 space-y-2 overflow-y-auto text-sm">
        {visible.map((item) => (
          <li key={item.id} className={item.level > 2 ? 'ms-4' : ''}>
            <a
              className="underline underline-offset-4"
              href={outlineHeadingHref(item.id, publicEntryId)}
              onClick={(event) => {
                if (
                  event.defaultPrevented ||
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                const article = event.currentTarget.closest('article');
                if (!focusOutlineHeading(article, item.id)) return;
                event.preventDefault();
                if (publicEntryId !== undefined)
                  window.history.replaceState(
                    window.history.state,
                    '',
                    outlineHeadingHref(item.id, publicEntryId)
                  );
              }}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>
      {truncated && (
        <p className="mt-3 text-muted-foreground text-sm">
          {t('documentOutlineLimit', { count: outlineLimit })}
        </p>
      )}
    </nav>
  );
}
