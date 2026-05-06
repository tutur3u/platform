'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Download,
  ExternalLink,
  File,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  RefreshCw,
  Upload,
  Video,
  X,
} from '@tuturuuu/icons';
import {
  createWorkspaceStorageSignedUrl,
  type WorkspaceStorageListItem,
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
import { Progress } from '@tuturuuu/ui/progress';
import { toast } from '@tuturuuu/ui/sonner';
import { cn, formatBytes } from '@tuturuuu/utils/format';
import { joinPath } from '@tuturuuu/utils/path-helper';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';

export type TransactionAttachmentStatus =
  | 'pending'
  | 'uploading'
  | 'uploaded'
  | 'error';

export interface TransactionAttachmentDraft {
  id: string;
  file: globalThis.File;
  progress?: number;
  status: TransactionAttachmentStatus;
}

interface TransactionAttachmentsFieldProps {
  attachments: TransactionAttachmentDraft[];
  disabled?: boolean;
  existingAttachments?: WorkspaceStorageListItem[];
  existingAttachmentsError?: boolean;
  existingAttachmentsLoading?: boolean;
  maxFileCount?: number;
  maxSizeBytes?: number;
  onChange: (attachments: TransactionAttachmentDraft[]) => void;
  onRefreshExisting?: () => void;
  transactionId?: string;
  wsId?: string;
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

const imageExtensions = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'svg',
  'webp',
  'bmp',
  'ico',
]);
const videoExtensions = new Set(['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv']);
const textExtensions = new Set(['txt', 'md', 'json', 'xml', 'csv', 'log']);

function createAttachmentDraft(file: globalThis.File) {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${file.name}`;

  return {
    id,
    file,
    progress: 0,
    status: 'pending',
  } satisfies TransactionAttachmentDraft;
}

function getAttachmentSize(attachment: WorkspaceStorageListItem) {
  const size = attachment.metadata?.size;
  return typeof size === 'number' && Number.isFinite(size) ? size : null;
}

function getAttachmentMimeType(attachment: WorkspaceStorageListItem) {
  const mimeType =
    attachment.metadata?.mimetype ?? attachment.metadata?.mimeType;
  return typeof mimeType === 'string' ? mimeType : '';
}

function getAttachmentExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function getAttachmentKind(attachment: WorkspaceStorageListItem) {
  const mimeType = getAttachmentMimeType(attachment);
  const extension = getAttachmentExtension(attachment.name);

  if (mimeType.startsWith('image/') || imageExtensions.has(extension)) {
    return 'image';
  }
  if (mimeType.startsWith('video/') || videoExtensions.has(extension)) {
    return 'video';
  }
  if (mimeType === 'application/pdf' || extension === 'pdf') {
    return 'pdf';
  }
  if (mimeType.startsWith('text/') || textExtensions.has(extension)) {
    return 'text';
  }

  return 'other';
}

function AttachmentIcon({
  attachment,
}: {
  attachment?: WorkspaceStorageListItem;
}) {
  const kind = attachment ? getAttachmentKind(attachment) : 'other';

  if (kind === 'image') {
    return <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />;
  }

  if (kind === 'video') {
    return <Video className="h-4 w-4 shrink-0 text-muted-foreground" />;
  }

  if (kind === 'pdf' || kind === 'text') {
    return <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />;
  }

  return <File className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function TransactionAttachmentPreviewDialog({
  attachment,
  onOpenChange,
  open,
  transactionId,
  wsId,
}: {
  attachment: WorkspaceStorageListItem | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  transactionId?: string;
  wsId?: string;
}) {
  const t = useTranslations();
  const relativePath =
    attachment?.name && transactionId
      ? joinPath('finance', 'transactions', transactionId, attachment.name)
      : '';
  const attachmentKind = attachment ? getAttachmentKind(attachment) : 'other';
  const attachmentSize = attachment ? getAttachmentSize(attachment) : null;

  const signedUrlQuery = useQuery({
    queryKey: ['finance-transaction-attachment-url', wsId, relativePath],
    queryFn: async () => {
      if (!wsId || !relativePath) {
        throw new Error('Missing attachment path');
      }

      return createWorkspaceStorageSignedUrl(wsId, relativePath, 3600);
    },
    enabled: open && !!wsId && !!relativePath,
    staleTime: 50 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });

  const textContentQuery = useQuery({
    queryKey: ['finance-transaction-attachment-text', signedUrlQuery.data],
    queryFn: async () => {
      if (!signedUrlQuery.data) {
        throw new Error('Missing signed URL');
      }

      const response = await fetch(signedUrlQuery.data, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to load file preview');
      }

      return response.text();
    },
    enabled: open && attachmentKind === 'text' && !!signedUrlQuery.data,
    retry: 1,
  });

  const signedUrl = signedUrlQuery.data ?? null;
  const isPreviewLoading =
    signedUrlQuery.isPending ||
    (attachmentKind === 'text' && textContentQuery.isPending);

  const handleDownload = async () => {
    if (!attachment?.name || !signedUrl) {
      return;
    }

    try {
      const response = await fetch(signedUrl, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to download file');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('ws-transactions.failed_to_download_file'));
    }
  };

  const renderPreview = () => {
    const previewClass =
      'flex min-h-[45vh] items-center justify-center overflow-hidden rounded-md border bg-muted/20';

    if (isPreviewLoading) {
      return (
        <div className={previewClass}>
          <div className="flex flex-col items-center gap-3 text-muted-foreground text-sm">
            <Loader2 className="h-8 w-8 animate-spin" />
            {t('common.loading')}
          </div>
        </div>
      );
    }

    if (!signedUrl) {
      return (
        <div className={previewClass}>
          <div className="space-y-2 text-center text-muted-foreground text-sm">
            <FileText className="mx-auto h-10 w-10" />
            {t('transaction-data-table.attachment_preview_unavailable')}
          </div>
        </div>
      );
    }

    if (attachmentKind === 'image') {
      return (
        <div className={cn(previewClass, 'p-2')}>
          <Image
            src={signedUrl}
            alt={attachment?.name ?? t('common.preview')}
            width={1200}
            height={900}
            unoptimized
            className="max-h-[65vh] max-w-full rounded-md object-contain"
          />
        </div>
      );
    }

    if (attachmentKind === 'video') {
      return (
        <div className={cn(previewClass, 'p-2')}>
          <video
            src={signedUrl}
            controls
            className="max-h-[65vh] w-full rounded-md object-contain"
            preload="metadata"
          >
            <track kind="captions" srcLang="en" label="English" />
            {t('transaction-data-table.attachment_preview_unavailable')}
          </video>
        </div>
      );
    }

    if (attachmentKind === 'pdf') {
      return (
        <div className={cn(previewClass, 'h-[65vh] p-0')}>
          <iframe
            src={signedUrl}
            title={attachment?.name ?? t('common.preview')}
            className="h-full w-full"
          />
        </div>
      );
    }

    if (attachmentKind === 'text') {
      return (
        <div className={cn(previewClass, 'block max-h-[65vh] overflow-auto')}>
          <pre className="whitespace-pre-wrap p-4 font-mono text-sm">
            {textContentQuery.data ||
              t('transaction-data-table.attachment_preview_unavailable')}
          </pre>
        </div>
      );
    }

    return (
      <div className={previewClass}>
        <div className="space-y-4 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">
            {t('transaction-data-table.attachment_preview_unavailable')}
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={!signedUrl}
            onClick={() => signedUrl && window.open(signedUrl, '_blank')}
          >
            <ExternalLink className="h-4 w-4" />
            {t('common.view')}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate text-left">
            {attachment?.name ?? t('common.preview')}
          </DialogTitle>
          <DialogDescription className="text-left">
            {attachment ? (
              <span>
                {attachmentSize !== null
                  ? formatBytes(attachmentSize)
                  : t('transaction-data-table.attachments')}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {renderPreview()}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!signedUrl || isPreviewLoading}
            onClick={() => signedUrl && window.open(signedUrl, '_blank')}
          >
            <ExternalLink className="h-4 w-4" />
            {t('common.view')}
          </Button>
          <Button
            type="button"
            disabled={!signedUrl || isPreviewLoading}
            onClick={handleDownload}
          >
            <Download className="h-4 w-4" />
            {t('common.download')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TransactionAttachmentsField({
  attachments,
  disabled = false,
  existingAttachments = [],
  existingAttachmentsError = false,
  existingAttachmentsLoading = false,
  maxFileCount = 10,
  maxSizeBytes = 50 * 1024 * 1024,
  onChange,
  onRefreshExisting,
  transactionId,
  wsId,
}: TransactionAttachmentsFieldProps) {
  const t = useTranslations();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewAttachment, setPreviewAttachment] =
    useState<WorkspaceStorageListItem | null>(null);

  const totalAttachmentCount = attachments.length + existingAttachments.length;
  const selectedCount = attachments.length;
  const availableSlots = Math.max(maxFileCount - totalAttachmentCount, 0);
  const isFull = totalAttachmentCount >= maxFileCount;

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

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
            count: totalAttachmentCount,
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
          {attachments.map((attachment) => {
            const uploadProgress = attachment.progress ?? 0;

            return (
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
                      t('transaction-data-table.attachment_upload_progress', {
                        percent: uploadProgress,
                      })}
                    {attachment.status === 'uploaded' &&
                      t('transaction-data-table.attachment_uploaded')}
                    {attachment.status === 'error' &&
                      t('transaction-data-table.attachment_upload_failed')}
                  </p>
                  {attachment.status === 'uploading' ? (
                    <Progress value={uploadProgress} className="mt-2 h-1.5" />
                  ) : null}
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
            );
          })}
        </div>
      ) : null}

      {transactionId ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium text-sm">
              {t('transaction-data-table.attachments_existing_title')}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5"
              disabled={existingAttachmentsLoading}
              onClick={onRefreshExisting}
            >
              <RefreshCw
                className={cn(
                  'h-3.5 w-3.5',
                  existingAttachmentsLoading && 'animate-spin'
                )}
              />
              {t('common.refresh')}
            </Button>
          </div>

          {existingAttachmentsLoading ? (
            <div className="flex items-center gap-2 rounded-md border border-dashed p-4 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('common.loading')}
            </div>
          ) : existingAttachmentsError ? (
            <div className="rounded-md border border-dashed p-4 text-destructive text-sm">
              {t('transaction-data-table.attachments_existing_error')}
            </div>
          ) : existingAttachments.length > 0 ? (
            <div className="space-y-2">
              {existingAttachments.map((attachment) => {
                const size = getAttachmentSize(attachment);

                return (
                  <button
                    key={attachment.id ?? attachment.name}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-md border bg-background px-3 py-2 text-left transition-colors hover:bg-muted/50"
                    onClick={() => setPreviewAttachment(attachment)}
                  >
                    <AttachmentIcon attachment={attachment} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-sm">
                        {attachment.name}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {size !== null
                          ? formatBytes(size)
                          : t('transaction-data-table.attachments')}
                      </p>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {t('common.preview')}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : selectedCount === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-center text-muted-foreground text-sm">
              {t('transaction-data-table.attachments_existing_empty')}
            </div>
          ) : null}
        </div>
      ) : attachments.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center text-muted-foreground text-sm">
          {t('transaction-data-table.attachments_empty')}
        </div>
      ) : null}

      <TransactionAttachmentPreviewDialog
        attachment={previewAttachment}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewAttachment(null);
          }
        }}
        open={!!previewAttachment}
        transactionId={transactionId}
        wsId={wsId}
      />
    </div>
  );
}
