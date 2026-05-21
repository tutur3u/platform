'use client';

import { Code2, Copy, Link2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';

interface ExportManifestCardProps {
  assetMapJson: string;
  copyAssetMapLabel: string;
  copyManifestLabel: string;
  description: string;
  loaderManifest: string;
  onCopyAssetMap: () => void;
  onCopyManifest: () => void;
  title: string;
}

export function ExportManifestCard({
  assetMapJson,
  copyAssetMapLabel,
  copyManifestLabel,
  description,
  loaderManifest,
  onCopyAssetMap,
  onCopyManifest,
  title,
}: ExportManifestCardProps) {
  return (
    <Card className="border-dynamic-border">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Code2 className="h-4 w-4 text-dynamic-green" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-dynamic-border bg-muted/20 p-3 text-muted-foreground text-xs leading-5">
          {description}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onCopyManifest}
          >
            <Copy className="mr-2 h-4 w-4" />
            {copyManifestLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onCopyAssetMap}
          >
            <Link2 className="mr-2 h-4 w-4" />
            {copyAssetMapLabel}
          </Button>
        </div>
        <ScrollArea className="h-56 rounded-2xl border border-dynamic-border bg-muted/40 p-0">
          <pre className="p-4 font-mono text-[11px] text-dynamic-cyan leading-6">
            {loaderManifest || assetMapJson}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
