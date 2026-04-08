'use client';

import {
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  Globe,
  Link2,
  PackageOpen,
} from '@tuturuuu/icons';
import type { WorkspaceStorageExportLinksResponse } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { formatBytes } from '@/utils/file-helper';

interface SummaryCardProps {
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
}: SummaryCardProps) {
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

interface ManifestCardProps {
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
}: ManifestCardProps) {
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

interface AssetListCardProps {
  copiedPath: string | null;
  copyLabel: string;
  entryLabel: string;
  files: WorkspaceStorageExportLinksResponse['files'];
  openLabel: string;
  title: string;
  onCopyAssetLink: (relativePath: string, url: string) => void;
  onOpenAssetLink: (url: string) => void;
}

export function ExportAssetListCard({
  copiedPath,
  copyLabel,
  entryLabel,
  files,
  onCopyAssetLink,
  onOpenAssetLink,
  openLabel,
  title,
}: AssetListCardProps) {
  return (
    <Card className="border-dynamic-border">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <PackageOpen className="h-4 w-4 text-dynamic-orange" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[320px] rounded-2xl border border-dynamic-border">
          <div className="divide-y">
            {files.map((file) => (
              <div
                key={file.relativePath}
                className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="truncate font-medium text-sm">
                      {file.relativePath}
                    </div>
                    {file.relativePath === 'index.html' ? (
                      <Badge className="border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/10">
                        {entryLabel}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                    {typeof file.size === 'number' ? (
                      <span>{formatBytes(file.size)}</span>
                    ) : null}
                    {file.contentType ? <span>{file.contentType}</span> : null}
                  </div>
                  <div className="break-all rounded-xl bg-muted/30 px-3 py-2 font-mono text-[11px] text-muted-foreground leading-5">
                    {file.url}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onOpenAssetLink(file.url)}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {openLabel}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onCopyAssetLink(file.relativePath, file.url)}
                  >
                    {copiedPath === file.relativePath ? (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    ) : (
                      <Copy className="mr-2 h-4 w-4" />
                    )}
                    {copyLabel}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
