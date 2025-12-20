'use client';

import {
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  Music,
  Video,
} from '@tuturuuu/icons';
import { createDynamicClient } from '@tuturuuu/supabase/next/client';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { joinPath } from '@tuturuuu/utils/path-helper';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { formatBytes } from '@/utils/file-helper';

// Dynamic imports for heavy components
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

interface FilePreviewDialogProps {
  wsId: string;
  path: string;
  file: StorageObject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const imageExtensions = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'svg',
  'webp',
  'bmp',
  'ico',
];
const videoExtensions = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'];
const audioExtensions = ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'];
const textExtensions = ['txt', 'md', 'json', 'xml', 'csv', 'log'];
const codeExtensions = [
  'js',
  'ts',
  'tsx',
  'jsx',
  'py',
  'java',
  'c',
  'cpp',
  'css',
  'html',
  'php',
];

function getFileType(
  fileName: string
): 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'code' | 'other' {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';

  if (imageExtensions.includes(extension)) return 'image';
  if (videoExtensions.includes(extension)) return 'video';
  if (audioExtensions.includes(extension)) return 'audio';
  if (extension === 'pdf') return 'pdf';
  if (textExtensions.includes(extension)) return 'text';
  if (codeExtensions.includes(extension)) return 'code';

  return 'other';
}

function getFileIcon(fileType: string) {
  switch (fileType) {
    case 'image':
      return <ImageIcon className="h-5 w-5" />;
    case 'video':
      return <Video className="h-5 w-5" />;
    case 'audio':
      return <Music className="h-5 w-5" />;
    case 'pdf':
      return <FileText className="h-5 w-5" />;
    case 'text':
    case 'code':
      return <FileText className="h-5 w-5" />;
    default:
      return <FileText className="h-5 w-5" />;
  }
}

export function FilePreviewDialog({
  wsId,
  path,
  file,
  open,
  onOpenChange,
}: FilePreviewDialogProps) {
  const t = useTranslations();
  const supabase = createDynamicClient();

  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [textContent, setTextContent] = useState<string>('');

  const fileType = file?.name ? getFileType(file.name) : 'other';
  const cleanFileName =
    file?.name?.replace(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i,
      ''
    ) || '';

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!file?.name || !open) {
      setSignedUrl(null);
      setTextContent('');
      return;
    }

    const fetchSignedUrl = async () => {
      setLoading(true);
      try {
        if (!file.name) {
          toast({
            title: 'Error',
            description: 'Failed to load file preview',
            variant: 'destructive',
          });
          return;
        }

        // The file.name already contains the full path including wsId
        const fullPath = joinPath(wsId, path, file.name);
        if (!fullPath) {
          toast({
            title: 'Error',
            description: 'Failed to load file preview',
            variant: 'destructive',
          });
          return;
        }

        const { data, error } = await supabase.storage
          .from('workspaces')
          .createSignedUrl(fullPath, 3600);

        if (error) {
          console.error('Error creating signed URL:', error);
          toast({
            title: 'Error',
            description: 'Failed to load file preview',
            variant: 'destructive',
          });
          return;
        }

        setSignedUrl(data.signedUrl);

        // For text files, fetch content
        if (fileType === 'text' || fileType === 'code') {
          try {
            const response = await fetch(data.signedUrl);
            if (response.ok) {
              const content = await response.text();
              setTextContent(content);
            }
          } catch (error) {
            console.error('Error fetching text content:', error);
          }
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSignedUrl();
  }, [file?.name, open, fileType, wsId, path, supabase.storage.from]);

  const handleDownload = async () => {
    if (!file?.name || !signedUrl) return;

    try {
      const response = await fetch(signedUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = cleanFileName || file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Success',
        description: 'File downloaded successfully',
      });
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: 'Error',
        description: 'Failed to download file',
        variant: 'destructive',
      });
    }
  };

  const handleOpenExternal = () => {
    if (signedUrl) {
      window.open(signedUrl, '_blank');
    }
  };

  const renderPreview = () => {
    // Reserve space for preview area
    const previewAreaClass =
      'relative flex-1 min-h-[60vh] min-w-0 flex items-center justify-center bg-muted/30 rounded-lg overflow-hidden';

    if (loading) {
      return (
        <div className={previewAreaClass}>
          {/* Skeleton for image/pdf */}
          {fileType === 'image' && (
            <div className="absolute inset-0 animate-pulse rounded-lg bg-linear-to-br from-muted/40 to-muted/10" />
          )}
          {fileType === 'pdf' && (
            <div className="absolute inset-0 flex animate-pulse items-center justify-center rounded-lg bg-linear-to-br from-muted/40 to-muted/10">
              <FileText className="h-16 w-16 text-muted-foreground/30" />
            </div>
          )}
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

    switch (fileType) {
      case 'image':
        return (
          <div className={cn(previewAreaClass, 'p-2')}>
            <a
              href={signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block h-full w-full"
              title={t('common.view')}
            >
              <Image
                src={signedUrl}
                alt={cleanFileName || 'File preview'}
                fill
                className="h-full w-full cursor-zoom-in rounded-lg bg-white object-contain transition-opacity duration-300 dark:bg-black"
                quality={90}
                sizes="100vw"
                priority
              />
            </a>
          </div>
        );

      case 'video':
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

      case 'audio':
        return (
          <div className={cn(previewAreaClass, 'min-h-[40vh] p-4')}>
            <div className="w-full max-w-md space-y-4">
              <div className="text-center">
                <Music className="mx-auto mb-4 h-16 w-16 text-dynamic-blue" />
                <h3 className="font-medium">{cleanFileName}</h3>
              </div>
              <audio
                src={signedUrl}
                controls
                className="w-full"
                preload="metadata"
              >
                <track kind="captions" srcLang="en" label="English" />
                {t('ws-storage-objects.no_preview')}
              </audio>
            </div>
          </div>
        );

      case 'pdf':
        return (
          <div
            className={cn(
              previewAreaClass,
              'h-[75vh] w-full overflow-y-auto p-0'
            )}
          >
            <div className="relative h-full min-h-[75vh] w-full">
              <PDFViewer url={signedUrl} />
            </div>
          </div>
        );

      case 'text':
      case 'code':
        return (
          <div className={cn(previewAreaClass, 'h-[60vh] overflow-auto')}>
            <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-4 font-mono text-sm">
              {textContent || t('ws-storage-objects.no_preview')}
            </pre>
          </div>
        );

      default:
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
                  <Button onClick={handleDownload} size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    {t('common.download')}
                  </Button>
                  <Button
                    onClick={handleOpenExternal}
                    variant="outline"
                    size="sm"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {t('common.view')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  if (!file) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!max-w-[90vw] flex h-[90vh] w-full !sm:max-w-6xl flex-col overflow-y-auto"
        showCloseButton={false}
      >
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="text-dynamic-blue">{getFileIcon(fileType)}</div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-left">
                  {cleanFileName}
                </DialogTitle>
                <DialogDescription className="text-left">
                  {file.metadata?.size && (
                    <span className="text-muted-foreground">
                      {formatBytes(file.metadata.size)} •{' '}
                      {fileType.toUpperCase()}
                    </span>
                  )}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleDownload}
                variant="outline"
                size="sm"
                disabled={!signedUrl || loading}
              >
                <Download className="mr-2 h-4 w-4" />
                {t('common.download')}
              </Button>
              <Button
                onClick={handleOpenExternal}
                variant="outline"
                size="sm"
                disabled={!signedUrl || loading}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {t('common.view')}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <Separator />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
          {renderPreview()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
