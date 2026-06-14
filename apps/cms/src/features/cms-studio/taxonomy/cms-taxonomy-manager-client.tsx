'use client';

import { FolderTree, Search, Tag } from '@tuturuuu/icons';
import type { ExternalProjectEntry } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Input } from '@tuturuuu/ui/input';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useCmsStudio } from '../use-cms-studio';

type TaxonomyTerm = { label: string; count: number };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function tallyTerms(entries: ExternalProjectEntry[]) {
  const categories = new Map<string, number>();
  const tags = new Map<string, number>();

  for (const entry of entries) {
    const profile = asRecord(entry.profile_data);
    const category = profile.category;
    if (typeof category === 'string' && category.trim()) {
      const key = category.trim();
      categories.set(key, (categories.get(key) ?? 0) + 1);
    }
    if (Array.isArray(profile.tags)) {
      for (const tag of profile.tags) {
        if (typeof tag === 'string' && tag.trim()) {
          const key = tag.trim();
          tags.set(key, (tags.get(key) ?? 0) + 1);
        }
      }
    }
  }

  const toSorted = (map: Map<string, number>): TaxonomyTerm[] =>
    [...map.entries()]
      .map(([label, count]) => ({ count, label }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return { categories: toSorted(categories), tags: toSorted(tags) };
}

function TermColumn({
  emptyLabel,
  icon,
  postsLabel,
  terms,
  title,
}: {
  emptyLabel: string;
  icon: React.ReactNode;
  postsLabel: string;
  terms: TaxonomyTerm[];
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
      <div className="flex items-center justify-between gap-3 border-border/70 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <h2 className="font-semibold">{title}</h2>
        </div>
        <Badge variant="outline" className="rounded-md tabular-nums">
          {terms.length}
        </Badge>
      </div>
      {terms.length === 0 ? (
        <div className="px-4 py-8 text-muted-foreground text-sm">
          {emptyLabel}
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {terms.map((term) => (
            <li
              key={term.label}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <span className="truncate font-medium text-sm">{term.label}</span>
              <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                {term.count} {postsLabel}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CmsTaxonomyManagerClient({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const t = useTranslations('external-projects');
  const studioQuery = useCmsStudio({ workspaceId });
  const [search, setSearch] = useState('');

  const { categories, tags } = useMemo(
    () => tallyTerms(studioQuery.data?.entries ?? []),
    [studioQuery.data?.entries]
  );

  const query = search.trim().toLowerCase();
  const filterTerms = (terms: TaxonomyTerm[]) =>
    query
      ? terms.filter((term) => term.label.toLowerCase().includes(query))
      : terms;

  if (studioQuery.isPending) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-28 rounded-lg" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <main className="space-y-5 pb-8">
      <section className="rounded-lg border border-border/70 bg-card/75 p-5">
        <h1 className="font-semibold text-2xl">
          {t('epm.taxonomy_manager_title')}
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground text-sm leading-6">
          {t('epm.taxonomy_manager_description')}
        </p>
        <div className="relative mt-4 w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9"
            placeholder={t('epm.taxonomy_manager_search_placeholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <TermColumn
          emptyLabel={t('epm.taxonomy_manager_empty_categories')}
          icon={<FolderTree className="h-4 w-4" />}
          postsLabel={t('epm.taxonomy_manager_posts_label')}
          terms={filterTerms(categories)}
          title={t('epm.taxonomy_manager_categories_title')}
        />
        <TermColumn
          emptyLabel={t('epm.taxonomy_manager_empty_tags')}
          icon={<Tag className="h-4 w-4" />}
          postsLabel={t('epm.taxonomy_manager_posts_label')}
          terms={filterTerms(tags)}
          title={t('epm.taxonomy_manager_tags_title')}
        />
      </div>
    </main>
  );
}
