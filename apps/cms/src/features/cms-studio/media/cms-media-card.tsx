'use client';

import {
  ExternalLink,
  File,
  ImageIcon,
  Music,
  Paperclip,
} from '@tuturuuu/icons';
import type { WorkspaceExternalProjectMediaItem } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { ResilientMediaImage } from '../resilient-media-image';
import { getMediaName, getMediaType } from './media-utils';

function MediaPreview({ asset }: { asset: WorkspaceExternalProjectMediaItem }) {
  const type = getMediaType(asset);
  if (type === 'audio') {
    return <Music className="size-9 text-muted-foreground" />;
  }
  if (type === 'other') {
    return <File className="size-9 text-muted-foreground" />;
  }
  return (
    <ResilientMediaImage
      alt={asset.alt_text ?? getMediaName(asset)}
      assetUrl={asset.asset_url}
      className="object-cover transition-transform duration-300 group-hover:scale-[1.025]"
      fill
      previewUrl={asset.preview_url}
      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
    />
  );
}

export function CmsMediaCard({
  asset,
  workspaceId,
}: {
  asset: WorkspaceExternalProjectMediaItem;
  workspaceId: string;
}) {
  const t = useTranslations('external-projects');
  const name = getMediaName(asset);
  const type = getMediaType(asset);
  const editHref = asset.entry
    ? `/${workspaceId}/content?entryId=${asset.entry.id}`
    : null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="group min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card/75 text-left shadow-xs transition hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted/45">
            <MediaPreview asset={asset} />
            <Badge
              variant="secondary"
              className="absolute top-2 left-2 rounded-md bg-background/90 capitalize backdrop-blur"
            >
              {type === 'other'
                ? asset.asset_type
                : t(`epm.media_type_${type}`)}
            </Badge>
          </div>
          <div className="space-y-1.5 p-3">
            <p className="truncate font-medium text-sm" title={name}>
              {name}
            </p>
            <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
              {asset.entry ? (
                <>
                  <Paperclip className="size-3.5 shrink-0" />
                  <span className="truncate">{asset.entry.title}</span>
                </>
              ) : (
                <span>{t('epm.media_library_unattached_label')}</span>
              )}
            </div>
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="overflow-hidden p-0 sm:max-w-2xl">
        <div className="relative flex min-h-64 items-center justify-center overflow-hidden bg-muted/45 sm:min-h-80">
          <MediaPreview asset={asset} />
        </div>
        <div className="space-y-5 p-5 pt-1">
          <DialogHeader>
            <DialogTitle className="pr-8">{name}</DialogTitle>
            <DialogDescription>
              {asset.entry
                ? t('epm.media_detail_used_in', { title: asset.entry.title })
                : t('epm.media_library_unattached_label')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 rounded-lg border bg-muted/25 p-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground text-xs">
                {t('epm.media_detail_type')}
              </p>
              <p className="mt-1 capitalize">{asset.asset_type}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">
                {t('epm.media_detail_alt_text')}
              </p>
              <p className="mt-1 break-words">
                {asset.alt_text || t('epm.media_detail_alt_text_empty')}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {asset.asset_url && (
              <Button asChild variant="outline">
                <a href={asset.asset_url} target="_blank" rel="noreferrer">
                  <ImageIcon className="size-4" />
                  {t('epm.media_detail_open_file')}
                  <ExternalLink className="size-3.5" />
                </a>
              </Button>
            )}
            {editHref && (
              <Button asChild>
                <a href={editHref}>
                  {t('epm.media_detail_open_content')}
                  <ExternalLink className="size-3.5" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
