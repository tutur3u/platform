'use client';

import type {
  ExternalProjectDeliveryEntry,
  ExternalProjectStudioAsset,
} from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@tuturuuu/ui/sheet';
import type { EpmStrings } from '../../epm-strings';
import { ResilientMediaImage } from '../../resilient-media-image';

export function EntryDetailPreviewSheet({
  coverAsset,
  open,
  onOpenChange,
  previewEntry,
  previewPending,
  strings,
}: {
  coverAsset: ExternalProjectStudioAsset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewEntry: ExternalProjectDeliveryEntry | null;
  previewPending: boolean;
  strings: EpmStrings;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{strings.previewTitle}</SheetTitle>
          <SheetDescription>{strings.previewDescription}</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="flex gap-2">
            <Badge variant="outline">{strings.renderedLabel}</Badge>
            <Badge variant="outline">{strings.payloadLabel}</Badge>
          </div>
          {previewPending ? (
            <div className="rounded-[1.2rem] border border-border/70 p-4 text-muted-foreground text-sm">
              {strings.loadingPreviewLabel}
            </div>
          ) : previewEntry ? (
            <>
              <div className="relative min-h-[260px] overflow-hidden rounded-[1.4rem] border border-border/70 bg-background/80">
                <ResilientMediaImage
                  alt={coverAsset?.alt_text ?? previewEntry.title}
                  assetUrl={coverAsset?.asset_url}
                  className="object-cover"
                  fill
                  previewUrl={coverAsset?.preview_url}
                  sizes="(max-width: 1024px) 100vw, 64vw"
                />
              </div>
              <div className="space-y-2">
                <div className="font-semibold text-xl">
                  {previewEntry.title}
                </div>
                <p className="text-muted-foreground text-sm leading-6">
                  {previewEntry.summary || strings.emptyEntries}
                </p>
              </div>
              <pre className="overflow-x-auto rounded-[1.2rem] border border-border/70 bg-background/80 p-4 text-xs leading-6">
                {JSON.stringify(previewEntry, null, 2)}
              </pre>
            </>
          ) : (
            <div className="rounded-[1.2rem] border border-border/70 p-4 text-muted-foreground text-sm">
              {strings.emptyEntries}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
