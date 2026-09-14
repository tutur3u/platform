'use client';
import { BookOpen } from '@tuturuuu/icons';
import type { LettinPublicWorld } from '@tuturuuu/internal-api/lettin';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
export function PublicExplorer({
  worlds,
  page = 1,
  search = '',
}: {
  worlds: LettinPublicWorld[];
  page?: number;
  search?: string;
}) {
  const t = useTranslations('lettin');
  const filtered = worlds.slice(0, 24);
  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <p className="text-muted-foreground text-xs uppercase tracking-widest">
        {t('publicLibrary')}
      </p>
      <h1 className="my-5 text-5xl">{t('exploreWorlds')}</h1>
      <form method="get">
        <label className="mb-10 block max-w-md space-y-2 text-sm">
          {t('searchWorlds')}
          <Input name="q" defaultValue={search} maxLength={200} />
          <button type="submit" className="mt-2 underline">
            {t('searchWorlds')}
          </button>
        </label>
      </form>
      {!filtered.length && (
        <p className="notebook-paper rounded-xl p-10">
          {t(worlds.length ? 'noResults' : 'emptyPublic')}
        </p>
      )}
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((world) => (
          <Link
            key={world.id}
            href={`/worlds/${world.id}`}
            className="notebook-cover overflow-hidden"
          >
            <div className="flex h-44 items-center justify-center bg-accent">
              {world.published.image ? (
                // biome-ignore lint/performance/noImgElement: Artwork must bypass optimizer caching so private media access can be revoked.
                <img
                  alt=""
                  src={world.published.image}
                  referrerPolicy="no-referrer"
                  className="size-full object-cover"
                />
              ) : (
                <BookOpen className="size-14 text-primary" />
              )}
            </div>
            <div className="p-6">
              <h2 className="break-words text-3xl">{world.published.title}</h2>
              <p className="my-3 line-clamp-3 text-muted-foreground text-sm">
                {world.published.description}
              </p>
              <p className="text-xs">{world.published.credit}</p>
            </div>
          </Link>
        ))}
      </div>
      <nav className="mt-8 flex gap-6" aria-label={t('pagination')}>
        {page > 1 && (
          <Link href={`?page=${page - 1}&q=${encodeURIComponent(search)}`}>
            {t('previousPage')}
          </Link>
        )}
        {worlds.length > 24 && (
          <Link href={`?page=${page + 1}&q=${encodeURIComponent(search)}`}>
            {t('nextPage')}
          </Link>
        )}
      </nav>
    </main>
  );
}
