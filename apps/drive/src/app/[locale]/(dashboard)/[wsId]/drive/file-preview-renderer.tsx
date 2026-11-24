'use client';

import { Download, FileText, Music } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Empty } from '@tuturuuu/ui/empty';
import { LoadingRegion, Skeleton } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { DrivePreviewFileType } from './file-preview-utils';

function PdfPreviewSkeleton() {
  const t = useTranslations();

  return (
    <LoadingRegion
      className="relative flex h-64 w-full items-center justify-center rounded-lg"
      srLabel={t('common.loading')}
    >
      <Skeleton aria-hidden="true" className="absolute inset-0 rounded-lg" />
      <FileText
        aria-hidden="true"
        className="relative size-16 text-muted-foreground/30"
      />
    </LoadingRegion>
  );
}

const PDFViewer = dynamic(
  () =>
    import('@tuturuuu/ui/custom/education/modules/resources/pdf-viewer').then(
      (mod) => mod.PDFViewer
    ),
  {
    ssr: false,
    loading: () => <PdfPreviewSkeleton />,
  }
);

interface FilePreviewRendererProps {
  cleanFileName: string;
  fileType: DrivePreviewFileType;
  loading: boolean;
  onDownload: () => void;
  signedUrl: string | null;
  textContent: string;
}

export function FilePreviewRenderer({
  cleanFileName,
  fileType,
  loading,
  onDownload,
  signedUrl,
  textContent,
}: FilePreviewRendererProps) {
  const t = useTranslations();
  const previewAreaClass =
    'relative flex-1 min-h-[60vh] min-w-0 flex items-center justify-center bg-muted/30 rounded-lg overflow-hidden';

  if (loading) {
    return (
      <LoadingRegion className={previewAreaClass} srLabel={t('common.loading')}>
        <Skeleton aria-hidden="true" className="absolute inset-0 rounded-lg" />
        {fileType === 'pdf' ? (
          <FileText
            aria-hidden="true"
            className="relative size-16 text-muted-foreground/30"
          />
        ) : null}
      </LoadingRegion>
    );
  }

  if (!signedUrl) {
    return (
      <div className={previewAreaClass}>
        <Empty icon={FileText} title={t('ws-storage-objects.no_preview')} />
      </div>
    );
  }

  if (fileType === 'image') {
    return (
      <div className={cn(previewAreaClass, 'p-2')}>
        <a
          href={signedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="relative block h-full w-full"
          title={t('common.view')}
        >
          <Image
            src={signedUrl}
            alt={cleanFileName || 'File preview'}
            fill
            className="h-full w-full cursor-zoom-in rounded-lg bg-muted object-contain transition-opacity duration-300"
            sizes="100vw"
            priority
            unoptimized
          />
        </a>
      </div>
    );
  }

  if (fileType === 'video') {
    return (
      <div className={cn(previewAreaClass, 'min-h-[60vh] p-2')}>
        <video
          src={signedUrl}
          controls
          className="h-full max-h-[70vh] w-full rounded-lg object-contain"
          preload="metadata"
        >
          <track kind="captions" srcLang="en" label="English" />
          {t('ws-storage-objects.no_preview')}
        </video>
      </div>
    );
  }

  if (fileType === 'audio') {
    return (
      <div className={cn(previewAreaClass, 'min-h-[40vh] p-4')}>
        <div className="w-full max-w-md space-y-4">
          <div className="text-center">
            <Music
              aria-hidden
              className="mx-auto mb-4 size-16 text-muted-foreground"
            />
            <h3 className="font-medium">{cleanFileName}</h3>
          </div>
          <audio src={signedUrl} controls className="w-full" preload="metadata">
            <track kind="captions" srcLang="en" label="English" />
            {t('ws-storage-objects.no_preview')}
          </audio>
        </div>
      </div>
    );
  }

  if (fileType === 'pdf') {
    return (
      <div
        className={cn(previewAreaClass, 'h-[75vh] w-full overflow-y-auto p-0')}
      >
        <div className="relative h-full min-h-[75vh] w-full">
          <PDFViewer url={signedUrl} />
        </div>
      </div>
    );
  }

  if (fileType === 'text' || fileType === 'code') {
    return (
      <div className={cn(previewAreaClass, 'h-[60vh] overflow-auto')}>
        <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-4 font-mono text-sm">
          {textContent || t('ws-storage-objects.no_preview')}
        </pre>
      </div>
    );
  }

  return (
    <div className={cn(previewAreaClass, 'h-[60vh]')}>
      <Empty
        action={
          <Button onClick={onDownload} size="sm" type="button">
            <Download className="size-4" />
            {t('common.download')}
          </Button>
        }
        description={t('ws-storage-objects.no_preview')}
        icon={FileText}
        title={cleanFileName}
      />
    </div>
  );
}
