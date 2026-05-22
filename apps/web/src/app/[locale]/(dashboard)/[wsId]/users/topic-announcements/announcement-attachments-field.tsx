'use client';

import { useMutation } from '@tanstack/react-query';
import { FileText, Loader2, Paperclip, Upload, X } from '@tuturuuu/icons';
import type { TopicAnnouncementAttachmentDraft } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  ANNOUNCEMENT_ATTACHMENT_ACCEPT,
  ANNOUNCEMENT_ATTACHMENT_CONTENT_TYPES,
  MAX_ANNOUNCEMENT_ATTACHMENT_BYTES,
  MAX_ANNOUNCEMENT_ATTACHMENTS,
} from './announcement-form-state';

interface Props {
  attachments: TopicAnnouncementAttachmentDraft[];
  disabled: boolean;
  onChange: (attachments: TopicAnnouncementAttachmentDraft[]) => void;
  onUploadAttachment: (file: File) => Promise<TopicAnnouncementAttachmentDraft>;
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${Math.ceil(value / 1024)} KB`;
  }
  return `${value} B`;
}

function getFileExtension(fileName: string) {
  const index = fileName.lastIndexOf('.');
  return index === -1 ? '' : fileName.slice(index).toLowerCase();
}

function isAllowedFile(file: File) {
  if (
    ANNOUNCEMENT_ATTACHMENT_CONTENT_TYPES.includes(
      file.type as (typeof ANNOUNCEMENT_ATTACHMENT_CONTENT_TYPES)[number]
    )
  ) {
    return true;
  }

  return ['.gif', '.jpeg', '.jpg', '.pdf', '.png', '.webp'].includes(
    getFileExtension(file.name)
  );
}

export function AnnouncementAttachmentsField({
  attachments,
  disabled,
  onChange,
  onUploadAttachment,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const [error, setError] = useState<string | null>(null);
  const totalBytes = useMemo(
    () =>
      attachments.reduce(
        (total, attachment) => total + attachment.sizeBytes,
        0
      ),
    [attachments]
  );
  const uploadMutation = useMutation({
    mutationFn: onUploadAttachment,
  });
  const isUploading = uploadMutation.isPending;

  const uploadFiles = async (files: FileList | null) => {
    setError(null);
    if (!files || files.length === 0) return;

    const nextFiles = Array.from(files);
    if (attachments.length + nextFiles.length > MAX_ANNOUNCEMENT_ATTACHMENTS) {
      setError(
        t('attachments_count_error', {
          count: MAX_ANNOUNCEMENT_ATTACHMENTS.toString(),
        })
      );
      return;
    }

    const selectedTotal = nextFiles.reduce(
      (total, file) => total + file.size,
      0
    );
    if (totalBytes + selectedTotal > MAX_ANNOUNCEMENT_ATTACHMENT_BYTES) {
      setError(t('attachments_size_error'));
      return;
    }

    if (nextFiles.some((file) => !isAllowedFile(file))) {
      setError(t('attachments_type_error'));
      return;
    }

    try {
      const uploaded: TopicAnnouncementAttachmentDraft[] = [];
      for (const file of nextFiles) {
        uploaded.push(await uploadMutation.mutateAsync(file));
      }
      onChange([...attachments, ...uploaded]);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : t('attachments_upload_failed')
      );
    }
  };

  return (
    <div className="space-y-3 rounded-md border bg-background p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-dynamic-blue" />
            <h3 className="font-medium text-base">{t('attachments')}</h3>
          </div>
          <p className="text-muted-foreground text-sm">
            {t('attachments_helper')}
          </p>
        </div>
        <Badge variant="outline">
          {t('attachments_total', {
            count: attachments.length.toString(),
            total: formatBytes(totalBytes),
          })}
        </Badge>
      </div>

      <div
        className={cn(
          'relative rounded-md border border-dashed p-4 transition-colors',
          isUploading
            ? 'border-dynamic-blue/40 bg-dynamic-blue/10'
            : 'border-border bg-muted/30'
        )}
      >
        <Input
          accept={ANNOUNCEMENT_ATTACHMENT_ACCEPT}
          className="absolute inset-0 h-full cursor-pointer opacity-0"
          disabled={disabled || isUploading}
          id="topic-announcement-attachments"
          multiple
          onChange={(event) => {
            void uploadFiles(event.target.files);
            event.target.value = '';
          }}
          type="file"
        />
        <Label
          className="flex cursor-pointer items-center justify-center gap-2 text-sm"
          htmlFor="topic-announcement-attachments"
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {isUploading
            ? t('attachments_uploading')
            : t('attachments_upload_label')}
        </Label>
      </div>

      {error ? <p className="text-dynamic-red text-sm">{error}</p> : null}

      {attachments.length > 0 ? (
        <div className="grid gap-2">
          {attachments.map((attachment) => (
            <div
              className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2"
              key={`${attachment.storagePath}-${attachment.fileName}`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">
                    {attachment.fileName}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatBytes(attachment.sizeBytes)}
                  </p>
                </div>
              </div>
              <Button
                aria-label={t('attachments_remove')}
                disabled={disabled || isUploading}
                onClick={() =>
                  onChange(
                    attachments.filter(
                      (item) => item.storagePath !== attachment.storagePath
                    )
                  )
                }
                size="icon"
                type="button"
                variant="ghost"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
