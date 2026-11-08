'use client';

import { FileText } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type { PreviewableTopicAnnouncementAttachment } from './announcement-attachment-types';

function isImageAttachment(attachment: PreviewableTopicAnnouncementAttachment) {
  return attachment.contentType.startsWith('image/');
}

function isPdfAttachment(attachment: PreviewableTopicAnnouncementAttachment) {
  return attachment.contentType === 'application/pdf';
}

export function AnnouncementAttachmentPreview({
  attachment,
  className,
  compact = false,
}: {
  attachment: PreviewableTopicAnnouncementAttachment;
  className?: string;
  compact?: boolean;
}) {
  if (attachment.previewUrl && isImageAttachment(attachment)) {
    return (
      <img
        alt={attachment.fileName}
        className={cn(
          'shrink-0 rounded-md border object-cover',
          compact ? 'h-10 w-10' : 'h-28 w-full',
          className
        )}
        src={attachment.previewUrl}
      />
    );
  }

  if (attachment.previewUrl && isPdfAttachment(attachment)) {
    if (compact) {
      return (
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-muted font-semibold text-[10px] text-muted-foreground',
            className
          )}
        >
          PDF
        </div>
      );
    }

    return (
      <object
        aria-label={attachment.fileName}
        className={cn('h-40 w-full rounded-md border bg-muted', className)}
        data={attachment.previewUrl}
        type="application/pdf"
      >
        <div className="flex h-full items-center justify-center font-medium text-muted-foreground text-sm">
          PDF
        </div>
      </object>
    );
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground',
        compact ? 'h-10 w-10' : 'h-28 w-full',
        className
      )}
    >
      <FileText className={compact ? 'h-4 w-4' : 'h-6 w-6'} />
    </div>
  );
}
