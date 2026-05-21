'use client';

import {
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Music,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { type DrivePreviewFileType, getFileIcon } from './file-preview-utils';

const PDFViewer = dynamic(
  () =>
    import('@tuturuuu/ui/custom/education/modules/resources/pdf-viewer').then(
      (mod) => mod.PDFViewer
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    ),
  }
);

interface FilePreviewRendererProps {
  cleanFileName: string;
  fileType: DrivePreviewFileType;
  loading: boolean;
  onDownload: () => void;
  onOpenExternal: () => void;
  signedUrl: string | null;
  textContent: string;
}

export function FilePreviewRenderer({
  cleanFileName,
  fileType,
  loading,
  onDownload,
  onOpenExternal,
  signedUrl,
  textContent,
}: FilePreviewRendererProps) {
  const t = useTranslations();
  const previewAreaClass =
    'relative flex-1 min-h-[60vh] min-w-0 flex items-center justify-center bg-muted/30 rounded-lg overflow-hidden';

  if (loading) {
    return (
      <div className={previewAreaClass}>
        {fileType === 'image' ? (
          <div className="absolute inset-0 animate-pulse rounded-lg bg-linear-to-br from-muted/40 to-muted/10" />
        ) : null}
        {fileType === 'pdf' ? (
          <div className="absolute inset-0 flex animate-pulse items-center justify-center rounded-lg bg-linear-to-br from-muted/40 to-muted/10">
            <FileText className="h-16 w-16 text-muted-foreground/30" />
          </div>
        ) : null}
        <div className="z-10 flex flex-col items-center justify-center">
          <Loader2 className="mb-4 h-10 w-10 animate-spin text-dynamic-blue" />
          <span className="font-medium text-muted-foreground text-sm">
            {t('common.loading')}...
          </span>
        </div>
      </div>
    );
  }

  if (!signedUrl) {
    return (
      <div className={previewAreaClass}>
        <div className="space-y-2 text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">
            {t('ws-storage-objects.no_preview')}
          </p>
        </div>
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
            className="h-full w-full cursor-zoom-in rounded-lg bg-white object-contain transition-opacity duration-300 dark:bg-black"
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
            <Music className="mx-auto mb-4 h-16 w-16 text-dynamic-blue" />
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
      <div className="space-y-4 text-center">
        {getFileIcon(fileType)}
        <div>
          <h3 className="mb-2 font-medium">{cleanFileName}</h3>
          <p className="mb-4 text-muted-foreground text-sm">
            {t('ws-storage-objects.no_preview')}
          </p>
          <div className="flex justify-center gap-2">
            <Button onClick={onDownload} size="sm">
              <Download className="mr-2 h-4 w-4" />
              {t('common.download')}
            </Button>
            <Button onClick={onOpenExternal} variant="outline" size="sm">
              <ExternalLink className="mr-2 h-4 w-4" />
              {t('common.view')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
