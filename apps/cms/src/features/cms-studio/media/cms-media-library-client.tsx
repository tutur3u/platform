'use client';

import { ImageIcon, Music, Search } from '@tuturuuu/icons';
import type {
  ExternalProjectEntry,
  ExternalProjectStudioAsset,
} from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ResilientMediaImage } from '../resilient-media-image';
import { useCmsStudio } from '../use-cms-studio';

type MediaFilter = 'all' | 'images' | 'audio';

function isAudioAsset(asset: ExternalProjectStudioAsset) {
  return asset.asset_type?.toLowerCase().includes('audio') ?? false;
}

function getAssetName(asset: ExternalProjectStudioAsset) {
  const source = asset.storage_path || asset.source_url || '';
  const segment = source.split(/[/?#]/).filter(Boolean).pop();
  return segment ? decodeURIComponent(segment) : asset.asset_type;
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
      <div className="font-semibold text-base tabular-nums">{value}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}

function MediaCard({
  asset,
  audioLabel,
  usedInLabel,
  unattachedLabel,
  entryTitle,
}: {
  asset: ExternalProjectStudioAsset;
  audioLabel: string;
  usedInLabel: string;
  unattachedLabel: string;
  entryTitle: string | null;
}) {
  const audio = isAudioAsset(asset);
  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75 transition-colors hover:border-foreground/25">
      <div className="relative flex aspect-video items-center justify-center bg-background/60">
        {audio ? (
          <Music className="h-8 w-8 text-muted-foreground" />
        ) : (
          <ResilientMediaImage
            alt={asset.alt_text ?? getAssetName(asset)}
            assetUrl={asset.asset_url}
            className="object-cover"
            fill
            previewUrl={asset.preview_url}
            sizes="(max-width: 768px) 50vw, 20vw"
          />
        )}
        <Badge
          variant="secondary"
          className="absolute top-2 left-2 rounded-md text-xs"
        >
          {audio ? audioLabel : asset.asset_type}
        </Badge>
      </div>
      <div className="space-y-1 p-3">
        <div
          className="truncate font-medium text-sm"
          title={getAssetName(asset)}
        >
          {getAssetName(asset)}
        </div>
        <div className="truncate text-muted-foreground text-xs">
          {entryTitle ? `${usedInLabel}: ${entryTitle}` : unattachedLabel}
        </div>
      </div>
    </div>
  );
}

export function CmsMediaLibraryClient({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const t = useTranslations('external-projects');
  const studioQuery = useCmsStudio({ workspaceId });
  const [filter, setFilter] = useState<MediaFilter>('all');
  const [search, setSearch] = useState('');

  const assets = studioQuery.data?.assets ?? [];
  const entryTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of studioQuery.data?.entries ?? []) {
      map.set(entry.id, (entry as ExternalProjectEntry).title);
    }
    return map;
  }, [studioQuery.data?.entries]);

  const imageCount = assets.filter((asset) => !isAudioAsset(asset)).length;
  const audioCount = assets.length - imageCount;

  const visibleAssets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return assets.filter((asset) => {
      if (filter === 'images' && isAudioAsset(asset)) return false;
      if (filter === 'audio' && !isAudioAsset(asset)) return false;
      if (!query) return true;
      return (
        getAssetName(asset).toLowerCase().includes(query) ||
        (asset.asset_type?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [assets, filter, search]);

  const filters: Array<{ label: string; value: MediaFilter }> = [
    { label: t('epm.media_filter_all'), value: 'all' },
    { label: t('epm.media_filter_images'), value: 'images' },
    { label: t('epm.media_filter_audio'), value: 'audio' },
  ];

  if (studioQuery.isPending) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-28 rounded-lg" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <main className="space-y-5 pb-8">
      <section className="rounded-lg border border-border/70 bg-card/75 p-5">
        <h1 className="font-semibold text-2xl">
          {t('epm.media_library_title')}
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground text-sm leading-6">
          {t('epm.media_library_description')}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:max-w-md">
          <StatPill
            label={t('epm.media_library_files_label')}
            value={assets.length}
          />
          <StatPill
            label={t('epm.media_library_images_label')}
            value={imageCount}
          />
          <StatPill
            label={t('epm.media_library_audio_label')}
            value={audioCount}
          />
        </div>
      </section>

      <section className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {filters.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={filter === option.value ? 'default' : 'ghost'}
              className={cn(
                'h-9 rounded-lg',
                filter !== option.value &&
                  'border border-border/70 bg-background/60'
              )}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9"
            placeholder={t('epm.media_library_search_placeholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </section>

      {visibleAssets.length === 0 ? (
        <section className="flex flex-col items-center justify-center rounded-lg border border-border/70 border-dashed bg-card/40 px-6 py-16 text-center">
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">
            {t('epm.media_library_empty_title')}
          </h2>
          <p className="mt-1 max-w-sm text-muted-foreground text-sm leading-6">
            {t('epm.media_library_empty_description')}
          </p>
        </section>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {visibleAssets.map((asset) => (
            <MediaCard
              key={asset.id}
              asset={asset}
              audioLabel={t('epm.media_library_audio_label')}
              entryTitle={
                asset.entry_id
                  ? (entryTitleById.get(asset.entry_id) ?? null)
                  : null
              }
              unattachedLabel={t('epm.media_library_unattached_label')}
              usedInLabel={t('epm.media_library_used_in_label')}
            />
          ))}
        </section>
      )}
    </main>
  );
}
