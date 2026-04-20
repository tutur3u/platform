'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/react';
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Eye,
  ImagePlus,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
} from '@tuturuuu/icons';
import {
  createWorkspaceExternalProjectAsset,
  createWorkspaceExternalProjectBlock,
  createWorkspaceExternalProjectEntry,
  deleteWorkspaceExternalProjectAsset,
  deleteWorkspaceExternalProjectEntry,
  duplicateWorkspaceExternalProjectEntry,
  publishWorkspaceExternalProjectEntry,
  updateWorkspaceExternalProjectAsset,
  updateWorkspaceExternalProjectBlock,
  updateWorkspaceExternalProjectEntry,
  uploadWorkspaceExternalProjectAssetFile,
} from '@tuturuuu/internal-api';
import type {
  ExternalProjectEntry,
  ExternalProjectStudioAsset,
  ExternalProjectStudioData,
  Json,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
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
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { cn } from '@tuturuuu/utils/format';
import { usePathname, useRouter } from 'next/navigation';
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useExternalProjectLivePreview } from '../../../external-projects/use-external-project-live-preview';
import { optimizeEpmMediaUpload } from '../../epm-media-upload';
import type { EpmStrings } from '../../epm-strings';
import { ResilientMediaImage } from '../../resilient-media-image';
import { getEpmStudioQueryKey, useEpmStudio } from '../../use-epm-studio';
import { EntryDetailLoadingState } from './entry-detail-loading-state';
import { EntryDetailMarkdownEditor } from './entry-detail-markdown-editor';
import { EntryDetailPreviewSheet } from './entry-detail-preview-sheet';
import {
  ActionButton,
  buildEntryFormState,
  formatDateLabel,
  formatStatus,
  fromDateTimeLocalValue,
  getEntryDescriptionEditorContent,
  getMarkdownBlockContent,
  parseEntryDescriptionContent,
  serializeEntryDescriptionContent,
  sortImageAssets,
  statusTone,
  toStudioAsset,
} from './entry-detail-shared';

function getAssetCaption(asset: ExternalProjectStudioAsset | null | undefined) {
  const metadata = asset?.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return '';
  }

  const caption = (metadata as Record<string, unknown>).caption;
  return typeof caption === 'string' ? caption : '';
}

function mergeAssetCaptionMetadata(
  asset: ExternalProjectStudioAsset,
  caption: string
): Json {
  const nextMetadata =
    asset.metadata &&
    typeof asset.metadata === 'object' &&
    !Array.isArray(asset.metadata)
      ? { ...(asset.metadata as Record<string, unknown>) }
      : {};

  if (caption.trim()) {
    nextMetadata.caption = caption.trim();
  } else {
    delete nextMetadata.caption;
  }

  return nextMetadata as Json;
}

function asProfileDataRecord(
  value: ExternalProjectEntry['profile_data'] | null | undefined
) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];
}

function dedupeStrings(values: string[]) {
  return [...new Set(values)];
}

function areStringArraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function getFeaturedProfileSlugs(
  profileData: Record<string, unknown>,
  keys: string[]
) {
  return dedupeStrings(keys.flatMap((key) => asStringArray(profileData[key])));
}

function mergeFeaturedProfileData({
  featuredKey,
  nextSlugs,
  profileData,
  resetKeys,
}: {
  featuredKey: string;
  nextSlugs: string[];
  profileData: Record<string, unknown>;
  resetKeys: string[];
}) {
  const nextProfileData = { ...profileData };

  for (const key of resetKeys) {
    delete nextProfileData[key];
  }

  if (nextSlugs.length > 0) {
    nextProfileData[featuredKey] = nextSlugs;
  }

  return nextProfileData;
}

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
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const studioQuery = useEpmStudio({
    initialData: initialStudio ? { ...initialStudio, binding } : undefined,
    workspaceId,
  });
  const studio = studioQuery.data;
  const entries = studio?.entries ?? initialStudio?.entries ?? [];
  const assets = studio?.assets ?? initialStudio?.assets ?? [];
  const blocks = studio?.blocks ?? initialStudio?.blocks ?? [];
  const collections = studio?.collections ?? initialStudio?.collections ?? [];
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRefreshToken, setPreviewRefreshToken] = useState(0);
  const [deleteEntryDialogOpen, setDeleteEntryDialogOpen] = useState(false);
  const [deleteMediaDialogOpen, setDeleteMediaDialogOpen] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [assetCaptions, setAssetCaptions] = useState<Record<string, string>>(
    {}
  );
  const activeEntry = entries.find((entry) => entry.id === entryId) ?? null;
  const activeCollection =
    collections.find(
      (collection) => collection.id === activeEntry?.collection_id
    ) ?? null;
  const imageAssets = useMemo(
    () => sortImageAssets(assets, entryId),
    [assets, entryId]
  );
  const markdownBlock = useMemo(
    () =>
      blocks
        .filter(
          (block) =>
            block.entry_id === entryId && block.block_type === 'markdown'
        )
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0] ?? null,
    [blocks, entryId]
  );
  const coverAsset = imageAssets[0] ?? null;
  const artworkCollection =
    collections.find((collection) => collection.slug === 'artworks') ?? null;
  const loreCollection =
    collections.find((collection) =>
      /lore|writing/.test(
        [collection.slug, collection.collection_type, collection.title]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
      )
    ) ?? null;
  const artworkOptions = useMemo(
    () =>
      artworkCollection
        ? entries.filter(
            (entry) => entry.collection_id === artworkCollection.id
          )
        : [],
    [artworkCollection, entries]
  );
  const loreOptions = useMemo(
    () =>
      loreCollection
        ? entries.filter((entry) => entry.collection_id === loreCollection.id)
        : [],
    [entries, loreCollection]
  );
  const singletonSectionCollection =
    collections.find((collection) =>
      /singleton|section/.test(
        [collection.slug, collection.collection_type, collection.title]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
      )
    ) ?? null;
  const [entryForm, setEntryForm] = useState(() =>
    activeEntry ? buildEntryFormState(activeEntry) : null
  );
  const [descriptionContent, setDescriptionContent] =
    useState<JSONContent | null>(() =>
      getEntryDescriptionEditorContent(activeEntry?.summary)
    );
  const [coverAltText, setCoverAltText] = useState(
    coverAsset?.alt_text ?? activeEntry?.title ?? ''
  );
  const [bodyMarkdown, setBodyMarkdown] = useState(() =>
    getMarkdownBlockContent(markdownBlock)
  );
  const [pairedArtworkSlug, setPairedArtworkSlug] = useState(() => {
    const profileData = asProfileDataRecord(activeEntry?.profile_data);

    return typeof profileData.artworkSlug === 'string'
      ? profileData.artworkSlug
      : '__none__';
  });
  const isSingletonSectionEntry = /singleton|section/.test(
    [activeCollection?.slug, activeCollection?.collection_type]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
  );
  const featuredEntryConfig = useMemo(() => {
    if (!isSingletonSectionEntry || !activeEntry) {
      return null;
    }

    if (activeEntry.slug === 'gallery' && artworkOptions.length > 0) {
      return {
        cleanupKeys: [
          'featuredArtworkSlugs',
          'carouselArtworkSlugs',
          'featuredSlugs',
        ],
        description: strings.featuredGalleryEntriesDescription,
        key: 'featuredArtworkSlugs',
        options: artworkOptions,
        title: strings.featuredGalleryEntriesLabel,
      };
    }

    if (activeEntry.slug === 'writing' && loreOptions.length > 0) {
      return {
        cleanupKeys: [
          'featuredEntrySlugs',
          'featuredLoreSlugs',
          'carouselEntrySlugs',
          'carouselLoreSlugs',
          'featuredSlugs',
        ],
        description: strings.featuredWritingEntriesDescription,
        key: 'featuredEntrySlugs',
        options: loreOptions,
        title: strings.featuredWritingEntriesLabel,
      };
    }

    return null;
  }, [
    activeEntry,
    artworkOptions,
    isSingletonSectionEntry,
    loreOptions,
    strings.featuredGalleryEntriesDescription,
    strings.featuredGalleryEntriesLabel,
    strings.featuredWritingEntriesDescription,
    strings.featuredWritingEntriesLabel,
  ]);
  const featuredEntryOptionsBySlug = useMemo(
    () =>
      new Map(
        (featuredEntryConfig?.options ?? []).map((entry) => [entry.slug, entry])
      ),
    [featuredEntryConfig]
  );
  const initialFeaturedEntrySlugs = useMemo(() => {
    if (!featuredEntryConfig) {
      return [];
    }

    const optionSlugs = new Set(
      featuredEntryConfig.options.map((entry) => entry.slug)
    );

    return getFeaturedProfileSlugs(
      asProfileDataRecord(activeEntry?.profile_data),
      featuredEntryConfig.cleanupKeys
    ).filter((slug) => optionSlugs.has(slug));
  }, [activeEntry?.profile_data, featuredEntryConfig]);
  const [featuredEntrySlugs, setFeaturedEntrySlugs] = useState<string[]>([]);
  const featuredPlacementConfig = useMemo(() => {
    if (!activeEntry || !activeCollection || !singletonSectionCollection) {
      return null;
    }

    const sectionEntryBySlug = new Map(
      entries
        .filter(
          (entry) => entry.collection_id === singletonSectionCollection.id
        )
        .map((entry) => [entry.slug, entry] as const)
    );

    if (activeCollection.id === artworkCollection?.id) {
      return {
        cleanupKeys: [
          'featuredArtworkSlugs',
          'carouselArtworkSlugs',
          'featuredSlugs',
        ],
        description: strings.featuredPlacementArtworkDescription,
        emptyState: strings.featuredPlacementSectionMissing,
        featuredKey: 'featuredArtworkSlugs',
        featuredLabel: strings.featuredPlacementGalleryLabel,
        sectionSlug: 'gallery',
        sectionTitle: 'Gallery',
        sectionEntry: sectionEntryBySlug.get('gallery') ?? null,
      };
    }

    if (activeCollection.id === loreCollection?.id) {
      return {
        cleanupKeys: [
          'featuredEntrySlugs',
          'featuredLoreSlugs',
          'carouselEntrySlugs',
          'carouselLoreSlugs',
          'featuredSlugs',
        ],
        description: strings.featuredPlacementWritingDescription,
        emptyState: strings.featuredPlacementSectionMissing,
        featuredKey: 'featuredEntrySlugs',
        featuredLabel: strings.featuredPlacementWritingLabel,
        sectionSlug: 'writing',
        sectionTitle: 'Writing',
        sectionEntry: sectionEntryBySlug.get('writing') ?? null,
      };
    }

    return null;
  }, [
    activeCollection,
    activeEntry,
    artworkCollection?.id,
    entries,
    loreCollection?.id,
    singletonSectionCollection,
    strings.featuredPlacementArtworkDescription,
    strings.featuredPlacementGalleryLabel,
    strings.featuredPlacementSectionMissing,
    strings.featuredPlacementWritingDescription,
    strings.featuredPlacementWritingLabel,
  ]);
  const featuredPlacementSlugs = useMemo(() => {
    if (!featuredPlacementConfig?.sectionEntry) {
      return [];
    }

    const profileData = asProfileDataRecord(
      featuredPlacementConfig.sectionEntry.profile_data
    );

    return getFeaturedProfileSlugs(
      profileData,
      featuredPlacementConfig.cleanupKeys
    );
  }, [featuredPlacementConfig]);
  const featuredPlacementIndex = activeEntry
    ? featuredPlacementSlugs.indexOf(activeEntry.slug)
    : -1;
  const isFeaturedPlacementActive = featuredPlacementIndex >= 0;

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
  const normalizedDescription =
    serializeEntryDescriptionContent(descriptionContent);
  const supportsMarkdownBody =
    !!markdownBlock ||
    /lore|writing|singleton|section/.test(
      [activeCollection?.slug, activeCollection?.collection_type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
    );
  const supportsPairedVisual =
    Boolean(supportsMarkdownBody) && artworkOptions.length > 0;

  const entryDirty =
    !!activeEntry &&
    !!entryForm &&
    (entryForm.title !== activeEntry.title ||
      entryForm.slug !== activeEntry.slug ||
      entryForm.subtitle !== (activeEntry.subtitle ?? '') ||
      normalizedDescription !==
        serializeEntryDescriptionContent(
          parseEntryDescriptionContent(activeEntry.summary)
        ) ||
      (supportsPairedVisual
        ? pairedArtworkSlug !==
          ((asProfileDataRecord(activeEntry.profile_data).artworkSlug as
            | string
            | undefined) ?? '__none__')
        : false) ||
      (featuredEntryConfig
        ? !areStringArraysEqual(featuredEntrySlugs, initialFeaturedEntrySlugs)
        : false) ||
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
  const bodyMarkdownDirty =
    bodyMarkdown.trim() !== getMarkdownBlockContent(markdownBlock).trim();

  const updateStudioCache = (
    updater: (current: NonNullable<typeof studio>) => NonNullable<typeof studio>
  ) => {
    queryClient.setQueryData(
      getEpmStudioQueryKey(workspaceId),
      (current: typeof studio | undefined) =>
        current ? updater(current) : current
    );
  };

  const refreshStudioFromBackend = async () => {
    await queryClient.invalidateQueries({
      queryKey: getEpmStudioQueryKey(workspaceId),
    });
  };

  useEffect(() => {
    if (!activeEntry) {
      setEntryForm(null);
      return;
    }

    setEntryForm(buildEntryFormState(activeEntry));
  }, [activeEntry]);

  useEffect(() => {
    setDescriptionContent(
      getEntryDescriptionEditorContent(activeEntry?.summary)
    );
  }, [activeEntry?.summary]);

  useEffect(() => {
    if (!activeEntry) {
      setCoverAltText('');
      return;
    }

    setCoverAltText(coverAsset?.alt_text ?? activeEntry.title);
  }, [activeEntry, coverAsset?.alt_text]);

  useEffect(() => {
    setBodyMarkdown(getMarkdownBlockContent(markdownBlock));
  }, [markdownBlock]);

  useEffect(() => {
    const profileData = asProfileDataRecord(activeEntry?.profile_data);

    setPairedArtworkSlug(
      typeof profileData.artworkSlug === 'string'
        ? profileData.artworkSlug
        : '__none__'
    );
  }, [activeEntry?.profile_data]);

  useEffect(() => {
    setFeaturedEntrySlugs(initialFeaturedEntrySlugs);
  }, [initialFeaturedEntrySlugs]);

  useEffect(() => {
    setSelectedAssetIds((current) =>
      current.filter((assetId) =>
        imageAssets.some((asset) => asset.id === assetId)
      )
    );
  }, [imageAssets]);

  useEffect(() => {
    setAssetCaptions((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([assetId]) =>
          imageAssets.some((asset) => asset.id === assetId)
        )
      );
      const currentKeys = Object.keys(current);
      const nextKeys = Object.keys(next);
      if (
        currentKeys.length === nextKeys.length &&
        nextKeys.every((key) => current[key] === next[key])
      ) {
        return current;
      }

      return next;
    });
  }, [imageAssets]);

  const mergeEntry = (nextEntry: ExternalProjectEntry) => {
    updateStudioCache((current) => ({
      ...current,
      entries: current.entries.some((entry) => entry.id === nextEntry.id)
        ? current.entries.map((entry) =>
            entry.id === nextEntry.id ? nextEntry : entry
          )
        : [nextEntry, ...current.entries],
    }));
    if (nextEntry.id === activeEntry?.id) {
      setEntryForm(buildEntryFormState(nextEntry));
    }
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

  const mergeBlock = (nextBlock: (typeof blocks)[number]) => {
    updateStudioCache((current) => {
      const blockIndex = current.blocks.findIndex(
        (block) => block.id === nextBlock.id
      );
      const nextBlocks =
        blockIndex === -1
          ? [...current.blocks, nextBlock]
          : current.blocks.map((block) =>
              block.id === nextBlock.id ? nextBlock : block
            );

      return {
        ...current,
        blocks: nextBlocks,
      };
    });
  };

  const saveEntryMutation = useMutation({
    mutationFn: async () => {
      if (!activeEntry || !entryForm) {
        throw new Error(strings.emptyEntries);
      }

      let currentProfileData = {
        ...asProfileDataRecord(activeEntry.profile_data),
      };

      if (supportsPairedVisual && pairedArtworkSlug !== '__none__') {
        currentProfileData.artworkSlug = pairedArtworkSlug;
      } else {
        delete currentProfileData.artworkSlug;
      }

      if (featuredEntryConfig) {
        const validSlugs = new Set(
          featuredEntryConfig.options.map((entry) => entry.slug)
        );
        const nextFeaturedSlugs = dedupeStrings(
          featuredEntrySlugs.filter((slug) => validSlugs.has(slug))
        );
        currentProfileData = mergeFeaturedProfileData({
          featuredKey: featuredEntryConfig.key,
          nextSlugs: nextFeaturedSlugs,
          profileData: currentProfileData,
          resetKeys: featuredEntryConfig.cleanupKeys,
        });
      }

      return updateWorkspaceExternalProjectEntry(workspaceId, activeEntry.id, {
        profile_data: currentProfileData as Json,
        scheduled_for: fromDateTimeLocalValue(entryForm.scheduledFor),
        slug: entryForm.slug.trim(),
        status: entryForm.status,
        subtitle: entryForm.subtitle.trim() || null,
        summary: normalizedDescription,
        title: entryForm.title.trim(),
      });
    },
    onSuccess: (entry) => {
      mergeEntry(entry);
      toast.success(strings.saveAction);
    },
  });

  const saveMarkdownMutation = useMutation({
    mutationFn: async () => {
      if (!activeEntry) {
        throw new Error(strings.emptyEntries);
      }

      const normalizedMarkdown = bodyMarkdown.trim();

      if (markdownBlock) {
        return updateWorkspaceExternalProjectBlock(
          workspaceId,
          markdownBlock.id,
          {
            content: { markdown: normalizedMarkdown },
            title: markdownBlock.title,
          }
        );
      }

      return createWorkspaceExternalProjectBlock(workspaceId, {
        block_type: 'markdown',
        content: { markdown: normalizedMarkdown },
        entry_id: activeEntry.id,
        sort_order: 0,
        title: strings.bodyMarkdownLabel,
      });
    },
    onSuccess: (block) => {
      mergeBlock(block);
      setBodyMarkdown(getMarkdownBlockContent(block));
      toast.success(strings.saveAction);
    },
  });

  const updateFeaturedPlacementMutation = useMutation({
    mutationFn: async (updater: (current: string[]) => string[]) => {
      const sectionEntry = featuredPlacementConfig?.sectionEntry;
      if (!sectionEntry || !activeEntry || !featuredPlacementConfig) {
        throw new Error(strings.featuredPlacementSectionMissing);
      }

      const validSlugs = new Set(
        (featuredPlacementConfig.featuredKey === 'featuredArtworkSlugs'
          ? artworkOptions
          : loreOptions
        ).map((entry) => entry.slug)
      );
      const nextSlugs = dedupeStrings(
        updater(featuredPlacementSlugs).filter((slug) => validSlugs.has(slug))
      );
      const nextProfileData = mergeFeaturedProfileData({
        featuredKey: featuredPlacementConfig.featuredKey,
        nextSlugs,
        profileData: asProfileDataRecord(sectionEntry.profile_data),
        resetKeys: featuredPlacementConfig.cleanupKeys,
      });

      return updateWorkspaceExternalProjectEntry(workspaceId, sectionEntry.id, {
        profile_data: nextProfileData as Json,
      });
    },
    onSuccess: (entry) => {
      mergeEntry(entry);
      toast.success(strings.saveAction);
    },
  });

  const createFeaturedPlacementConfigMutation = useMutation({
    mutationFn: async () => {
      if (
        !activeEntry ||
        !featuredPlacementConfig ||
        !singletonSectionCollection
      ) {
        throw new Error(strings.featuredPlacementSectionMissing);
      }

      return createWorkspaceExternalProjectEntry(workspaceId, {
        collection_id: singletonSectionCollection.id,
        metadata: {},
        profile_data: {
          [featuredPlacementConfig.featuredKey]: [activeEntry.slug],
        } as Json,
        slug: featuredPlacementConfig.sectionSlug,
        status: 'draft',
        subtitle: null,
        summary: null,
        title: featuredPlacementConfig.sectionTitle,
      });
    },
    onSuccess: (entry) => {
      mergeEntry(entry);
      toast.success(strings.featuredPlacementCreateSuccessToast);
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
      setDeleteEntryDialogOpen(false);
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

      const optimizedFile = await optimizeEpmMediaUpload(file);

      const upload = await uploadWorkspaceExternalProjectAssetFile(
        workspaceId,
        optimizedFile,
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
    onSuccess: async (asset) => {
      mergeAsset(toStudioAsset(asset, coverAsset));
      setPreviewRefreshToken((value) => value + 1);
      await refreshStudioFromBackend();
      toast.success(strings.coverUploadSuccessToast);
    },
  });

  const uploadMediaMutation = useMutation({
    mutationFn: async (files: File[]) => {
      if (!activeCollection) {
        throw new Error(strings.emptyCollection);
      }

      return Promise.all(
        files.map(async (file, index) => {
          const optimizedFile = await optimizeEpmMediaUpload(file);
          const upload = await uploadWorkspaceExternalProjectAssetFile(
            workspaceId,
            optimizedFile,
            {
              collectionType: activeCollection.collection_type,
              entrySlug: entryForm?.slug.trim() || activeEntry?.slug || 'entry',
            }
          );

          const nextSortOrder =
            Math.max(-1, ...imageAssets.map((asset) => asset.sort_order ?? 0)) +
            index +
            1;

          return createWorkspaceExternalProjectAsset(workspaceId, {
            alt_text: file.name,
            asset_type: 'image',
            entry_id: activeEntry?.id ?? entryId,
            metadata: {},
            sort_order: nextSortOrder,
            source_url: null,
            storage_path: upload.path,
          });
        })
      );
    },
    onSuccess: async (createdAssets) => {
      updateStudioCache((current) => ({
        ...current,
        assets: [
          ...current.assets,
          ...createdAssets.map((asset) => toStudioAsset(asset, null)),
        ],
      }));
      await refreshStudioFromBackend();
      toast.success(strings.coverUploadSuccessToast);
    },
  });

  const deleteAssetsMutation = useMutation({
    mutationFn: async (assetIds: string[]) =>
      Promise.all(
        assetIds.map((assetId) =>
          deleteWorkspaceExternalProjectAsset(workspaceId, assetId)
        )
      ),
    onSuccess: async (_, assetIds) => {
      updateStudioCache((current) => ({
        ...current,
        assets: current.assets.filter((asset) => !assetIds.includes(asset.id)),
      }));
      setSelectedAssetIds([]);
      setDeleteMediaDialogOpen(false);
      await refreshStudioFromBackend();
      toast.success(strings.deleteAssetAction);
    },
  });

  const saveAssetCaptionMutation = useMutation({
    mutationFn: async (assetId: string) => {
      const asset = imageAssets.find((item) => item.id === assetId);
      if (!asset) {
        throw new Error(strings.emptyEntries);
      }

      return updateWorkspaceExternalProjectAsset(workspaceId, assetId, {
        metadata: mergeAssetCaptionMetadata(
          asset,
          assetCaptions[assetId] ?? ''
        ),
      });
    },
    onSuccess: async (asset) => {
      mergeAsset(
        toStudioAsset(
          asset,
          imageAssets.find((item) => item.id === asset.id) ?? null
        )
      );
      setAssetCaptions((current) => {
        if (!(asset.id in current)) {
          return current;
        }

        const next = { ...current };
        delete next[asset.id];
        return next;
      });
      await refreshStudioFromBackend();
      toast.success(strings.saveMediaDetailsAction);
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
    onSuccess: async (updatedAssets) => {
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
      await refreshStudioFromBackend();
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

  const handleMediaInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (files.length === 0) {
      return;
    }

    uploadMediaMutation.mutate(files);
  };

  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssetIds((current) =>
      current.includes(assetId)
        ? current.filter((id) => id !== assetId)
        : [...current, assetId]
    );
  };

  const toggleFeaturedEntrySelection = (slug: string) => {
    setFeaturedEntrySlugs((current) =>
      current.includes(slug)
        ? current.filter((value) => value !== slug)
        : [...current, slug]
    );
  };

  const moveFeaturedEntry = (slug: string, direction: -1 | 1) => {
    setFeaturedEntrySlugs((current) => {
      const index = current.indexOf(slug);
      const nextIndex = index + direction;

      if (index === -1 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
      return next;
    });
  };

  const toggleFeaturedPlacement = () => {
    if (!activeEntry) {
      return;
    }

    updateFeaturedPlacementMutation.mutate((current) =>
      current.includes(activeEntry.slug)
        ? current.filter((slug) => slug !== activeEntry.slug)
        : [...current, activeEntry.slug]
    );
  };

  const moveFeaturedPlacement = (direction: -1 | 1) => {
    if (!activeEntry) {
      return;
    }

    updateFeaturedPlacementMutation.mutate((current) => {
      const index = current.indexOf(activeEntry.slug);
      const nextIndex = index + direction;

      if (index === -1 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
      return next;
    });
  };

  const deleteSingleAsset = (assetId: string) => {
    setSelectedAssetIds([assetId]);
    setDeleteMediaDialogOpen(true);
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

  const selectedAssetCount = selectedAssetIds.length;
  const mediaProcessing =
    uploadCoverMutation.isPending ||
    uploadMediaMutation.isPending ||
    saveCoverMutation.isPending ||
    saveAssetCaptionMutation.isPending ||
    deleteAssetsMutation.isPending ||
    setAsCoverMutation.isPending;
  const saveProcessing =
    saveEntryMutation.isPending ||
    saveMarkdownMutation.isPending ||
    saveCoverMutation.isPending;
  const featuredPlacementProcessing =
    updateFeaturedPlacementMutation.isPending ||
    createFeaturedPlacementConfigMutation.isPending;

  const content = (
    <div className="mx-auto min-h-[calc(100svh-5rem)] max-w-[1580px] space-y-6 pb-10">
      <input
        ref={coverInputRef}
        accept="image/*"
        className="hidden"
        type="file"
        onChange={handleCoverInputChange}
      />
      <input
        ref={mediaInputRef}
        multiple
        accept="image/*"
        className="hidden"
        type="file"
        onChange={handleMediaInputChange}
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
              {featuredPlacementConfig?.sectionEntry ? (
                <Badge
                  variant={isFeaturedPlacementActive ? 'default' : 'outline'}
                >
                  {isFeaturedPlacementActive
                    ? `${featuredPlacementConfig.featuredLabel} · ${featuredPlacementIndex + 1}`
                    : featuredPlacementConfig.featuredLabel}
                </Badge>
              ) : null}
              {entryDirty || coverDirty ? (
                <Badge variant="outline">{strings.saveAction}</Badge>
              ) : null}
              {mediaProcessing ? (
                <Badge
                  variant="outline"
                  className="border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue"
                >
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  {strings.mediaProcessingLabel}
                </Badge>
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
            {featuredPlacementConfig?.sectionEntry ? (
              <Button
                size="sm"
                variant={isFeaturedPlacementActive ? 'default' : 'outline'}
                disabled={featuredPlacementProcessing}
                onClick={toggleFeaturedPlacement}
              >
                {featuredPlacementProcessing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                {isFeaturedPlacementActive
                  ? strings.featuredPlacementRemoveAction
                  : strings.featuredPlacementAddAction}
              </Button>
            ) : null}
            <Button
              size="sm"
              disabled={
                (!entryDirty && !coverDirty && !bodyMarkdownDirty) ||
                saveProcessing
              }
              onClick={() => {
                if (entryDirty) {
                  saveEntryMutation.mutate();
                }

                if (bodyMarkdownDirty) {
                  saveMarkdownMutation.mutate();
                }

                if (coverDirty && coverAsset) {
                  saveCoverMutation.mutate();
                }
              }}
            >
              {saveProcessing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Pencil className="mr-2 h-4 w-4" />
              )}
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
              onClick={() => setDeleteEntryDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
            </ActionButton>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          <Card className="overflow-hidden border-border/70 bg-card/95 shadow-none">
            <CardContent className="space-y-4 p-5 lg:p-6">
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
                        disabled={mediaProcessing}
                        onClick={() => coverInputRef.current?.click()}
                      >
                        {uploadCoverMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <ImagePlus className="mr-2 h-4 w-4" />
                        )}
                        {uploadCoverMutation.isPending
                          ? strings.mediaProcessingLabel
                          : strings.uploadCoverAction}
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
              {coverAsset ? (
                <div className="rounded-[1.35rem] border border-border/70 bg-background/80 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] text-muted-foreground uppercase tracking-[0.28em]">
                        {strings.coverImageTitle}
                      </div>
                      <div className="mt-1 text-muted-foreground text-sm">
                        {strings.coverImageDescription}
                      </div>
                    </div>
                    <ActionButton
                      size="sm"
                      tooltip={strings.coverImageDescription}
                      disabled={mediaProcessing}
                      onClick={() => coverInputRef.current?.click()}
                    >
                      {uploadCoverMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ImagePlus className="mr-2 h-4 w-4" />
                      )}
                      {uploadCoverMutation.isPending
                        ? strings.mediaProcessingLabel
                        : strings.replaceCoverAction}
                    </ActionButton>
                  </div>
                  <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="entry-cover-alt">
                        {strings.titleLabel}
                      </Label>
                      <Input
                        id="entry-cover-alt"
                        value={coverAltText}
                        onChange={(event) =>
                          setCoverAltText(event.target.value)
                        }
                      />
                    </div>
                    <ActionButton
                      size="sm"
                      tooltip={strings.saveCoverAction}
                      variant="outline"
                      disabled={
                        !coverDirty ||
                        saveCoverMutation.isPending ||
                        mediaProcessing
                      }
                      onClick={() => saveCoverMutation.mutate()}
                    >
                      {saveCoverMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Pencil className="mr-2 h-4 w-4" />
                      )}
                      {saveCoverMutation.isPending
                        ? strings.mediaProcessingLabel
                        : strings.saveCoverAction}
                    </ActionButton>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/95 shadow-none">
            <CardHeader>
              <CardTitle>{strings.summaryLabel}</CardTitle>
              <CardDescription>
                {strings.descriptionEditorDescription}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="entry-subtitle">{strings.subtitleLabel}</Label>
                <Input
                  id="entry-subtitle"
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
              <RichTextEditor
                content={descriptionContent}
                onChange={(content) => setDescriptionContent(content)}
                saveButtonLabel={strings.saveAction}
                savedButtonLabel={strings.saveAction}
                writePlaceholder={strings.previewEmptyDescription}
                className="min-h-[280px] bg-background/70 px-4 pb-4 sm:px-5 sm:pb-5"
              />
            </CardContent>
          </Card>

          {supportsMarkdownBody ? (
            <Card className="border-border/70 bg-card/95 shadow-none">
              <CardHeader>
                <CardTitle>{strings.bodyMarkdownLabel}</CardTitle>
                <CardDescription>
                  {strings.bodyMarkdownDescription}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EntryDetailMarkdownEditor
                  id="entry-body-markdown"
                  label={strings.bodyMarkdownLabel}
                  placeholder={strings.previewEmptyDescription}
                  previewLabel={strings.markdownPreviewLabel}
                  previewPlaceholder={strings.previewEmptyDescription}
                  rows={14}
                  value={bodyMarkdown}
                  writeLabel={strings.markdownWriteLabel}
                  onChange={setBodyMarkdown}
                />
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-border/70 bg-card/95 shadow-none">
            <CardHeader className="gap-4">
              <div>
                <CardTitle>{strings.assetGalleryTitle}</CardTitle>
                <CardDescription>
                  {strings.coverImageDescription}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={mediaProcessing}
                  onClick={() => mediaInputRef.current?.click()}
                >
                  {uploadMediaMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="mr-2 h-4 w-4" />
                  )}
                  {uploadMediaMutation.isPending
                    ? strings.mediaProcessingLabel
                    : strings.bulkUploadMediaAction}
                </Button>
                {imageAssets.length > 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mediaProcessing}
                    onClick={() =>
                      setSelectedAssetIds((current) =>
                        current.length === imageAssets.length
                          ? []
                          : imageAssets.map((asset) => asset.id)
                      )
                    }
                  >
                    {selectedAssetCount === imageAssets.length
                      ? strings.cancelAction
                      : strings.selectAllMediaAction}
                  </Button>
                ) : null}
                {selectedAssetCount > 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mediaProcessing}
                    onClick={() => setDeleteMediaDialogOpen(true)}
                  >
                    {deleteAssetsMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    {deleteAssetsMutation.isPending
                      ? strings.mediaProcessingLabel
                      : strings.bulkRemoveMediaAction}
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {mediaProcessing ? (
                <div className="flex items-center gap-3 rounded-[1.1rem] border border-dynamic-blue/20 bg-dynamic-blue/5 px-4 py-3 text-dynamic-blue text-sm md:col-span-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{strings.mediaProcessingLabel}</span>
                </div>
              ) : null}
              {imageAssets.length === 0 ? (
                <button
                  type="button"
                  className="rounded-[1.2rem] border border-border/70 border-dashed bg-background/50 p-6 text-left transition hover:border-border hover:bg-background/70 md:col-span-3"
                  disabled={mediaProcessing}
                  onClick={() => mediaInputRef.current?.click()}
                >
                  <div className="font-medium">
                    {strings.bulkUploadMediaAction}
                  </div>
                  <div className="mt-2 text-muted-foreground text-sm">
                    {strings.coverImageDescription}
                  </div>
                </button>
              ) : (
                imageAssets.map((asset, index) => {
                  const isSelected = selectedAssetIds.includes(asset.id);
                  const caption =
                    assetCaptions[asset.id] ?? getAssetCaption(asset);
                  const captionDirty = caption !== getAssetCaption(asset);

                  return (
                    <div
                      key={asset.id}
                      className={cn(
                        'overflow-hidden rounded-[1.2rem] border bg-background/75 text-left transition',
                        isSelected
                          ? 'border-primary ring-2 ring-primary/30'
                          : 'border-border/70 hover:border-border'
                      )}
                    >
                      <button
                        type="button"
                        className="relative block h-36 w-full overflow-hidden border-border/70 border-b bg-background/80"
                        onClick={() => toggleAssetSelection(asset.id)}
                      >
                        <ResilientMediaImage
                          alt={asset.alt_text ?? activeEntry.title}
                          assetUrl={asset.asset_url}
                          className="object-cover"
                          fill
                          previewUrl={asset.preview_url}
                          sizes="(max-width: 1024px) 100vw, 18vw"
                        />
                      </button>
                      <div className="space-y-3 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline">
                            {index === 0
                              ? strings.coverBadge
                              : strings.assetsLabel}
                          </Badge>
                          <div className="flex items-center gap-2">
                            {index !== 0 ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  setAsCoverMutation.isPending ||
                                  mediaProcessing
                                }
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setAsCoverMutation.mutate(asset.id);
                                }}
                              >
                                {setAsCoverMutation.isPending ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : null}
                                {setAsCoverMutation.isPending
                                  ? strings.mediaProcessingLabel
                                  : strings.setAsCoverAction}
                              </Button>
                            ) : null}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              disabled={mediaProcessing}
                              onClick={(event) => {
                                event.stopPropagation();
                                deleteSingleAsset(asset.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">
                                {strings.removeMediaAction}
                              </span>
                            </Button>
                          </div>
                        </div>
                        <div className="truncate text-sm">
                          {asset.alt_text ?? activeEntry.title}
                        </div>
                        <div className="space-y-2">
                          <Label
                            htmlFor={`entry-asset-caption-${asset.id}`}
                            className="text-xs"
                          >
                            {strings.captionLabel}
                          </Label>
                          <Input
                            id={`entry-asset-caption-${asset.id}`}
                            value={caption}
                            placeholder={strings.captionPlaceholder}
                            onChange={(event) =>
                              setAssetCaptions((current) => ({
                                ...current,
                                [asset.id]: event.target.value,
                              }))
                            }
                          />
                          {captionDirty ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={
                                saveAssetCaptionMutation.isPending ||
                                mediaProcessing
                              }
                              onClick={() =>
                                saveAssetCaptionMutation.mutate(asset.id)
                              }
                            >
                              {saveAssetCaptionMutation.isPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Pencil className="mr-2 h-4 w-4" />
                              )}
                              {saveAssetCaptionMutation.isPending
                                ? strings.mediaProcessingLabel
                                : strings.saveMediaDetailsAction}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
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
                <Label htmlFor="entry-title">{strings.titleLabel}</Label>
                <Input
                  id="entry-title"
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
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="entry-slug">{strings.slugLabel}</Label>
                  <Input
                    id="entry-slug"
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
                {supportsPairedVisual ? (
                  <div className="space-y-2">
                    <Label htmlFor="entry-paired-artwork">Paired visual</Label>
                    <Select
                      value={pairedArtworkSlug}
                      onValueChange={setPairedArtworkSlug}
                    >
                      <SelectTrigger id="entry-paired-artwork">
                        <SelectValue placeholder="No paired visual" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">
                          No paired visual
                        </SelectItem>
                        {artworkOptions.map((artworkEntry) => (
                          <SelectItem
                            key={artworkEntry.id}
                            value={artworkEntry.slug}
                          >
                            {artworkEntry.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                {featuredEntryConfig ? (
                  <div className="space-y-3 rounded-[1.1rem] border border-border/70 bg-background/60 p-4">
                    <div className="space-y-1">
                      <Label>{featuredEntryConfig.title}</Label>
                      <p className="text-muted-foreground text-sm">
                        {featuredEntryConfig.description}
                      </p>
                    </div>
                    {featuredEntrySlugs.length > 0 ? (
                      <div className="space-y-2">
                        {featuredEntrySlugs.map((slug, index) => {
                          const featuredEntry =
                            featuredEntryOptionsBySlug.get(slug);

                          if (!featuredEntry) {
                            return null;
                          }

                          return (
                            <div
                              key={slug}
                              className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/80 px-3 py-2"
                            >
                              <div className="min-w-0 space-y-1">
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary">{index + 1}</Badge>
                                  <span className="truncate font-medium text-sm">
                                    {featuredEntry.title}
                                  </span>
                                </div>
                                <div className="truncate text-muted-foreground text-xs">
                                  {featuredEntry.slug}
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={index === 0}
                                  onClick={() => moveFeaturedEntry(slug, -1)}
                                >
                                  {strings.previousAction}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={
                                    index === featuredEntrySlugs.length - 1
                                  }
                                  onClick={() => moveFeaturedEntry(slug, 1)}
                                >
                                  {strings.nextAction}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-border/70 border-dashed bg-card/50 px-3 py-3 text-muted-foreground text-sm">
                        {strings.featuredEntriesEmpty}
                      </div>
                    )}
                    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                      {featuredEntryConfig.options.map((option) => {
                        const selectedIndex = featuredEntrySlugs.indexOf(
                          option.slug
                        );

                        return (
                          <label
                            key={option.id}
                            className={cn(
                              'flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
                              selectedIndex >= 0
                                ? 'border-primary/40 bg-primary/5'
                                : 'border-border/70 bg-card/60 hover:bg-accent/40'
                            )}
                          >
                            <Checkbox
                              checked={selectedIndex >= 0}
                              className="mt-0.5"
                              onCheckedChange={() =>
                                toggleFeaturedEntrySelection(option.slug)
                              }
                            />
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate font-medium text-sm">
                                  {option.title}
                                </span>
                                {selectedIndex >= 0 ? (
                                  <Badge variant="outline">
                                    {selectedIndex + 1}
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="truncate text-muted-foreground text-xs">
                                {option.subtitle?.trim() || option.slug}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="entry-status">{strings.statusLabel}</Label>
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
                    <SelectTrigger id="entry-status">
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
                  <Label htmlFor="entry-scheduled-for">
                    {strings.scheduledForLabel}
                  </Label>
                  <Input
                    id="entry-scheduled-for"
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

          {featuredPlacementConfig ? (
            <Card className="overflow-hidden border-border/70 bg-card/95 shadow-none">
              <CardHeader className="border-border/60 border-b bg-[linear-gradient(135deg,rgba(245,158,11,0.1),rgba(251,191,36,0.03))]">
                <CardTitle>{strings.featuredPlacementTitle}</CardTitle>
                <CardDescription>
                  {featuredPlacementConfig.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                {featuredPlacementConfig.sectionEntry ? (
                  <>
                    <div className="rounded-[1.1rem] border border-border/70 bg-background/75 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-muted-foreground text-xs uppercase tracking-[0.24em]">
                            {featuredPlacementConfig.featuredLabel}
                          </div>
                          <div className="font-medium">
                            {isFeaturedPlacementActive
                              ? strings.featuredPlacementActiveLabel
                              : strings.featuredPlacementInactiveLabel}
                          </div>
                        </div>
                        <Badge
                          variant={
                            isFeaturedPlacementActive ? 'default' : 'outline'
                          }
                        >
                          {isFeaturedPlacementActive
                            ? `${strings.featuredPlacementPositionLabel} ${featuredPlacementIndex + 1}`
                            : strings.noneLabel}
                        </Badge>
                      </div>
                      <p className="mt-3 text-muted-foreground text-sm leading-6">
                        {isFeaturedPlacementActive
                          ? strings.featuredPlacementActiveDescription
                          : strings.featuredPlacementInactiveDescription}
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                      <Button
                        type="button"
                        disabled={featuredPlacementProcessing}
                        onClick={toggleFeaturedPlacement}
                      >
                        {featuredPlacementProcessing ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                        )}
                        {isFeaturedPlacementActive
                          ? strings.featuredPlacementRemoveAction
                          : strings.featuredPlacementAddAction}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          featuredPlacementProcessing ||
                          !isFeaturedPlacementActive ||
                          featuredPlacementIndex === 0
                        }
                        onClick={() => moveFeaturedPlacement(-1)}
                      >
                        {strings.previousAction}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          featuredPlacementProcessing ||
                          !isFeaturedPlacementActive ||
                          featuredPlacementIndex ===
                            featuredPlacementSlugs.length - 1
                        }
                        onClick={() => moveFeaturedPlacement(1)}
                      >
                        {strings.nextAction}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4 rounded-[1.1rem] border border-border/70 border-dashed bg-background/60 p-4">
                    <div className="text-muted-foreground text-sm leading-6">
                      {featuredPlacementConfig.emptyState}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={featuredPlacementProcessing}
                      onClick={() =>
                        createFeaturedPlacementConfigMutation.mutate()
                      }
                    >
                      {featuredPlacementProcessing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      {strings.featuredPlacementCreateAction}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

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

      <AlertDialog
        open={deleteEntryDialogOpen}
        onOpenChange={setDeleteEntryDialogOpen}
      >
        <AlertDialogContent className="rounded-[1.5rem] border-border/70">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {strings.deleteEntryConfirmTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {strings.deleteEntryConfirmDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{strings.cancelAction}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteEntryMutation.isPending}
              onClick={() => deleteEntryMutation.mutate()}
            >
              {strings.deleteEntryAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteMediaDialogOpen}
        onOpenChange={setDeleteMediaDialogOpen}
      >
        <AlertDialogContent className="rounded-[1.5rem] border-border/70">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {strings.deleteAssetConfirmTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {strings.deleteAssetConfirmDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{strings.cancelAction}</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                selectedAssetCount === 0 || deleteAssetsMutation.isPending
              }
              onClick={() => deleteAssetsMutation.mutate(selectedAssetIds)}
            >
              {selectedAssetCount === 1
                ? strings.removeMediaAction
                : strings.bulkRemoveMediaAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
