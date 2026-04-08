'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, PackageOpen } from '@tuturuuu/icons';
import {
  exportWorkspaceStorageLinks,
  type WorkspaceStorageExportLinksResponse,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  ExportAssetListCard,
  ExportManifestCard,
  ExportSummaryCard,
} from './export-links-dialog-sections';

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
    staleTime: 60 * 1000,
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
  const assetMapJson = exportQuery.data
    ? JSON.stringify(exportQuery.data.loaderManifest.assetUrls, null, 2)
    : '{}';

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
                <ExportSummaryCard
                  assetCount={exportQuery.data.files.length}
                  assetsLabel={t('assets')}
                  copyLabel={storageT('copy')}
                  entryLabel={indexFile?.relativePath ?? ''}
                  entryUrl={indexFile?.url ?? null}
                  entryTitle={t('entry')}
                  entryUrlDescription={t('entry_url_description')}
                  entryUrlTitle={t('entry_url')}
                  modeLabel={t('rotating_mode')}
                  modeTitle={t('mode')}
                  noIndexHtmlDescription={t('no_index_html_description')}
                  noIndexHtmlLabel={t('no_index_html')}
                  openLabel={commonT('open')}
                  title={t('webgl_ready')}
                  onCopyEntry={async () => {
                    if (!indexFile) {
                      return;
                    }

                    try {
                      await copyText(indexFile.url, t('links.entry_copied'));
                    } catch {
                      toast.error(t('links.copy_failed'));
                    }
                  }}
                  onOpenEntry={() => {
                    if (!indexFile) {
                      return;
                    }

                    window.open(indexFile.url, '_blank', 'noopener,noreferrer');
                  }}
                />

                <ExportManifestCard
                  assetMapJson={assetMapJson}
                  copyAssetMapLabel={t('copy_asset_map')}
                  copyManifestLabel={t('copy_manifest')}
                  description={t('loader_manifest_description')}
                  loaderManifest={loaderManifest}
                  title={t('loader_manifest')}
                  onCopyAssetMap={async () => {
                    try {
                      await copyText(assetMapJson, t('links.asset_map_copied'));
                    } catch {
                      toast.error(t('links.copy_failed'));
                    }
                  }}
                  onCopyManifest={async () => {
                    try {
                      await copyText(
                        loaderManifest,
                        t('links.manifest_copied')
                      );
                    } catch {
                      toast.error(t('links.copy_failed'));
                    }
                  }}
                />
              </div>

              <ExportAssetListCard
                copiedPath={copiedPath}
                copyLabel={storageT('copy')}
                entryLabel={t('entry')}
                files={exportQuery.data.files}
                openLabel={commonT('open')}
                title={t('asset_links')}
                onCopyAssetLink={handleCopyAssetLink}
                onOpenAssetLink={(url) =>
                  window.open(url, '_blank', 'noopener,noreferrer')
                }
              />
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
