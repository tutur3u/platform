'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { exportWorkspaceStorageLinks } from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  ExportAssetListCard,
  ExportManifestCard,
  ExportSummaryCard,
} from './export-links-dialog-sections';
import { copyText, createLoaderManifest } from './export-links-utils';

interface ExportLinksDialogContentProps {
  folderPath: string;
  wsId: string;
}

export function ExportLinksDialogContent({
  folderPath,
  wsId,
}: ExportLinksDialogContentProps) {
  const t = useTranslations('ws-storage-objects.export');
  const storageT = useTranslations('ws-storage-objects');
  const commonT = useTranslations('common');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const exportQuery = useQuery({
    queryKey: ['workspace-storage-export-links', wsId, folderPath],
    queryFn: () => exportWorkspaceStorageLinks(wsId, { path: folderPath }),
    staleTime: 60 * 1000,
  });

  const loaderManifest = useMemo(() => {
    return exportQuery.data ? createLoaderManifest(exportQuery.data) : '';
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

  if (exportQuery.isLoading) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-dynamic-border border-dashed bg-muted/20 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-dynamic-blue" />
        <p className="font-medium text-sm">{t('loading')}</p>
      </div>
    );
  }

  if (exportQuery.isError) {
    return (
      <div className="rounded-2xl border border-dynamic-red/20 bg-dynamic-red/5 p-4 text-dynamic-red text-sm">
        {exportQuery.error instanceof Error
          ? exportQuery.error.message
          : t('load_failed')}
      </div>
    );
  }

  if (!exportQuery.data) {
    return null;
  }

  const indexFile = exportQuery.data.indexFile ?? null;
  const assetMapJson = JSON.stringify(
    exportQuery.data.loaderManifest.assetUrls,
    null,
    2
  );

  return (
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
          onCopyEntry={() => {
            if (!indexFile) return;
            void copyText(indexFile.url, t('links.entry_copied')).catch(() =>
              toast.error(t('links.copy_failed'))
            );
          }}
          onOpenEntry={() => {
            if (indexFile) {
              window.open(indexFile.url, '_blank', 'noopener,noreferrer');
            }
          }}
        />

        <ExportManifestCard
          assetMapJson={assetMapJson}
          copyAssetMapLabel={t('copy_asset_map')}
          copyManifestLabel={t('copy_manifest')}
          description={t('loader_manifest_description')}
          loaderManifest={loaderManifest}
          title={t('loader_manifest')}
          onCopyAssetMap={() => {
            void copyText(assetMapJson, t('links.asset_map_copied')).catch(() =>
              toast.error(t('links.copy_failed'))
            );
          }}
          onCopyManifest={() => {
            void copyText(loaderManifest, t('links.manifest_copied')).catch(
              () => toast.error(t('links.copy_failed'))
            );
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
  );
}
