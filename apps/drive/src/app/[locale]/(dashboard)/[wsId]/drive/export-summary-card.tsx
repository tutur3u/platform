'use client';

import { Copy, ExternalLink, Globe } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';

interface ExportSummaryCardProps {
  assetCount: number;
  entryLabel: string;
  entryUrl: string | null;
  modeLabel: string;
  noIndexHtmlLabel: string;
  noIndexHtmlDescription: string;
  openLabel: string;
  copyLabel: string;
  title: string;
  assetsLabel: string;
  entryTitle: string;
  modeTitle: string;
  entryUrlTitle: string;
  entryUrlDescription: string;
  onCopyEntry: () => void;
  onOpenEntry: () => void;
}

export function ExportSummaryCard({
  assetCount,
  assetsLabel,
  copyLabel,
  entryLabel,
  entryTitle,
  entryUrl,
  entryUrlDescription,
  entryUrlTitle,
  modeLabel,
  modeTitle,
  noIndexHtmlDescription,
  noIndexHtmlLabel,
  onCopyEntry,
  onOpenEntry,
  openLabel,
  title,
}: ExportSummaryCardProps) {
  return (
    <Card className="overflow-hidden border-border">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe aria-hidden className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="divide-y divide-border rounded-xl bg-muted/50 px-4">
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-muted-foreground text-sm">{assetsLabel}</dt>
            <dd className="font-medium text-sm tabular-nums">{assetCount}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-muted-foreground text-sm">{entryTitle}</dt>
            <dd className="truncate font-medium text-sm">
              {entryLabel || noIndexHtmlLabel}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-muted-foreground text-sm">{modeTitle}</dt>
            <dd className="text-right font-medium text-sm">{modeLabel}</dd>
          </div>
        </dl>

        <div className="rounded-xl border border-border bg-background p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="font-medium text-sm">{entryUrlTitle}</div>
              <div className="text-muted-foreground text-xs">
                {entryUrlDescription}
              </div>
            </div>
            {entryUrl ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onOpenEntry}
                >
                  <ExternalLink className="size-4" />
                  {openLabel}
                </Button>
                <Button type="button" size="sm" onClick={onCopyEntry}>
                  <Copy className="size-4" />
                  {copyLabel}
                </Button>
              </div>
            ) : null}
          </div>

          <div className="break-all rounded-xl border border-border border-dashed bg-muted/20 p-3 font-mono text-xs leading-6">
            {entryUrl ?? noIndexHtmlDescription}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
