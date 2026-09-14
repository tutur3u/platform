'use client';
import { ArrowRight, BookOpen } from '@tuturuuu/icons';
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
    <main className="mx-auto max-w-[90rem] px-5 py-12 md:px-10">
      <header className="lettin-section-heading grid gap-7 md:grid-cols-[1fr_22rem] md:items-end">
        <div>
          <p className="lettin-kicker">{t('publicLibrary')}</p>
          <h1 className="mt-6">{t('exploreWorlds')}</h1>
        </div>
        <form method="get" className="border-accent border-l-4 pl-5">
          <label className="block space-y-2 font-black text-xs uppercase tracking-[0.12em]">
            {t('searchWorlds')}
            <Input name="q" defaultValue={search} maxLength={200} />
          </label>
          <button
            type="submit"
            className="mt-3 font-black text-xs uppercase tracking-[0.12em] underline decoration-2 underline-offset-4"
          >
            {t('searchWorlds')}
            <ArrowRight className="ml-1 inline size-4" />
          </button>
        </form>
      </header>
      {!filtered.length && (
        <p className="notebook-paper rounded-xl p-10">
          {t(worlds.length ? 'noResults' : 'emptyPublic')}
        </p>
      )}
      <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((world, index) => (
          <Link
            key={world.id}
            href={`/worlds/${world.id}`}
            className="notebook-cover overflow-hidden"
          >
            <div className="relative flex h-52 items-center justify-center overflow-hidden bg-secondary">
              {world.published.image ? (
                // biome-ignore lint/performance/noImgElement: Artwork must bypass optimizer caching so private media access can be revoked.
                <img
                  alt=""
                  src={world.published.image}
                  referrerPolicy="no-referrer"
                  className="size-full object-cover"
                />
              ) : (
                <BookOpen className="size-16 -rotate-6 text-primary" />
              )}
              <span className="absolute top-3 left-3 bg-foreground px-2 py-1 font-black text-[10px] text-primary-foreground uppercase tracking-widest">
                0{(index % 9) + 1} / {t('published')}
              </span>
            </div>
            <div className="p-6">
              <h2 className="break-words text-4xl uppercase leading-none">
                {world.published.title}
              </h2>
              <p className="lettin-serif my-4 line-clamp-3 text-sm leading-relaxed">
                {world.published.description}
              </p>
              <p className="border-border border-t-2 pt-3 font-bold text-xs uppercase tracking-wider">
                {world.published.credit}
              </p>
            </div>
          </Link>
        ))}
      </div>
      <nav
        className="mt-12 flex gap-8 border-border border-t-3 pt-5 font-black text-xs uppercase tracking-widest"
        aria-label={t('pagination')}
      >
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
