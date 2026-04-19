'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus } from '@tuturuuu/icons';
import {
  createWorkspaceExternalProjectEntry,
  updateWorkspaceExternalProjectCollection,
} from '@tuturuuu/internal-api';
import type {
  ExternalProjectEntry,
  ExternalProjectStudioAsset,
  ExternalProjectStudioData,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { usePathname, useRouter } from 'next/navigation';
import { type ComponentProps, useEffect, useState } from 'react';
import type { EpmStrings } from '../../epm-strings';
import { ResilientMediaImage } from '../../resilient-media-image';
import { getEpmStudioQueryKey, useEpmStudio } from '../../use-epm-studio';

function statusTone(status: ExternalProjectEntry['status']) {
  switch (status) {
    case 'published':
      return 'bg-emerald-500/10 text-emerald-600';
    case 'scheduled':
      return 'bg-amber-500/10 text-amber-600';
    case 'archived':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-sky-500/10 text-sky-600';
  }
}

function formatStatus(
  status: ExternalProjectEntry['status'],
  strings: EpmStrings
) {
  switch (status) {
    case 'archived':
      return strings.statusArchived;
    case 'published':
      return strings.statusPublished;
    case 'scheduled':
      return strings.statusScheduled;
    default:
      return strings.statusDraft;
  }
}

function getEntryVisual(
  assets: ExternalProjectStudioAsset[],
  entryId: string | null | undefined
) {
  if (!entryId) {
    return null;
  }

  return (
    assets.find(
      (asset) => asset.entry_id === entryId && asset.asset_type === 'image'
    ) ?? null
  );
}

function ActionButton({
  children,
  tooltip,
  ...props
}: ComponentProps<typeof Button> & { tooltip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button {...props}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function CollectionDetailClient({
  binding,
  collectionId,
  initialStudio,
  strings,
  workspaceId,
}: {
  binding: WorkspaceExternalProjectBinding;
  collectionId: string;
  initialStudio?: ExternalProjectStudioData;
  strings: EpmStrings;
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const studioQuery = useEpmStudio({
    initialData: initialStudio ? { ...initialStudio, binding } : undefined,
    workspaceId,
  });
  const studio = studioQuery.data;
  const collections = studio?.collections ?? initialStudio?.collections ?? [];
  const entries = studio?.entries ?? initialStudio?.entries ?? [];
  const assets = studio?.assets ?? initialStudio?.assets ?? [];
  const [search, setSearch] = useState('');

  const activeCollection =
    collections.find((collection) => collection.id === collectionId) ?? null;
  const collectionEntries = entries.filter(
    (entry) => entry.collection_id === collectionId
  );
  const visibleEntries = collectionEntries.filter((entry) => {
    if (!search.trim()) {
      return true;
    }

    const query = search.toLowerCase();
    return [entry.title, entry.slug, entry.summary, entry.subtitle]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(query));
  });

  const [title, setTitle] = useState(activeCollection?.title ?? '');
  const [description, setDescription] = useState(
    activeCollection?.description ?? ''
  );
  const [isEnabled, setIsEnabled] = useState(
    activeCollection?.is_enabled ?? true
  );

  const epmPath = pathname.split('/collections/')[0] ?? pathname;
  const updateStudioCache = (
    updater: (current: NonNullable<typeof studio>) => NonNullable<typeof studio>
  ) => {
    queryClient.setQueryData(
      getEpmStudioQueryKey(workspaceId),
      (current: typeof studio | undefined) =>
        current ? updater(current) : current
    );
  };

  useEffect(() => {
    if (!activeCollection) {
      return;
    }

    setTitle(activeCollection.title);
    setDescription(activeCollection.description ?? '');
    setIsEnabled(activeCollection.is_enabled);
  }, [activeCollection]);

  const saveCollectionMutation = useMutation({
    mutationFn: async () => {
      if (!activeCollection) {
        throw new Error('Collection is required');
      }

      return updateWorkspaceExternalProjectCollection(
        workspaceId,
        activeCollection.id,
        {
          description: description || null,
          is_enabled: isEnabled,
          title: title.trim() || activeCollection.title,
        }
      );
    },
    onError: () => toast.error(strings.editCollectionDescription),
    onSuccess: (nextCollection) => {
      updateStudioCache((current) => ({
        ...current,
        collections: current.collections.map((collection) =>
          collection.id === nextCollection.id ? nextCollection : collection
        ),
      }));
      setTitle(nextCollection.title);
      setDescription(nextCollection.description ?? '');
      setIsEnabled(nextCollection.is_enabled);
      toast.success(strings.saveAction);
    },
  });

  const createEntryMutation = useMutation({
    mutationFn: async () => {
      if (!activeCollection) {
        throw new Error('Collection is required');
      }

      return createWorkspaceExternalProjectEntry(workspaceId, {
        collection_id: activeCollection.id,
        metadata: {},
        profile_data: {},
        scheduled_for: null,
        slug: `draft-${Date.now()}`,
        status: 'draft',
        subtitle: null,
        summary: null,
        title: 'Untitled entry',
      });
    },
    onError: () => toast.error(strings.editEntryDescription),
    onSuccess: (entry) => {
      updateStudioCache((current) => ({
        ...current,
        entries: [entry, ...current.entries],
      }));
      toast.success(strings.createEntryAction);
      router.push(`${epmPath}/entries/${entry.id}`);
    },
  });

  if (studioQuery.isPending && !studio) {
    return (
      <div className="min-h-[calc(100svh-5rem)] space-y-5 pb-8">
        <section className="rounded-[2rem] border border-border/70 bg-card/95 p-5 shadow-none lg:p-6">
          <div className="space-y-3">
            <Skeleton className="h-6 w-32 rounded-lg" />
            <Skeleton className="h-10 w-72 rounded-xl" />
            <Skeleton className="h-4 w-full max-w-2xl rounded-lg" />
          </div>
        </section>
        <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <Card className="border-border/70 bg-card/95 shadow-none">
            <CardContent className="space-y-4 p-6">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-36 w-full rounded-[1.2rem]" />
              <Skeleton className="h-16 w-full rounded-[1.2rem]" />
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/95 shadow-none">
            <CardContent className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={`collection-entry-skeleton-${index}`}
                  className="space-y-3"
                >
                  <Skeleton className="aspect-[4/5] w-full rounded-[1.2rem]" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-5 w-3/4 rounded-lg" />
                  <Skeleton className="h-4 w-full rounded-lg" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!activeCollection) {
    return null;
  }

  return (
    <div className="min-h-[calc(100svh-5rem)] space-y-5 pb-8">
      <section className="rounded-[2rem] border border-border/70 bg-card/95 shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 lg:p-6">
          <div className="space-y-3">
            <Button
              variant="ghost"
              className="px-0"
              onClick={() => router.push(epmPath)}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {strings.backToEpmAction}
            </Button>
            <div className="space-y-2">
              <div className="text-[11px] text-muted-foreground uppercase tracking-[0.28em]">
                {strings.editCollectionAction}
              </div>
              <h1 className="font-semibold text-3xl tracking-tight">
                {activeCollection.title}
              </h1>
              <p className="max-w-3xl text-muted-foreground text-sm leading-6">
                {strings.editCollectionDescription}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <ActionButton
              tooltip={strings.quickCreateHint}
              onClick={() => createEntryMutation.mutate()}
            >
              <Plus className="mr-2 h-4 w-4" />
              {strings.createEntryAction}
            </ActionButton>
            <ActionButton
              tooltip={strings.editCollectionDescription}
              variant="outline"
              disabled={saveCollectionMutation.isPending}
              onClick={() => saveCollectionMutation.mutate()}
            >
              <Pencil className="mr-2 h-4 w-4" />
              {strings.saveAction}
            </ActionButton>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="border-border/70 bg-card/95 shadow-none">
          <CardHeader>
            <CardTitle>{strings.editCollectionAction}</CardTitle>
            <CardDescription>
              {strings.manageCollectionDescription}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="collection-title">{strings.titleLabel}</Label>
              <Input
                id="collection-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="collection-slug">{strings.slugLabel}</Label>
              <Input
                id="collection-slug"
                value={activeCollection.slug}
                disabled
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="collection-description">
                {strings.descriptionLabel}
              </Label>
              <Textarea
                id="collection-description"
                rows={6}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            <div className="flex items-center justify-between rounded-[1.15rem] border border-border/70 bg-background/70 px-4 py-3">
              <div>
                <div className="font-medium text-sm">
                  {strings.enabledLabel}
                </div>
                <div className="text-muted-foreground text-xs">
                  {strings.workspaceBindingLabel}
                </div>
              </div>
              <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.15rem] border border-border/70 bg-background/75 p-4">
                <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                  {strings.collectionsLabel}
                </div>
                <div className="mt-2 font-medium">{binding.canonical_id}</div>
              </div>
              <div className="rounded-[1.15rem] border border-border/70 bg-background/75 p-4">
                <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                  {strings.entriesMetricLabel}
                </div>
                <div className="mt-2 font-semibold text-2xl">
                  {collectionEntries.length}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/95 shadow-none">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>{strings.contentTab}</CardTitle>
                <CardDescription>{activeCollection.slug}</CardDescription>
              </div>
              <Badge variant="outline">{collectionEntries.length}</Badge>
            </div>
            <Input
              placeholder={strings.searchPlaceholder}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[38rem] pr-3">
              <div className="space-y-3">
                {visibleEntries.length === 0 ? (
                  <div className="rounded-[1.2rem] border border-border/70 border-dashed p-5 text-muted-foreground text-sm">
                    {strings.emptyEntries}
                  </div>
                ) : (
                  visibleEntries.map((entry) => {
                    const visual = getEntryVisual(assets, entry.id);

                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className={cn(
                          'grid w-full gap-4 rounded-[1.35rem] border border-border/70 bg-background/75 p-4 text-left transition-colors hover:bg-background',
                          'sm:grid-cols-[120px_minmax(0,1fr)_auto]'
                        )}
                        onClick={() =>
                          router.push(`${epmPath}/entries/${entry.id}`)
                        }
                      >
                        <div className="relative min-h-[92px] overflow-hidden rounded-[1rem] border border-border/70 bg-background/80">
                          <ResilientMediaImage
                            alt={visual?.alt_text ?? entry.title}
                            assetUrl={visual?.asset_url}
                            className="object-cover"
                            fill
                            previewUrl={visual?.preview_url}
                            sizes="120px"
                          />
                        </div>
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={statusTone(entry.status)}>
                              {formatStatus(entry.status, strings)}
                            </Badge>
                            <Badge variant="outline">{entry.slug}</Badge>
                          </div>
                          <div className="truncate font-medium text-base">
                            {entry.title}
                          </div>
                          <div className="line-clamp-2 text-muted-foreground text-sm leading-6">
                            {entry.summary || strings.emptyEntries}
                          </div>
                        </div>
                        <div className="flex items-start justify-end">
                          <Button size="sm" variant="outline">
                            {strings.openDetailsAction}
                          </Button>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
