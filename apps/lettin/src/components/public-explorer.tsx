'use client';
import { BookOpen } from '@tuturuuu/icons';
import type { LettinPublicWorld } from '@tuturuuu/internal-api/lettin';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
export function PublicExplorer({ worlds }: { worlds: LettinPublicWorld[] }) {
  const t = useTranslations('lettin');
  const [search, setSearch] = useState('');
  const filtered = worlds.filter((w) =>
    `${w.published.title} ${w.published.description} ${w.published.credit}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );
  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <p className="text-muted-foreground text-xs uppercase tracking-widest">
        {t('publicLibrary')}
      </p>
      <h1 className="my-5 text-5xl">{t('exploreWorlds')}</h1>
      <label className="mb-10 block max-w-md space-y-2 text-sm">
        {t('searchWorlds')}
        <Input value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
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
    </main>
  );
}
