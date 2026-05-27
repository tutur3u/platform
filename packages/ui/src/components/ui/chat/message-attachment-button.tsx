'use client';

import { Download, FileText } from '@tuturuuu/icons';
import type { ChatAttachment } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { formatFileSize } from './utils';

export function MessageAttachmentButton({
  attachment,
  onOpenAttachment,
}: {
  attachment: ChatAttachment;
  onOpenAttachment?: (attachment: ChatAttachment) => void;
}) {
  const t = useTranslations('chat');

  return (
    <button
      className="flex min-w-0 items-center gap-2 rounded-md border bg-background/70 px-2 py-2 text-left transition-colors hover:bg-accent"
      onClick={() => onOpenAttachment?.(attachment)}
      type="button"
    >
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {attachment.filename}
        </span>
        <span className="block text-muted-foreground text-xs">
          {attachment.sizeBytes
            ? formatFileSize(attachment.sizeBytes)
            : t('attachment')}
        </span>
      </span>
      <Download className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
