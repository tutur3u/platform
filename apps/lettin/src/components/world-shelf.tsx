'use client';
import { ArrowUpRight, BookOpen, Search } from '@tuturuuu/icons';
import type { LettinOverview } from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { ContentNotice } from './content-notice';
import {
  matchesStudioMembership,
  type StudioMembership,
  StudioMembershipFilter,
} from './studio-membership-filter';
import {
  orderStudioWorlds,
  type StudioOrder,
  StudioOrderControl,
} from './studio-order';
import { StudioTagFilter } from './studio-tag-filter';

type WorldShelfProps = {
  wsId: string;
  shelf: LettinOverview['worlds'];
};

export function WorldShelf(props: WorldShelfProps) {
  return <WorldShelfContent key={props.wsId} {...props} />;
}

function WorldShelfContent({ wsId, shelf }: WorldShelfProps) {
  const t = useTranslations('lettin');
  const locale = useLocale();
  const [order, setOrder] = useState<StudioOrder>('source');
  const [search, setSearch] = useState('');
  const [membership, setMembership] = useState<StudioMembership>('all');
  const [tag, setTag] = useState<string | null>(null);
  const tags = [...new Set(shelf.flatMap((world) => world.draft.tags ?? []))]
    .filter((value) => value.trim())
    .sort();
  const activeTag = tag !== null && tags.includes(tag) ? tag : null;
  useEffect(() => {
    if (tag !== null && activeTag === null) setTag(null);
  }, [tag, activeTag]);
  const [filter, setFilter] = useState<'all' | 'draft' | 'published'>('all');
  const publishedCount = shelf.filter((world) => world.published_at).length;
  const worlds = orderStudioWorlds(
    shelf.filter((world) => {
      const matchesStatus =
        filter === 'all' ||
        (filter === 'published' ? !!world.published_at : !world.published_at);
      return (
        matchesStudioMembership(world.role, membership) &&
        matchesStatus &&
        (activeTag === null || world.draft.tags?.includes(activeTag)) &&
        `${world.draft.title} ${world.draft.description} ${(world.draft.tags ?? []).join(' ')}`
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase())
      );
    }),
    order,
    locale
  );
  const [announcedCount, setAnnouncedCount] = useState(worlds.length);
  useEffect(() => {
    const timer = setTimeout(() => setAnnouncedCount(worlds.length), 500);
    return () => clearTimeout(timer);
  }, [worlds.length]);
  return (
    <section aria-label={t('myWorlds')}>
      <div className="studio-stats mb-6">
        <span>
          <strong>{shelf.length}</strong>
          {t('totalWorlds')}
        </span>
        <span>
          <strong>{shelf.length - publishedCount}</strong>
          {t('draft')}
        </span>
        <span>
          <strong>{publishedCount}</strong>
          {t('published')}
        </span>
      </div>
      <div className="studio-shelf-bar">
        <label className="relative">
          <Search
            className="absolute top-3 left-3 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="sr-only">{t('searchStudio')}</span>
          <Input
            className="pl-9"
            placeholder={t('searchStudio')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <fieldset className="studio-filters" aria-label={t('filterWorlds')}>
          {(['all', 'draft', 'published'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {t(value)}
            </button>
          ))}
        </fieldset>
      </div>
      <StudioMembershipFilter value={membership} onChange={setMembership} />
      <StudioTagFilter tags={tags} value={activeTag} onChange={setTag} />
      <StudioOrderControl value={order} onChange={setOrder} />
      <p role="status" className="sr-only">
        {t('worldCount', { count: announcedCount })}
      </p>
      {!worlds.length && (
        <div className="notebook-paper p-8">
          <p>{t('noStudioResults')}</p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => {
              setSearch('');
              setFilter('all');
              setMembership('all');
              setTag(null);
              setOrder('source');
            }}
          >
            {t('clearFilters')}
          </Button>
        </div>
      )}
      <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
        {worlds.map((world, index) => (
          <Link
            key={world.id}
            href={`/${wsId}/worlds/${world.id}`}
            className="notebook-cover block overflow-hidden focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ContentNotice notice={world.draft.contentNotice} />
            <div
              className={`studio-world-art studio-world-art-${index % 3} flex h-52 items-center justify-center overflow-hidden`}
            >
              {world.draft.image ? (
                // biome-ignore lint/performance/noImgElement: Artwork access must remain revocable without optimizer caching.
                <img
                  src={world.draft.image}
                  alt=""
                  className="size-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <BookOpen className="relative size-12 -rotate-6 text-primary" />
              )}
            </div>
            <div className="p-6">
              <div className="flex justify-between gap-2">
                <p className="text-muted-foreground text-xs">
                  {t(world.published_at ? 'published' : 'draft')}
                </p>
                <ArrowUpRight size={16} />
              </div>
              <h2 className="mt-3 break-words text-4xl leading-none">
                {world.draft.title}
              </h2>
              <p className="lettin-summary mt-3 line-clamp-2 text-sm leading-relaxed">
                {world.draft.description || t('worldWaiting')}
              </p>
              <div className="mt-5 flex flex-wrap gap-2 border-border/20 border-t pt-3 text-xs">
                <span>{t(world.role)}</span>
                {(world.draft.tags ?? []).slice(0, 3).map((tag, index) => (
                  <span
                    key={`${index}-${tag}`}
                    className="rounded-full bg-muted px-2 py-0.5"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
