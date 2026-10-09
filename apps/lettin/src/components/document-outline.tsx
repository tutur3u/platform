'use client';
import { useTranslations } from 'next-intl';
import type { DocumentOutlineItem } from './document-outline-model';
export function DocumentOutline({
  items,
  truncated,
}: {
  items: DocumentOutlineItem[];
  truncated: boolean;
}) {
  const t = useTranslations('lettin');
  if (items.length < 2) return null;
  return (
    <nav
      aria-label={t('documentOutline')}
      className="my-6 rounded border border-border bg-muted/40 p-4"
    >
      <h2 className="mb-3 font-semibold text-base">{t('documentOutline')}</h2>
      <ol className="max-h-72 space-y-2 overflow-y-auto text-sm">
        {items.map((item) => (
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
          {t('documentOutlineLimit', { count: 100 })}
        </p>
      )}
    </nav>
  );
}
