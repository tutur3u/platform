'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  type DocumentOutlineItem,
  outlineLimit,
} from './document-outline-model';
import {
  filterOutlineItems,
  outlineSearchLimit,
} from './document-outline-search';

type OutlineProps = { items: DocumentOutlineItem[]; truncated: boolean };
export function DocumentOutline(props: OutlineProps) {
  return (
    <SearchableOutline
      key={JSON.stringify([props.items, props.truncated])}
      {...props}
    />
  );
}
function SearchableOutline({ items, truncated }: OutlineProps) {
  const t = useTranslations('lettin');
  const [search, setSearch] = useState('');
  const visible = filterOutlineItems(items, search);
  if (items.length < 2) return null;
  return (
    <nav
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
      <ol className="max-h-72 space-y-2 overflow-y-auto text-sm">
        {visible.map((item) => (
          <li key={item.id} className={item.level > 2 ? 'ms-4' : ''}>
            <a
              className="underline underline-offset-4"
              href={`#${item.id}`}
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
                const target = [
                  ...(article?.querySelectorAll<HTMLElement>(
                    '[data-lettin-heading]'
                  ) ?? []),
                ].find((heading) => heading.id === item.id);
                if (!target) return;
                event.preventDefault();
                for (
                  let parent = target.parentElement;
                  parent && parent !== article;
                  parent = parent.parentElement
                ) {
                  if (parent instanceof HTMLDetailsElement) parent.open = true;
                }
                target.focus({ preventScroll: true });
                target.scrollIntoView({ block: 'start', behavior: 'auto' });
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
