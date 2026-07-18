'use client';

import { Expand, Package } from '@tuturuuu/icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';

export function SaleProductImageDialog({
  imageUrl,
  name,
}: {
  imageUrl: string | null;
  name: string;
}) {
  const t = useTranslations('inventory.operator.commerce.createSale');
  if (!imageUrl)
    return (
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md border bg-muted/40">
        <Package className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          aria-label={t('previewImage', { name })}
          className="group relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
        >
          {/* biome-ignore lint/performance/noImgElement: workspace media can be a signed first-party URL. */}
          <img
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            src={imageUrl}
          />
          <span className="absolute inset-0 grid place-items-center bg-background/65 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Expand className="h-4 w-4" />
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl overflow-hidden p-0">
        <DialogHeader className="border-b p-4">
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>{t('imagePreviewDescription')}</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[75vh] place-items-center bg-muted/30 p-4">
          {/* biome-ignore lint/performance/noImgElement: workspace media can be a signed first-party URL. */}
          <img
            alt={name}
            className="max-h-[68vh] max-w-full rounded-lg object-contain"
            src={imageUrl}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
