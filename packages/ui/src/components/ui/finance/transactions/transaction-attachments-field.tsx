'use client';

import { File, Paperclip, Upload, X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { formatBytes } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useId, useRef } from 'react';

export type TransactionAttachmentStatus =
  | 'pending'
  | 'uploading'
  | 'uploaded'
  | 'error';

export interface TransactionAttachmentDraft {
  id: string;
  file: globalThis.File;
  status: TransactionAttachmentStatus;
}

interface TransactionAttachmentsFieldProps {
  attachments: TransactionAttachmentDraft[];
  disabled?: boolean;
  maxFileCount?: number;
  maxSizeBytes?: number;
  onChange: (attachments: TransactionAttachmentDraft[]) => void;
}

const ACCEPTED_ATTACHMENT_TYPES = [
  'image/*',
  'application/pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  '.md',
  '.zip',
  '.json',
].join(',');

function createAttachmentDraft(file: globalThis.File) {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${file.name}`;

  return {
    id,
    file,
    status: 'pending',
  } satisfies TransactionAttachmentDraft;
}

export function TransactionAttachmentsField({
  attachments,
  disabled = false,
  maxFileCount = 10,
  maxSizeBytes = 50 * 1024 * 1024,
  onChange,
}: TransactionAttachmentsFieldProps) {
  const t = useTranslations();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

    const availableSlots = Math.max(maxFileCount - attachments.length, 0);
    if (availableSlots <= 0) {
      toast.error(t('transaction-data-table.attachment_limit_reached'));
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      return;
    }

    const selectedFiles = Array.from(files);
    const sizeAcceptedFiles = selectedFiles.filter(
      (file) => file.size <= maxSizeBytes
    );
    const acceptedFiles = sizeAcceptedFiles.slice(0, availableSlots);
    const rejectedCount = selectedFiles.length - acceptedFiles.length;

    if (rejectedCount > 0) {
      toast.error(
        t('transaction-data-table.attachment_rejected', {
          count: rejectedCount,
          size: formatBytes(maxSizeBytes),
        })
      );
    }

    const nextAttachments = [
      ...attachments,
      ...acceptedFiles.map(createAttachmentDraft),
    ];

    onChange(nextAttachments);

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const removeAttachment = (attachmentId: string) => {
    onChange(
      attachments.filter((attachment) => attachment.id !== attachmentId)
    );
  };

  const selectedCount = attachments.length;
  const isFull = selectedCount >= maxFileCount;

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-medium text-sm">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            {t('transaction-data-table.attachments')}
          </div>
          <p className="text-muted-foreground text-xs">
            {t('transaction-data-table.attachments_hint', {
              count: maxFileCount,
              size: formatBytes(maxSizeBytes),
            })}
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0">
          {t('transaction-data-table.attachment_count', {
            count: selectedCount,
          })}
        </Badge>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        accept={ACCEPTED_ATTACHMENT_TYPES}
        className="sr-only"
        disabled={disabled || isFull}
        onChange={(event) => handleFilesSelected(event.target.files)}
      />

      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={disabled || isFull}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-4 w-4" />
        {t('transaction-data-table.add_attachments')}
      </Button>

      {attachments.length > 0 ? (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-3 rounded-md border bg-background px-3 py-2"
            >
              <File className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">
                  {attachment.file.name}
                </p>
                <p className="text-muted-foreground text-xs">
                  {attachment.status === 'pending' &&
                    formatBytes(attachment.file.size)}
                  {attachment.status === 'uploading' &&
                    t('transaction-data-table.attachment_uploading')}
                  {attachment.status === 'uploaded' &&
                    t('transaction-data-table.attachment_uploaded')}
                  {attachment.status === 'error' &&
                    t('transaction-data-table.attachment_upload_failed')}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                disabled={disabled || attachment.status === 'uploading'}
                onClick={() => removeAttachment(attachment.id)}
                title={t('transaction-data-table.remove_attachment')}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">
                  {t('transaction-data-table.remove_attachment')}
                </span>
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-4 text-center text-muted-foreground text-sm">
          {t('transaction-data-table.attachments_empty')}
        </div>
      )}
    </div>
  );
}
