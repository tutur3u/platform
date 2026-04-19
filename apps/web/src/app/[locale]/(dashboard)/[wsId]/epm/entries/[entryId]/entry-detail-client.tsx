'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Eye,
  ImagePlus,
  Pencil,
  RefreshCw,
  Trash2,
} from '@tuturuuu/icons';
import {
  createWorkspaceExternalProjectAsset,
  deleteWorkspaceExternalProjectEntry,
  duplicateWorkspaceExternalProjectEntry,
  publishWorkspaceExternalProjectEntry,
  updateWorkspaceExternalProjectAsset,
  updateWorkspaceExternalProjectEntry,
  uploadWorkspaceExternalProjectAssetFile,
} from '@tuturuuu/internal-api';
import type {
  ExternalProjectEntry,
  ExternalProjectStudioAsset,
  ExternalProjectStudioData,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { usePathname, useRouter } from 'next/navigation';
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useExternalProjectLivePreview } from '../../../external-projects/use-external-project-live-preview';
import type { EpmStrings } from '../../epm-strings';
import { ResilientMediaImage } from '../../resilient-media-image';
import { getEpmStudioQueryKey, useEpmStudio } from '../../use-epm-studio';
import { EntryDetailLoadingState } from './entry-detail-loading-state';
import { EntryDetailPreviewSheet } from './entry-detail-preview-sheet';
import {
  ActionButton,
  buildEntryFormState,
  formatDateLabel,
  formatStatus,
  fromDateTimeLocalValue,
  sortImageAssets,
  statusTone,
  toStudioAsset,
} from './entry-detail-shared';

export function EntryDetailClient({
  binding,
  entryId,
  initialStudio,
  onDeleted,
  onEntryChange,
  onOpenChange,
  open,
  strings,
  variant = 'page',
  workspaceId,
}: {
  binding: WorkspaceExternalProjectBinding;
  entryId: string;
  initialStudio?: ExternalProjectStudioData;
  onDeleted?: () => void;
  onEntryChange?: (entryId: string) => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  strings: EpmStrings;
  variant?: 'dialog' | 'page';
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const studioQuery = useEpmStudio({
    initialData: initialStudio ? { ...initialStudio, binding } : undefined,
    workspaceId,
  });
  const studio = studioQuery.data;
  const entries = studio?.entries ?? initialStudio?.entries ?? [];
  const assets = studio?.assets ?? initialStudio?.assets ?? [];
  const collections = studio?.collections ?? initialStudio?.collections ?? [];
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRefreshToken, setPreviewRefreshToken] = useState(0);
  const activeEntry = entries.find((entry) => entry.id === entryId) ?? null;
  const activeCollection =
    collections.find(
      (collection) => collection.id === activeEntry?.collection_id
    ) ?? null;
  const imageAssets = useMemo(
    () => sortImageAssets(assets, entryId),
    [assets, entryId]
  );
  const coverAsset = imageAssets[0] ?? null;
  const [entryForm, setEntryForm] = useState(() =>
    activeEntry ? buildEntryFormState(activeEntry) : null
  );
  const [coverAltText, setCoverAltText] = useState(
    coverAsset?.alt_text ?? activeEntry?.title ?? ''
  );

  const previewQuery = useExternalProjectLivePreview({
    enabled: previewOpen,
    refreshToken: previewRefreshToken,
    selectedEntryId: activeEntry?.id ?? null,
    workspaceId,
  });

  const previewEntry =
    previewQuery.data?.collections
      .flatMap((collection) => collection.entries)
      .find((entry) => entry.id === activeEntry?.id) ?? null;

  const detailPath = pathname.replace(/\/$/, '');
  const dashboardPath = detailPath.replace(/\/entries\/[^/]+$/, '');

  const entryDirty =
    !!activeEntry &&
    !!entryForm &&
    (entryForm.title !== activeEntry.title ||
      entryForm.slug !== activeEntry.slug ||
      entryForm.subtitle !== (activeEntry.subtitle ?? '') ||
      entryForm.summary !== (activeEntry.summary ?? '') ||
      entryForm.status !== activeEntry.status ||
      fromDateTimeLocalValue(entryForm.scheduledFor) !==
        (activeEntry.scheduled_for ?? null));
  const coverDirty =
    !!activeEntry &&
    coverAltText !== (coverAsset?.alt_text ?? activeEntry.title);
  const activeEntryTitle = activeEntry?.title ?? strings.title;
  const hasCoverMedia = Boolean(
    coverAsset?.preview_url || coverAsset?.asset_url
  );

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
    if (!activeEntry) {
      setEntryForm(null);
      return;
    }

    setEntryForm(buildEntryFormState(activeEntry));
  }, [activeEntry]);

  useEffect(() => {
    if (!activeEntry) {
      setCoverAltText('');
      return;
    }

    setCoverAltText(coverAsset?.alt_text ?? activeEntry.title);
  }, [activeEntry, coverAsset?.alt_text]);

  const mergeEntry = (nextEntry: ExternalProjectEntry) => {
    updateStudioCache((current) => ({
      ...current,
      entries: current.entries.map((entry) =>
        entry.id === nextEntry.id ? nextEntry : entry
      ),
    }));
    setEntryForm(buildEntryFormState(nextEntry));
  };

  const mergeAsset = (nextAsset: ExternalProjectStudioAsset) => {
    updateStudioCache((current) => {
      const index = current.assets.findIndex(
        (asset) => asset.id === nextAsset.id
      );
      const nextAssets =
        index === -1
          ? [...current.assets, nextAsset]
          : current.assets.map((asset) =>
              asset.id === nextAsset.id ? nextAsset : asset
            );

      return {
        ...current,
        assets: nextAssets,
      };
    });
    setCoverAltText(nextAsset.alt_text ?? activeEntryTitle);
  };

  const saveEntryMutation = useMutation({
    mutationFn: async () => {
      if (!activeEntry || !entryForm) {
        throw new Error(strings.emptyEntries);
      }

      return updateWorkspaceExternalProjectEntry(workspaceId, activeEntry.id, {
        scheduled_for: fromDateTimeLocalValue(entryForm.scheduledFor),
        slug: entryForm.slug.trim(),
        status: entryForm.status,
        subtitle: entryForm.subtitle.trim() || null,
        summary: entryForm.summary.trim() || null,
        title: entryForm.title.trim(),
      });
    },
    onSuccess: (entry) => {
      mergeEntry(entry);
      toast.success(strings.saveAction);
    },
  });

  const publishEntryMutation = useMutation({
    mutationFn: async (eventKind: 'publish' | 'unpublish') => {
      if (!activeEntry) {
        throw new Error(strings.emptyEntries);
      }

      return publishWorkspaceExternalProjectEntry(
        workspaceId,
        activeEntry.id,
        eventKind
      );
    },
    onSuccess: (entry) => {
      mergeEntry(entry);
      setPreviewRefreshToken((value) => value + 1);
      toast.success(
        entry.status === 'published'
          ? strings.publishAction
          : strings.unpublishAction
      );
    },
  });

  const duplicateEntryMutation = useMutation({
    mutationFn: async () => {
      if (!activeEntry) {
        throw new Error(strings.emptyEntries);
      }

      return duplicateWorkspaceExternalProjectEntry(
        workspaceId,
        activeEntry.id
      );
    },
    onSuccess: (entry) => {
      updateStudioCache((current) => ({
        ...current,
        entries: [entry, ...current.entries],
      }));
      toast.success(strings.duplicateAction);
      if (variant === 'dialog') {
        onEntryChange?.(entry.id);
        return;
      }

      router.push(`${dashboardPath}/entries/${entry.id}`);
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async () => {
      if (!activeEntry) {
        throw new Error(strings.emptyEntries);
      }

      return deleteWorkspaceExternalProjectEntry(workspaceId, activeEntry.id);
    },
    onSuccess: () => {
      updateStudioCache((current) => ({
        ...current,
        assets: current.assets.filter((asset) => asset.entry_id !== entryId),
        entries: current.entries.filter((entry) => entry.id !== entryId),
      }));
      toast.success(strings.deleteEntryAction);
      onDeleted?.();

      if (variant === 'dialog') {
        onOpenChange?.(false);
        return;
      }

      router.push(dashboardPath);
    },
  });

  const saveCoverMutation = useMutation({
    mutationFn: async () => {
      if (!coverAsset) {
        throw new Error(strings.noCoverTitle);
      }

      return updateWorkspaceExternalProjectAsset(workspaceId, coverAsset.id, {
        alt_text: coverAltText.trim() || activeEntryTitle,
      });
    },
    onSuccess: (asset) => {
      mergeAsset(toStudioAsset(asset, coverAsset));
      toast.success(strings.coverSaveSuccessToast);
    },
  });

  const uploadCoverMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!activeCollection) {
        throw new Error(strings.emptyCollection);
      }

      const upload = await uploadWorkspaceExternalProjectAssetFile(
        workspaceId,
        file,
        {
          collectionType: activeCollection.collection_type,
          entrySlug: entryForm?.slug.trim() || activeEntry?.slug || 'entry',
          upsert: true,
        }
      );

      if (coverAsset) {
        return updateWorkspaceExternalProjectAsset(workspaceId, coverAsset.id, {
          alt_text: coverAltText.trim() || file.name,
          asset_type: 'image',
          sort_order: 0,
          source_url: null,
          storage_path: upload.path,
        });
      }

      return createWorkspaceExternalProjectAsset(workspaceId, {
        alt_text: coverAltText.trim() || file.name,
        asset_type: 'image',
        entry_id: activeEntry?.id ?? entryId,
        metadata: {},
        sort_order: 0,
        source_url: null,
        storage_path: upload.path,
      });
    },
    onSuccess: (asset) => {
      mergeAsset(toStudioAsset(asset, coverAsset));
      setPreviewRefreshToken((value) => value + 1);
      toast.success(strings.coverUploadSuccessToast);
    },
  });

  const setAsCoverMutation = useMutation({
    mutationFn: async (assetId: string) => {
      const nextOrder = [
        imageAssets.find((asset) => asset.id === assetId)!,
        ...imageAssets.filter((asset) => asset.id !== assetId),
      ];

      return Promise.all(
        nextOrder.map((asset, index) =>
          updateWorkspaceExternalProjectAsset(workspaceId, asset.id, {
            sort_order: index,
          })
        )
      );
    },
    onSuccess: (updatedAssets) => {
      updateStudioCache((current) => ({
        ...current,
        assets: current.assets.map((asset) =>
          toStudioAsset(
            updatedAssets.find((updated) => updated.id === asset.id) ?? asset,
            asset
          )
        ),
      }));
      setCoverAltText(updatedAssets[0]?.alt_text ?? activeEntryTitle);
      toast.success(strings.coverSaveSuccessToast);
    },
  });

  const handleCoverInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    uploadCoverMutation.mutate(file);
  };

  if (studioQuery.isPending && !studio) {
    return variant === 'dialog' ? (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="inset-0 top-0 left-0 h-screen max-h-screen max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none border-0 p-0 sm:max-w-none">
          <EntryDetailLoadingState />
        </DialogContent>
      </Dialog>
    ) : (
      <EntryDetailLoadingState />
    );
  }

  if (!activeEntry || !entryForm) {
    return null;
  }

  const content = (
    <div className="mx-auto min-h-[calc(100svh-5rem)] max-w-[1580px] space-y-6 pb-10">
      <input
        ref={coverInputRef}
        accept="image/*"
        className="hidden"
        type="file"
        onChange={handleCoverInputChange}
      />

      <div className="sticky top-0 z-20 -mx-2 rounded-[1.7rem] border border-border/70 bg-background/95 px-4 py-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:mx-0 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-4xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {variant === 'page' ? (
                <Button
                  variant="ghost"
                  onClick={() => router.push(dashboardPath)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {strings.backToEpmAction}
                </Button>
              ) : null}
              <Badge variant="outline">
                {activeCollection?.title ?? strings.collectionFallbackLabel}
              </Badge>
              <Badge className={statusTone(activeEntry.status)}>
                {formatStatus(activeEntry.status, strings)}
              </Badge>
              {coverAsset ? (
                <Badge variant="outline">{strings.coverBadge}</Badge>
              ) : null}
              {entryDirty || coverDirty ? (
                <Badge variant="outline">{strings.saveAction}</Badge>
              ) : null}
            </div>
            <div>
              <h1 className="font-semibold text-3xl tracking-tight">
                {activeEntry.title}
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
                {activeEntry.slug}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card/90 p-2">
            <ActionButton
              tooltip={strings.refreshAction}
              size="sm"
              variant="outline"
              onClick={() => {
                setPreviewRefreshToken((value) => value + 1);
                queryClient.invalidateQueries({
                  queryKey: getEpmStudioQueryKey(workspaceId),
                });
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </ActionButton>
            <ActionButton
              tooltip={strings.openPreviewAction}
              size="sm"
              variant="outline"
              onClick={() => setPreviewOpen(true)}
            >
              <Eye className="mr-2 h-4 w-4" />
              {strings.openPreviewAction}
            </ActionButton>
            <ActionButton
              tooltip={strings.duplicateAction}
              size="sm"
              variant="outline"
              disabled={duplicateEntryMutation.isPending}
              onClick={() => duplicateEntryMutation.mutate()}
            >
              <Copy className="mr-2 h-4 w-4" />
              {strings.duplicateAction}
            </ActionButton>
            <Button
              size="sm"
              disabled={
                (!entryDirty && !coverDirty) ||
                saveEntryMutation.isPending ||
                saveCoverMutation.isPending
              }
              onClick={() => {
                if (entryDirty) {
                  saveEntryMutation.mutate();
                }

                if (coverDirty && coverAsset) {
                  saveCoverMutation.mutate();
                }
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              {strings.saveAction}
            </Button>
            <ActionButton
              size="sm"
              tooltip={
                activeEntry.status === 'published'
                  ? strings.unpublishAction
                  : strings.publishAction
              }
              disabled={publishEntryMutation.isPending}
              onClick={() =>
                publishEntryMutation.mutate(
                  activeEntry.status === 'published' ? 'unpublish' : 'publish'
                )
              }
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {activeEntry.status === 'published'
                ? strings.unpublishAction
                : strings.publishAction}
            </ActionButton>
            <ActionButton
              tooltip={strings.deleteEntryAction}
              size="sm"
              variant="outline"
              disabled={deleteEntryMutation.isPending}
              onClick={() => deleteEntryMutation.mutate()}
            >
              <Trash2 className="h-4 w-4" />
            </ActionButton>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          <Card className="overflow-hidden border-border/70 bg-card/95 shadow-none">
            <CardContent
              className={cn(
                'grid gap-5 p-5 lg:p-6',
                hasCoverMedia
                  ? 'lg:grid-cols-[minmax(0,1.08fr)_320px]'
                  : 'lg:grid-cols-[minmax(0,0.94fr)_340px]'
              )}
            >
              <div
                className={cn(
                  'relative overflow-hidden rounded-[1.6rem] border border-border/70 bg-background/80',
                  hasCoverMedia
                    ? 'min-h-[320px] lg:min-h-[420px]'
                    : 'flex min-h-[280px] flex-col justify-between p-6'
                )}
              >
                {coverAsset && hasCoverMedia ? (
                  <ResilientMediaImage
                    alt={coverAsset.alt_text ?? activeEntry.title}
                    assetUrl={coverAsset.asset_url}
                    className="object-cover"
                    fill
                    previewUrl={coverAsset.preview_url}
                    sizes="(max-width: 1280px) 100vw, 62vw"
                  />
                ) : null}
                {coverAsset && hasCoverMedia ? (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/24 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-5">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-[0.3em]">
                        {strings.coverImageTitle}
                      </p>
                      <h2 className="mt-3 font-semibold text-2xl tracking-tight">
                        {activeEntry.title}
                      </h2>
                      <p className="mt-2 max-w-xl text-muted-foreground text-sm leading-6">
                        {strings.coverImageDescription}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-[0.3em]">
                        {strings.coverImageTitle}
                      </p>
                      <h2 className="font-semibold text-2xl tracking-tight">
                        {strings.noCoverTitle}
                      </h2>
                      <p className="max-w-md text-muted-foreground text-sm leading-6">
                        {strings.noCoverDescription}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => coverInputRef.current?.click()}
                      >
                        <ImagePlus className="mr-2 h-4 w-4" />
                        {strings.uploadCoverAction}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPreviewOpen(true)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        {strings.openPreviewAction}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="rounded-[1.35rem] border border-border/70 bg-background/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] text-muted-foreground uppercase tracking-[0.28em]">
                        {strings.coverImageTitle}
                      </div>
                      <div className="mt-1 text-muted-foreground text-sm">
                        {coverAsset
                          ? strings.coverImageDescription
                          : strings.uploadCoverAction}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="space-y-2">
                      <Label>{strings.titleLabel}</Label>
                      <Input
                        value={coverAltText}
                        onChange={(event) =>
                          setCoverAltText(event.target.value)
                        }
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <ActionButton
                        size="sm"
                        tooltip={strings.coverImageDescription}
                        onClick={() => coverInputRef.current?.click()}
                      >
                        <ImagePlus className="mr-2 h-4 w-4" />
                        {coverAsset
                          ? strings.replaceCoverAction
                          : strings.uploadCoverAction}
                      </ActionButton>
                      <ActionButton
                        size="sm"
                        tooltip={strings.saveCoverAction}
                        variant="outline"
                        disabled={
                          !coverAsset ||
                          !coverDirty ||
                          saveCoverMutation.isPending
                        }
                        onClick={() => saveCoverMutation.mutate()}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        {strings.saveCoverAction}
                      </ActionButton>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/95 shadow-none">
            <CardHeader>
              <CardTitle>{strings.assetGalleryTitle}</CardTitle>
              <CardDescription>{strings.coverImageDescription}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {imageAssets.length === 0 ? (
                <div className="rounded-[1.2rem] border border-border/70 border-dashed p-4 text-muted-foreground text-sm md:col-span-3">
                  {strings.noCoverDescription}
                </div>
              ) : (
                imageAssets.map((asset, index) => (
                  <div
                    key={asset.id}
                    className="overflow-hidden rounded-[1.2rem] border border-border/70 bg-background/75"
                  >
                    <div className="relative h-36 overflow-hidden border-border/70 border-b bg-background/80">
                      <ResilientMediaImage
                        alt={asset.alt_text ?? activeEntry.title}
                        assetUrl={asset.asset_url}
                        className="object-cover"
                        fill
                        previewUrl={asset.preview_url}
                        sizes="(max-width: 1024px) 100vw, 18vw"
                      />
                    </div>
                    <div className="space-y-3 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline">
                          {index === 0
                            ? strings.coverBadge
                            : strings.assetsLabel}
                        </Badge>
                        {index !== 0 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={setAsCoverMutation.isPending}
                            onClick={() => setAsCoverMutation.mutate(asset.id)}
                          >
                            {strings.setAsCoverAction}
                          </Button>
                        ) : null}
                      </div>
                      <div className="truncate text-sm">
                        {asset.alt_text ?? activeEntry.title}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5 xl:sticky xl:top-28 xl:self-start">
          <Card className="border-border/70 bg-card/95 shadow-none">
            <CardHeader>
              <CardTitle>{strings.detailsTitle}</CardTitle>
              <CardDescription>{strings.editEntryDescription}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{strings.titleLabel}</Label>
                <Input
                  className="h-11"
                  value={entryForm.title}
                  onChange={(event) =>
                    setEntryForm((current) =>
                      current
                        ? { ...current, title: event.target.value }
                        : current
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{strings.subtitleLabel}</Label>
                <Input
                  className="h-11"
                  value={entryForm.subtitle}
                  onChange={(event) =>
                    setEntryForm((current) =>
                      current
                        ? { ...current, subtitle: event.target.value }
                        : current
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{strings.summaryLabel}</Label>
                <Textarea
                  rows={6}
                  className="min-h-[180px] resize-y"
                  value={entryForm.summary}
                  onChange={(event) =>
                    setEntryForm((current) =>
                      current
                        ? { ...current, summary: event.target.value }
                        : current
                    )
                  }
                />
              </div>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label>{strings.slugLabel}</Label>
                  <Input
                    value={entryForm.slug}
                    onChange={(event) =>
                      setEntryForm((current) =>
                        current
                          ? { ...current, slug: event.target.value }
                          : current
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>{strings.statusLabel}</Label>
                  <Select
                    value={entryForm.status}
                    onValueChange={(value) =>
                      setEntryForm((current) =>
                        current
                          ? {
                              ...current,
                              status: value as ExternalProjectEntry['status'],
                            }
                          : current
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">
                        {strings.statusDraft}
                      </SelectItem>
                      <SelectItem value="scheduled">
                        {strings.statusScheduled}
                      </SelectItem>
                      <SelectItem value="published">
                        {strings.statusPublished}
                      </SelectItem>
                      <SelectItem value="archived">
                        {strings.statusArchived}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{strings.scheduledForLabel}</Label>
                  <Input
                    type="datetime-local"
                    value={entryForm.scheduledFor}
                    onChange={(event) =>
                      setEntryForm((current) =>
                        current
                          ? { ...current, scheduledFor: event.target.value }
                          : current
                      )
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/95 shadow-none">
            <CardHeader>
              <CardTitle>{strings.workspaceStatusTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3">
                <div className="rounded-[1.1rem] border border-border/70 bg-background/75 p-4">
                  <div className="text-muted-foreground text-xs">
                    {strings.collectionsLabel}
                  </div>
                  <div className="mt-2 font-medium text-lg">
                    {activeCollection?.title ?? strings.collectionFallbackLabel}
                  </div>
                  <div className="mt-2 text-muted-foreground text-sm">
                    {activeCollection?.description || activeCollection?.slug}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-[1.1rem] border border-border/70 bg-background/75 p-4">
                    <div className="text-muted-foreground text-xs">
                      {strings.statusLabel}
                    </div>
                    <div className="mt-2 font-medium">
                      {formatStatus(activeEntry.status, strings)}
                    </div>
                  </div>
                  <div className="rounded-[1.1rem] border border-border/70 bg-background/75 p-4">
                    <div className="text-muted-foreground text-xs">
                      {strings.scheduledForLabel}
                    </div>
                    <div className="mt-2 font-medium">
                      {formatDateLabel(activeEntry.scheduled_for, strings)}
                    </div>
                  </div>
                </div>
                <div className="rounded-[1.1rem] border border-border/70 bg-background/75 p-4">
                  <div className="text-muted-foreground text-xs">
                    {strings.workspaceBindingLabel}
                  </div>
                  <div className="mt-2 font-medium">
                    {binding.canonical_project?.display_name ??
                      strings.unboundLabel}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/95 shadow-none">
            <CardHeader>
              <CardTitle>{strings.metadataLabel}</CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion
                type="multiple"
                defaultValue={['metadata']}
                className="space-y-3"
              >
                <AccordionItem
                  value="metadata"
                  className="rounded-[1.1rem] border border-border/70 px-4"
                >
                  <AccordionTrigger>{strings.metadataLabel}</AccordionTrigger>
                  <AccordionContent>
                    <pre className="overflow-x-auto rounded-xl border border-border/70 bg-background/80 p-3 text-xs leading-6">
                      {JSON.stringify(activeEntry.metadata ?? {}, null, 2)}
                    </pre>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem
                  value="profile-data"
                  className="rounded-[1.1rem] border border-border/70 px-4"
                >
                  <AccordionTrigger>
                    {strings.profileDataLabel}
                  </AccordionTrigger>
                  <AccordionContent>
                    <pre className="overflow-x-auto rounded-xl border border-border/70 bg-background/80 p-3 text-xs leading-6">
                      {JSON.stringify(activeEntry.profile_data ?? {}, null, 2)}
                    </pre>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem
                  value="binding"
                  className="rounded-[1.1rem] border border-border/70 px-4"
                >
                  <AccordionTrigger>
                    {strings.workspaceBindingLabel}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 text-sm">
                      <div className="rounded-xl border border-border/70 bg-background/75 px-3 py-2">
                        {binding.canonical_id ?? strings.noCanonicalIdLabel}
                      </div>
                      <div className="rounded-xl border border-border/70 bg-background/75 px-3 py-2">
                        {binding.adapter ?? strings.noAdapterLabel}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </div>
      </div>

      <EntryDetailPreviewSheet
        coverAsset={coverAsset}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        previewEntry={previewEntry}
        previewPending={previewQuery.isPending}
        strings={strings}
      />
    </div>
  );

  if (variant === 'dialog') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="inset-0 top-0 left-0 flex h-screen max-h-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-none">
          <DialogHeader className="sr-only">
            <DialogTitle>{activeEntry.title}</DialogTitle>
            <DialogDescription>
              {strings.editEntryDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 lg:px-8">
            {content}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return content;
}
