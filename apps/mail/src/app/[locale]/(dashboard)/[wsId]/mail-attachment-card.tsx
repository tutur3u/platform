'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, Paperclip } from '@tuturuuu/icons';
import {
  getMailAttachmentText,
  type MailAttachment,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  mailAttachmentPreviewType,
  mailAttachmentPreviewUrl,
} from '@/lib/mail/attachment-preview';

export function MailAttachmentCard({
  attachment,
}: {
  attachment: MailAttachment;
}) {
  const t = useTranslations('mail');
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const preview = mailAttachmentPreviewType(
    attachment.contentType,
    attachment.filename
  );
  const url = attachment.protectedUrl;
  const textPreview = useQuery({
    queryKey: ['mail', 'attachment-text', url],
    queryFn: ({ signal }) => getMailAttachmentText(url!, signal),
    enabled: open && preview?.kind === 'text' && Boolean(url),
    retry: false,
    gcTime: 0,
  });
  const previewUrl = url ? mailAttachmentPreviewUrl(url) : undefined;
  return (
    <>
      <div className="flex min-w-0 items-center gap-2 rounded-xl bg-foreground/[0.045] p-3 text-sm">
        <Paperclip className="size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          {preview && url ? (
            <button
              className="block max-w-full truncate text-left font-medium underline-offset-4 hover:underline"
              onClick={() => {
                setFailed(false);
                setOpen(true);
              }}
              type="button"
              aria-label={t('preview_attachment', {
                filename: attachment.filename,
              })}
            >
              {attachment.filename}
            </button>
          ) : (
            <span className="block truncate">{attachment.filename}</span>
          )}
          <span className="text-muted-foreground text-xs">
            {Math.ceil(attachment.sizeBytes / 1024)} KB
          </span>
        </div>
        {url ? (
          <Button asChild size="icon" variant="ghost">
            <a
              download
              href={url}
              aria-label={t('download_attachment', {
                filename: attachment.filename,
              })}
            >
              <Download className="size-4" />
            </a>
          </Button>
        ) : null}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90dvh] min-w-0 flex-col sm:max-w-5xl">
          <DialogHeader className="min-w-0 pr-6">
            <DialogTitle className="break-all">
              {attachment.filename}
            </DialogTitle>
            <DialogDescription>{t('attachment_preview')}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-auto rounded-lg bg-muted/30">
            {failed || (preview?.kind === 'text' && textPreview.isError) ? (
              <p className="p-6 text-muted-foreground text-sm">
                {t('attachment_preview_failed')}
              </p>
            ) : preview?.kind === 'image' ? (
              // biome-ignore lint/performance/noImgElement: Protected original attachments are not public optimized images.
              <img
                className="mx-auto max-h-[65dvh] max-w-full object-contain"
                src={previewUrl}
                alt={attachment.filename}
                onError={() => setFailed(true)}
              />
            ) : preview?.kind === 'video' ? (
              <video
                className="mx-auto max-h-[65dvh] max-w-full"
                controls
                preload="metadata"
                src={previewUrl}
                onError={() => setFailed(true)}
              />
            ) : preview?.kind === 'audio' ? (
              <audio
                className="w-full"
                controls
                preload="metadata"
                src={previewUrl}
                onError={() => setFailed(true)}
              />
            ) : preview?.kind === 'text' ? (
              textPreview.isPending ? (
                <p className="p-6 text-muted-foreground text-sm">
                  {t('loading')}
                </p>
              ) : (
                <pre className="max-h-[60dvh] whitespace-pre-wrap break-words p-4 font-mono text-sm leading-6">
                  {textPreview.data}
                </pre>
              )
            ) : null}
          </div>
          {url ? (
            <Button asChild className="self-end" variant="secondary">
              <a download href={url}>
                <Download className="size-4" />
                {t('download')}
              </a>
            </Button>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
