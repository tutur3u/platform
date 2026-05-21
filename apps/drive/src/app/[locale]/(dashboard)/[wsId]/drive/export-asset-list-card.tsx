'use client';

import { CheckCircle2, Copy, ExternalLink, PackageOpen } from '@tuturuuu/icons';
import type { WorkspaceStorageExportLinksResponse } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { formatBytes } from '@tuturuuu/utils/format';

interface ExportAssetListCardProps {
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
}: ExportAssetListCardProps) {
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
