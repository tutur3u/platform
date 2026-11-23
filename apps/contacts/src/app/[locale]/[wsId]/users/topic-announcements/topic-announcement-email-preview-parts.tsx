'use client';

import { AlertTriangle, Paperclip } from '@tuturuuu/icons';
import type { TopicAnnouncementContact } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import {
  LoadingRegion,
  SkeletonLine,
  SkeletonText,
} from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { AnnouncementAttachmentPreview } from './announcement-attachment-preview';
import type { PreviewableTopicAnnouncementAttachment } from './announcement-attachment-types';

function formatBytes(value: number) {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${value} B`;
}

export function TopicAnnouncementPreviewSidebar({
  attachments,
  contacts,
  subject,
}: {
  attachments: PreviewableTopicAnnouncementAttachment[];
  contacts: TopicAnnouncementContact[];
  subject: string;
}) {
  const t = useTranslations('ws-topic-announcements');

  return (
    <aside className="min-h-0 space-y-4 overflow-y-auto border-b p-4 lg:border-r lg:border-b-0 lg:p-5">
      <div>
        <p className="text-muted-foreground text-xs uppercase">
          {t('subject')}
        </p>
        <p className="mt-1 break-words font-medium text-sm">{subject}</p>
      </div>
      <div>
        <p className="text-muted-foreground text-xs uppercase">
          {t('recipients')}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {contacts.map((contact) => (
            <Badge
              className="max-w-full truncate"
              key={contact.id}
              title={contact.email}
              variant="outline"
            >
              {contact.email}
            </Badge>
          ))}
        </div>
      </div>
      <div>
        <p className="flex items-center gap-1 text-muted-foreground text-xs uppercase">
          <Paperclip className="h-3.5 w-3.5" />
          {t('attachments')}
        </p>
        {attachments.length > 0 ? (
          <div className="mt-2 space-y-2">
            {attachments.map((attachment) => (
              <div
                className="rounded-md border bg-background p-2 text-sm"
                key={attachment.storagePath}
              >
                <AnnouncementAttachmentPreview
                  attachment={attachment}
                  className="mb-2"
                />
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">
                    {attachment.fileName}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground text-xs">
                  {formatBytes(attachment.sizeBytes)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-muted-foreground text-sm">
            {t('attachments_none')}
          </p>
        )}
      </div>
    </aside>
  );
}

export function TopicAnnouncementPreviewState({
  children,
  error,
  isLoading,
}: {
  children: ReactNode;
  error: boolean;
  isLoading: boolean;
}) {
  const t = useTranslations('ws-topic-announcements');

  if (isLoading) {
    return (
      <LoadingRegion
        srLabel={t('email_preview_loading')}
        className="space-y-4 p-6"
      >
        <SkeletonLine size="lg" barClassName="w-1/2" />
        <SkeletonText lines={6} />
      </LoadingRegion>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground text-sm">
        <AlertTriangle className="h-5 w-5 text-dynamic-orange" />
        {t('email_preview_failed')}
      </div>
    );
  }

  return <>{children}</>;
}
