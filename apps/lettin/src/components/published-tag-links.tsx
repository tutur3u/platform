import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { catalogueQuery } from './public-catalogue-links';

/** Call only with published snapshots; draft tags must not become discovery links. */
export function PublishedTagLinks({ tags }: { tags: string[] }) {
  const t = useTranslations('lettin');
  if (!tags.length) return null;
  return (
    <nav
      aria-label={t('browseTags')}
      className="flex flex-wrap gap-2 border-border border-t p-4"
    >
      {[...new Set(tags)].map((tag) => (
        <Link
          key={tag}
          href={`/worlds${catalogueQuery({ tag })}`}
          className="break-words rounded-full border border-border px-3 py-1 text-xs underline-offset-4 hover:underline"
        >
          {tag}
        </Link>
      ))}
    </nav>
  );
}
