'use client';

import {
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Play,
  X,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { MindChatFile } from './use-mind-ai-attachments';

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ file }: { file: File }) {
  if (file.type.startsWith('image/')) {
    return <ImageIcon className="h-3.5 w-3.5 text-dynamic-blue" />;
  }
  return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
}

export function MindAiAttachmentChips({
  disabled,
  files,
  onRemove,
}: {
  disabled?: boolean;
  files: MindChatFile[];
  onRemove: (id: string) => void;
}) {
  const t = useTranslations('mind');

  if (!files.length) return null;

  return (
    <div className="flex gap-1.5 overflow-x-auto px-2 pt-2">
      {files.map((item) => (
        <div
          className={cn(
            'group flex max-w-40 shrink-0 items-center gap-1.5 rounded-md border bg-card py-1 pr-1 pl-1',
            item.status === 'error' && 'border-dynamic-red/40 bg-dynamic-red/5'
          )}
          key={item.id}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
            {item.previewUrl && item.file.type.startsWith('image/') ? (
              // biome-ignore lint/performance/noImgElement: object URL preview cannot use Next Image
              <img
                alt=""
                className="h-full w-full object-cover"
                src={item.previewUrl}
              />
            ) : item.previewUrl && item.file.type.startsWith('video/') ? (
              <div className="relative h-full w-full">
                <video
                  className="h-full w-full object-cover"
                  muted
                  preload="metadata"
                  src={item.previewUrl}
                />
                <Play className="absolute top-1/2 left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 fill-white text-white" />
              </div>
            ) : (
              <FileIcon file={item.file} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-[11px] leading-tight">
              {item.file.name}
            </p>
            <p className="text-[10px] text-muted-foreground leading-tight">
              {item.status === 'uploading'
                ? t('ai.uploading')
                : item.status === 'error'
                  ? t('ai.uploadFailed')
                  : formatFileSize(item.file.size)}
            </p>
          </div>
          {item.status === 'uploading' ? (
            <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <Button
              aria-label={t('ai.removeAttachment', { name: item.file.name })}
              className="h-6 w-6 shrink-0 opacity-70 group-hover:opacity-100"
              disabled={disabled}
              onClick={() => onRemove(item.id)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
