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
    <Card className="overflow-hidden border-dynamic-border">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="h-4 w-4 text-dynamic-blue" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-dynamic-border bg-muted/30 p-4">
            <div className="text-muted-foreground text-xs uppercase tracking-[0.12em]">
              {assetsLabel}
            </div>
            <div className="mt-2 font-semibold text-2xl">{assetCount}</div>
          </div>
          <div className="rounded-xl border border-dynamic-border bg-muted/30 p-4">
            <div className="text-muted-foreground text-xs uppercase tracking-[0.12em]">
              {entryTitle}
            </div>
            <div className="mt-2 font-semibold text-sm">
              {entryLabel || noIndexHtmlLabel}
            </div>
          </div>
          <div className="rounded-xl border border-dynamic-border bg-muted/30 p-4">
            <div className="text-muted-foreground text-xs uppercase tracking-[0.12em]">
              {modeTitle}
            </div>
            <div className="mt-2 font-semibold text-sm">{modeLabel}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-dynamic-border bg-background p-4">
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
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {openLabel}
                </Button>
                <Button type="button" size="sm" onClick={onCopyEntry}>
                  <Copy className="mr-2 h-4 w-4" />
                  {copyLabel}
                </Button>
              </div>
            ) : null}
          </div>

          <div className="break-all rounded-xl border border-dynamic-border border-dashed bg-muted/20 p-3 font-mono text-xs leading-6">
            {entryUrl ?? noIndexHtmlDescription}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
