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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import type { EpmStrings } from '../../epm-strings';
import { ResilientMediaImage } from '../../resilient-media-image';
import { getEntryDescriptionMarkdown } from './entry-detail-shared';

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
  const hasCoverMedia = Boolean(
    coverAsset?.preview_url || coverAsset?.asset_url
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full border-border/70 bg-background/98 p-0 sm:max-w-[min(92vw,980px)]">
        <SheetHeader className="border-border/70 border-b px-6 py-5">
          <div className="space-y-2">
            <SheetTitle>{strings.previewTitle}</SheetTitle>
            <SheetDescription>{strings.previewDescription}</SheetDescription>
          </div>
        </SheetHeader>

        <div className="px-6 py-5">
          <Tabs defaultValue="rendered" className="space-y-5">
            <TabsList className="grid w-fit grid-cols-2">
              <TabsTrigger value="rendered">
                {strings.renderedLabel}
              </TabsTrigger>
              <TabsTrigger value="payload">{strings.payloadLabel}</TabsTrigger>
            </TabsList>

            <TabsContent value="rendered" className="space-y-5">
              {previewPending ? (
                <div className="space-y-4">
                  <div className="h-[360px] animate-pulse rounded-[1.6rem] border border-border/70 bg-muted/30" />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="h-24 animate-pulse rounded-[1.2rem] border border-border/70 bg-muted/30" />
                    <div className="h-24 animate-pulse rounded-[1.2rem] border border-border/70 bg-muted/30" />
                    <div className="h-24 animate-pulse rounded-[1.2rem] border border-border/70 bg-muted/30" />
                  </div>
                </div>
              ) : previewEntry ? (
                <div className="overflow-hidden rounded-[1.6rem] border border-border/70 bg-card/95">
                  <div
                    className={
                      hasCoverMedia
                        ? 'relative min-h-[360px] border-border/70 border-b bg-background/80'
                        : 'flex min-h-[280px] flex-col justify-end bg-[radial-gradient(circle_at_top_left,rgba(120,119,198,0.16),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.12),transparent_34%)] p-8'
                    }
                  >
                    {hasCoverMedia ? (
                      <>
                        <ResilientMediaImage
                          alt={coverAsset?.alt_text ?? previewEntry.title}
                          assetUrl={coverAsset?.asset_url}
                          className="object-cover"
                          fill
                          previewUrl={coverAsset?.preview_url}
                          sizes="(max-width: 1024px) 100vw, 64vw"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/18 to-transparent" />
                        <div className="absolute inset-x-0 bottom-0 p-8">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">
                              {strings.renderedLabel}
                            </Badge>
                            <Badge variant="outline">{previewEntry.slug}</Badge>
                          </div>
                          <div className="mt-4 font-semibold text-3xl tracking-tight">
                            {previewEntry.title}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <Badge variant="outline" className="w-fit">
                          {strings.previewEmptyTitle}
                        </Badge>
                        <div className="mt-6 max-w-2xl">
                          <div className="font-semibold text-3xl tracking-tight">
                            {previewEntry.title}
                          </div>
                          <p className="mt-3 text-muted-foreground text-sm leading-7">
                            {getEntryDescriptionMarkdown(
                              previewEntry.summary,
                              ''
                            ) ||
                              previewEntry.subtitle ||
                              strings.previewEmptyDescription}
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="grid gap-3 p-5 sm:grid-cols-3">
                    <div className="rounded-[1.1rem] border border-border/70 bg-background/70 p-4">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                        {strings.titleLabel}
                      </div>
                      <div className="mt-2 font-medium">
                        {previewEntry.title}
                      </div>
                    </div>
                    <div className="rounded-[1.1rem] border border-border/70 bg-background/70 p-4">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                        {strings.slugLabel}
                      </div>
                      <div className="mt-2 font-medium">
                        {previewEntry.slug}
                      </div>
                    </div>
                    <div className="rounded-[1.1rem] border border-border/70 bg-background/70 p-4">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                        {strings.summaryLabel}
                      </div>
                      <div className="mt-2 text-muted-foreground text-sm leading-6">
                        {getEntryDescriptionMarkdown(
                          previewEntry.summary,
                          ''
                        ) ||
                          previewEntry.subtitle ||
                          strings.previewEmptyDescription}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-[1.6rem] border border-border/70 border-dashed bg-card/70 p-8">
                  <Badge variant="outline">{strings.previewEmptyTitle}</Badge>
                  <div className="mt-5 max-w-xl">
                    <div className="font-semibold text-2xl tracking-tight">
                      {strings.previewEmptyTitle}
                    </div>
                    <p className="mt-3 text-muted-foreground text-sm leading-7">
                      {strings.previewEmptyDescription}
                    </p>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="payload">
              {previewPending ? (
                <div className="rounded-[1.2rem] border border-border/70 bg-card/70 p-4 text-muted-foreground text-sm">
                  {strings.loadingPreviewLabel}
                </div>
              ) : previewEntry ? (
                <div className="overflow-hidden rounded-[1.4rem] border border-border/70 bg-card/95">
                  <div className="border-border/70 border-b px-4 py-3">
                    <div className="font-medium text-sm">
                      {previewEntry.title}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {previewEntry.slug}
                    </div>
                  </div>
                  <pre className="max-h-[60svh] overflow-auto p-4 text-xs leading-6">
                    {JSON.stringify(previewEntry, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="rounded-[1.2rem] border border-border/70 border-dashed bg-card/70 p-4 text-muted-foreground text-sm">
                  {strings.previewEmptyDescription}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
