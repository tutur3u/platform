'use client';

import type { JSONContent } from '@tiptap/react';
import { Eye, ImagePlus, Loader2, Pencil, Trash2 } from '@tuturuuu/icons';
import type {
  ExternalProjectEntry,
  ExternalProjectStudioAsset,
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
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { cn } from '@tuturuuu/utils/format';
import type { CmsStrings } from '../../cms-strings';
import { ResilientMediaImage } from '../../resilient-media-image';
import { EntryDetailMarkdownEditor } from './entry-detail-markdown-editor';
import { ActionButton } from './entry-detail-shared';
import {
  type EntryDetailUploadProgressItem,
  EntryDetailUploadProgressList,
} from './entry-detail-upload-progress';
import { EntryDetailWebglPanel } from './entry-detail-webgl-panel';

function getAssetCaption(asset: ExternalProjectStudioAsset | null | undefined) {
  const metadata = asset?.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return '';
  }

  const caption = (metadata as Record<string, unknown>).caption;
  return typeof caption === 'string' ? caption : '';
}

type EntryDetailMainColumnProps = {
  activeEntry: ExternalProjectEntry;
  assetCaptions: Record<string, string>;
  bodyMarkdown: string;
  bodyMarkdownLabel: string;
  bodyMarkdownPlaceholder: string;
  bodyMarkdownWriteLabel: string;
  coverAltText: string;
  coverAsset: ExternalProjectStudioAsset | null;
  coverDirty: boolean;
  deleteAssetsPending: boolean;
  descriptionContent: JSONContent | null;
  imageAssets: ExternalProjectStudioAsset[];
  mediaProcessing: boolean;
  onBodyMarkdownChange: (value: string) => void;
  onCaptionChange: (assetId: string, value: string) => void;
  onCoverAltTextChange: (value: string) => void;
  onCoverInputClick: () => void;
  onDeleteSelectedMedia: () => void;
  onDeleteSingleAsset: (assetId: string) => void;
  onDescriptionChange: (content: JSONContent | null) => void;
  onOpenPreview: () => void;
  onSaveAssetCaption: (assetId: string) => void;
  onSaveCover: () => void;
  onSelectAllMedia: () => void;
  onSetAsCover: (assetId: string) => void;
  onSubtitleChange: (value: string) => void;
  onToggleAssetSelection: (assetId: string) => void;
  onUploadMediaClick: () => void;
  onUploadWebglClick: () => void;
  saveAssetCaptionPending: boolean;
  saveCoverPending: boolean;
  selectedAssetCount: number;
  selectedAssetIds: string[];
  setAsCoverPending: boolean;
  strings: CmsStrings;
  subtitle: string;
  supportsMarkdownBody: boolean;
  supportsWebglPackage: boolean;
  uploadCoverPending: boolean;
  uploadProgressItems: EntryDetailUploadProgressItem[];
  uploadMediaPending: boolean;
  uploadWebglPending: boolean;
  webglPackageAsset: ExternalProjectStudioAsset | null;
  webglPackagePlayerPath: string | null;
  webglPackagePublicPlayerPath: string | null;
};

export function EntryDetailMainColumn({
  activeEntry,
  assetCaptions,
  bodyMarkdown,
  bodyMarkdownLabel,
  bodyMarkdownPlaceholder,
  bodyMarkdownWriteLabel,
  coverAltText,
  coverAsset,
  coverDirty,
  deleteAssetsPending,
  descriptionContent,
  imageAssets,
  mediaProcessing,
  onBodyMarkdownChange,
  onCaptionChange,
  onCoverAltTextChange,
  onCoverInputClick,
  onDeleteSelectedMedia,
  onDeleteSingleAsset,
  onDescriptionChange,
  onOpenPreview,
  onSaveAssetCaption,
  onSaveCover,
  onSelectAllMedia,
  onSetAsCover,
  onSubtitleChange,
  onToggleAssetSelection,
  onUploadMediaClick,
  onUploadWebglClick,
  saveAssetCaptionPending,
  saveCoverPending,
  selectedAssetCount,
  selectedAssetIds,
  setAsCoverPending,
  strings,
  subtitle,
  supportsMarkdownBody,
  supportsWebglPackage,
  uploadCoverPending,
  uploadProgressItems,
  uploadMediaPending,
  uploadWebglPending,
  webglPackageAsset,
  webglPackagePlayerPath,
  webglPackagePublicPlayerPath,
}: EntryDetailMainColumnProps) {
  const coverUploadProgressItems = uploadProgressItems.filter(
    (item) => item.scope === 'cover'
  );
  const mediaUploadProgressItems = uploadProgressItems.filter(
    (item) => item.scope === 'media'
  );
  const webglUploadProgressItems = uploadProgressItems.filter(
    (item) => item.scope === 'webgl'
  );

  return (
    <div className="space-y-6">
      {supportsWebglPackage ? (
        <EntryDetailWebglPanel
          onUploadWebglClick={onUploadWebglClick}
          strings={strings}
          uploadProgressItems={webglUploadProgressItems}
          uploadWebglPending={uploadWebglPending}
          webglPackageAsset={webglPackageAsset}
          webglPackagePlayerPath={webglPackagePlayerPath}
          webglPackagePublicPlayerPath={webglPackagePublicPlayerPath}
        />
      ) : null}

      <Card className="overflow-hidden border-border/70 bg-card/95 shadow-none">
        <CardContent className="space-y-6 p-6">
          <div className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-background/80">
            {coverAsset ? (
              <div className="relative aspect-[16/9] overflow-hidden bg-background">
                <ResilientMediaImage
                  alt={coverAsset.alt_text ?? activeEntry.title}
                  assetUrl={coverAsset.asset_url}
                  className="object-cover"
                  fill
                  previewUrl={coverAsset.preview_url}
                  sizes="(max-width: 1280px) 100vw, 70vw"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                  <div className="text-[11px] text-white/70 uppercase tracking-[0.3em]">
                    {strings.coverImageTitle}
                  </div>
                  <h2 className="mt-3 font-semibold text-4xl tracking-tight">
                    {activeEntry.title}
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm text-white/80 leading-6">
                    {strings.coverImageDescription}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-5 p-6">
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
                    onClick={onCoverInputClick}
                  >
                    {uploadCoverPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ImagePlus className="mr-2 h-4 w-4" />
                    )}
                    {uploadCoverPending
                      ? strings.mediaProcessingLabel
                      : strings.uploadCoverAction}
                  </Button>
                  <Button size="sm" variant="outline" onClick={onOpenPreview}>
                    <Eye className="mr-2 h-4 w-4" />
                    {strings.openPreviewAction}
                  </Button>
                </div>
                <EntryDetailUploadProgressList
                  items={coverUploadProgressItems}
                />
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
                  onClick={onCoverInputClick}
                >
                  {uploadCoverPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="mr-2 h-4 w-4" />
                  )}
                  {uploadCoverPending
                    ? strings.mediaProcessingLabel
                    : strings.replaceCoverAction}
                </ActionButton>
              </div>
              <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="entry-cover-alt">{strings.titleLabel}</Label>
                  <Input
                    id="entry-cover-alt"
                    value={coverAltText}
                    onChange={(event) =>
                      onCoverAltTextChange(event.target.value)
                    }
                  />
                </div>
                <ActionButton
                  size="sm"
                  tooltip={strings.saveCoverAction}
                  variant="outline"
                  disabled={!coverDirty || saveCoverPending || mediaProcessing}
                  onClick={onSaveCover}
                >
                  {saveCoverPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Pencil className="mr-2 h-4 w-4" />
                  )}
                  {saveCoverPending
                    ? strings.mediaProcessingLabel
                    : strings.saveCoverAction}
                </ActionButton>
              </div>
              <EntryDetailUploadProgressList
                className="mt-4"
                items={coverUploadProgressItems}
              />
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
              value={subtitle}
              onChange={(event) => onSubtitleChange(event.target.value)}
            />
          </div>
          <RichTextEditor
            content={descriptionContent}
            onChange={onDescriptionChange}
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
            <CardDescription>{strings.bodyMarkdownDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <EntryDetailMarkdownEditor
              id="entry-body-markdown"
              label={bodyMarkdownLabel}
              placeholder={bodyMarkdownPlaceholder}
              previewLabel={strings.markdownPreviewLabel}
              previewPlaceholder={bodyMarkdownPlaceholder}
              rows={14}
              value={bodyMarkdown}
              writeLabel={bodyMarkdownWriteLabel}
              onChange={onBodyMarkdownChange}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/70 bg-card/95 shadow-none">
        <CardHeader className="gap-4">
          <div>
            <CardTitle>{strings.assetGalleryTitle}</CardTitle>
            <CardDescription>{strings.coverImageDescription}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={mediaProcessing}
              onClick={onUploadMediaClick}
            >
              {uploadMediaPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="mr-2 h-4 w-4" />
              )}
              {uploadMediaPending
                ? strings.mediaProcessingLabel
                : strings.bulkUploadMediaAction}
            </Button>
            {imageAssets.length > 0 ? (
              <Button
                size="sm"
                variant="outline"
                disabled={mediaProcessing}
                onClick={onSelectAllMedia}
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
                onClick={onDeleteSelectedMedia}
              >
                {deleteAssetsPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                {deleteAssetsPending
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
          <EntryDetailUploadProgressList
            className="md:col-span-3"
            items={mediaUploadProgressItems}
          />
          {imageAssets.length === 0 ? (
            <button
              type="button"
              className="rounded-[1.2rem] border border-border/70 border-dashed bg-background/50 p-6 text-left transition hover:border-border hover:bg-background/70 md:col-span-3"
              disabled={mediaProcessing}
              onClick={onUploadMediaClick}
            >
              <div className="font-medium">{strings.bulkUploadMediaAction}</div>
              <div className="mt-2 text-muted-foreground text-sm">
                {strings.coverImageDescription}
              </div>
            </button>
          ) : (
            imageAssets.map((asset, index) => {
              const isSelected = selectedAssetIds.includes(asset.id);
              const caption = assetCaptions[asset.id] ?? getAssetCaption(asset);
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
                    onClick={() => onToggleAssetSelection(asset.id)}
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
                        {index === 0 ? strings.coverBadge : strings.assetsLabel}
                      </Badge>
                      <div className="flex items-center gap-2">
                        {index !== 0 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={setAsCoverPending || mediaProcessing}
                            onClick={(event) => {
                              event.stopPropagation();
                              onSetAsCover(asset.id);
                            }}
                          >
                            {setAsCoverPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : null}
                            {setAsCoverPending
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
                            onDeleteSingleAsset(asset.id);
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
                          onCaptionChange(asset.id, event.target.value)
                        }
                      />
                      {captionDirty ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={saveAssetCaptionPending || mediaProcessing}
                          onClick={() => onSaveAssetCaption(asset.id)}
                        >
                          {saveAssetCaptionPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Pencil className="mr-2 h-4 w-4" />
                          )}
                          {saveAssetCaptionPending
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
  );
}
