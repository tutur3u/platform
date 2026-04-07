'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  Globe,
  Link2,
  Loader2,
  PackageOpen,
} from '@tuturuuu/icons';
import {
  exportWorkspaceStorageLinks,
  type WorkspaceStorageExportLinksResponse,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { formatBytes } from '@/utils/file-helper';

interface WorkspaceStorageExportLinksDialogProps {
  wsId: string;
  folderPath: string;
  folderName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function createLoaderManifest(data: WorkspaceStorageExportLinksResponse) {
  return JSON.stringify(
    {
      folderName: data.folderName,
      folderPath: data.folderPath,
      generatedAt: data.generatedAt,
      mode: data.mode,
      entryUrl: data.loaderManifest.entryUrl,
      assetUrls: data.loaderManifest.assetUrls,
    },
    null,
    2
  );
}

async function copyText(value: string, successMessage: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
      return;
    }
  } catch {}

  const fallback = document.createElement('textarea');
  fallback.value = value;
  fallback.setAttribute('readonly', '');
  fallback.style.position = 'fixed';
  fallback.style.opacity = '0';
  document.body.appendChild(fallback);
  fallback.select();

  try {
    if (!document.execCommand('copy')) {
      throw new Error('Clipboard copy failed');
    }

    toast.success(successMessage);
  } finally {
    document.body.removeChild(fallback);
  }
}

export function WorkspaceStorageExportLinksDialog({
  wsId,
  folderPath,
  folderName,
  open,
  onOpenChange,
}: WorkspaceStorageExportLinksDialogProps) {
  const t = useTranslations('ws-storage-objects.export');
  const storageT = useTranslations('ws-storage-objects');
  const commonT = useTranslations('common');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const exportQuery = useQuery({
    enabled: open,
    queryKey: ['workspace-storage-export-links', wsId, folderPath],
    queryFn: () => exportWorkspaceStorageLinks(wsId, { path: folderPath }),
  });

  const loaderManifest = useMemo(() => {
    if (!exportQuery.data) {
      return '';
    }

    return createLoaderManifest(exportQuery.data);
  }, [exportQuery.data]);

  const handleCopyAssetLink = async (relativePath: string, url: string) => {
    try {
      await copyText(url, t('links.asset_copied'));
      setCopiedPath(relativePath);
      window.setTimeout(() => {
        setCopiedPath((current) => (current === relativePath ? null : current));
      }, 1600);
    } catch {
      toast.error(t('links.copy_failed'));
    }
  };

  const indexFile = exportQuery.data?.indexFile ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden p-0 sm:max-w-5xl">
        <div className="border-b bg-linear-to-br from-dynamic-blue/8 via-dynamic-cyan/8 to-dynamic-green/8 p-6">
          <DialogHeader className="gap-3 text-left">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-dynamic-border bg-background/80 shadow-sm">
                <PackageOpen className="h-5 w-5 text-dynamic-blue" />
              </div>
              <div className="space-y-1">
                <DialogTitle className="flex items-center gap-2">
                  {t('title')}
                  <Badge className="border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/10">
                    {t('rotating_badge')}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  {t('description', {
                    folderName,
                  })}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-6 overflow-hidden p-6">
          {exportQuery.isLoading ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-dynamic-border border-dashed bg-muted/20 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-dynamic-blue" />
              <p className="font-medium text-sm">{t('loading')}</p>
            </div>
          ) : exportQuery.isError ? (
            <div className="rounded-2xl border border-dynamic-red/20 bg-dynamic-red/5 p-4 text-dynamic-red text-sm">
              {exportQuery.error instanceof Error
                ? exportQuery.error.message
                : t('load_failed')}
            </div>
          ) : exportQuery.data ? (
            <>
              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <Card className="overflow-hidden border-dynamic-border">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Globe className="h-4 w-4 text-dynamic-blue" />
                      {t('webgl_ready')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-dynamic-border bg-muted/30 p-4">
                        <div className="text-muted-foreground text-xs uppercase tracking-[0.12em]">
                          {t('assets')}
                        </div>
                        <div className="mt-2 font-semibold text-2xl">
                          {exportQuery.data.files.length}
                        </div>
                      </div>
                      <div className="rounded-xl border border-dynamic-border bg-muted/30 p-4">
                        <div className="text-muted-foreground text-xs uppercase tracking-[0.12em]">
                          {t('entry')}
                        </div>
                        <div className="mt-2 font-semibold text-sm">
                          {indexFile?.relativePath ?? t('no_index_html')}
                        </div>
                      </div>
                      <div className="rounded-xl border border-dynamic-border bg-muted/30 p-4">
                        <div className="text-muted-foreground text-xs uppercase tracking-[0.12em]">
                          {t('mode')}
                        </div>
                        <div className="mt-2 font-semibold text-sm">
                          {t('rotating_mode')}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-dynamic-border bg-background p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-sm">
                            {t('entry_url')}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {t('entry_url_description')}
                          </div>
                        </div>
                        {indexFile ? (
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                window.open(
                                  indexFile.url,
                                  '_blank',
                                  'noopener,noreferrer'
                                )
                              }
                            >
                              <ExternalLink className="mr-2 h-4 w-4" />
                              {commonT('open')}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={async () => {
                                try {
                                  await copyText(
                                    indexFile.url,
                                    t('links.entry_copied')
                                  );
                                } catch {
                                  toast.error(t('links.copy_failed'));
                                }
                              }}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              {storageT('copy')}
                            </Button>
                          </div>
                        ) : null}
                      </div>

                      <div className="break-all rounded-xl border border-dynamic-border border-dashed bg-muted/20 p-3 font-mono text-xs leading-6">
                        {indexFile?.url ?? t('no_index_html_description')}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-dynamic-border">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Code2 className="h-4 w-4 text-dynamic-green" />
                      {t('loader_manifest')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-2xl border border-dynamic-border bg-muted/20 p-3 text-muted-foreground text-xs leading-5">
                      {t('loader_manifest_description')}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await copyText(
                              loaderManifest,
                              t('links.manifest_copied')
                            );
                          } catch {
                            toast.error(t('links.copy_failed'));
                          }
                        }}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        {t('copy_manifest')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await copyText(
                              JSON.stringify(
                                exportQuery.data.loaderManifest.assetUrls,
                                null,
                                2
                              ),
                              t('links.asset_map_copied')
                            );
                          } catch {
                            toast.error(t('links.copy_failed'));
                          }
                        }}
                      >
                        <Link2 className="mr-2 h-4 w-4" />
                        {t('copy_asset_map')}
                      </Button>
                    </div>
                    <ScrollArea className="h-56 rounded-2xl border border-dynamic-border bg-[#091120] p-0">
                      <pre className="p-4 font-mono text-[11px] text-dynamic-cyan leading-6">
                        {loaderManifest}
                      </pre>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-dynamic-border">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <PackageOpen className="h-4 w-4 text-dynamic-orange" />
                    {t('asset_links')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[320px] rounded-2xl border border-dynamic-border">
                    <div className="divide-y">
                      {exportQuery.data.files.map((file) => (
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
                                  {t('entry')}
                                </Badge>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                              {typeof file.size === 'number' ? (
                                <span>{formatBytes(file.size)}</span>
                              ) : null}
                              {file.contentType ? (
                                <span>{file.contentType}</span>
                              ) : null}
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
                              onClick={() =>
                                window.open(
                                  file.url,
                                  '_blank',
                                  'noopener,noreferrer'
                                )
                              }
                            >
                              <ExternalLink className="mr-2 h-4 w-4" />
                              {commonT('open')}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() =>
                                handleCopyAssetLink(file.relativePath, file.url)
                              }
                            >
                              {copiedPath === file.relativePath ? (
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                              ) : (
                                <Copy className="mr-2 h-4 w-4" />
                              )}
                              {storageT('copy')}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface WorkspaceStorageExportLinksButtonProps {
  wsId: string;
  folderPath: string;
  folderName: string;
}

export function WorkspaceStorageExportLinksButton({
  wsId,
  folderPath,
  folderName,
}: WorkspaceStorageExportLinksButtonProps) {
  const t = useTranslations('ws-storage-objects.export');
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="gap-2 border-dynamic-blue/20 bg-dynamic-blue/5 text-dynamic-blue hover:bg-dynamic-blue/10"
        onClick={() => setOpen(true)}
      >
        <PackageOpen className="h-4 w-4" />
        {t('button')}
      </Button>
      <WorkspaceStorageExportLinksDialog
        wsId={wsId}
        folderPath={folderPath}
        folderName={folderName}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
