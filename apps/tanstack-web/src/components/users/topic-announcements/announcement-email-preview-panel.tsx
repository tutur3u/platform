'use client';

import { useQuery } from '@tanstack/react-query';
import { Eye, Loader2, MailWarning } from '@tuturuuu/icons';
import { previewTopicAnnouncementEmail } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { EmailHtmlViewer } from '@/components/infrastructure/email-templates/email-html-viewer';
import {
  buildTopicAnnouncementPreviewPayload,
  type TopicAnnouncementPreviewData,
} from './announcements/topic-announcement-email-preview-dialog';

interface Props {
  announcement: TopicAnnouncementPreviewData;
  onOpenFullPreview: () => void;
  wsId: string;
}

export function AnnouncementEmailPreviewPanel({
  announcement,
  onOpenFullPreview,
  wsId,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const payload = buildTopicAnnouncementPreviewPayload(announcement);
  const previewQuery = useQuery({
    queryFn: () => previewTopicAnnouncementEmail(wsId, payload),
    queryKey: ['topic-announcement-email-preview', wsId, payload],
  });
  const email = previewQuery.data?.data ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{t('email_preview_live')}</Badge>
            {announcement.attachments.length > 0 ? (
              <Badge variant="secondary">
                {t('attachments_count', {
                  count: announcement.attachments.length.toString(),
                })}
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 truncate font-medium text-sm">
            {email?.subject ?? announcement.title}
          </p>
        </div>
        <Button
          className="gap-2"
          onClick={onOpenFullPreview}
          size="sm"
          type="button"
          variant="outline"
        >
          <Eye className="h-4 w-4" />
          {t('email_preview_open_full')}
        </Button>
      </div>

      <div className="min-h-80 flex-1 overflow-hidden bg-muted/30">
        {previewQuery.isLoading ? (
          <div className="flex h-full min-h-80 items-center justify-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('email_preview_loading')}
          </div>
        ) : previewQuery.isError ? (
          <div className="flex h-full min-h-80 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground text-sm">
            <MailWarning className="h-5 w-5 text-dynamic-orange" />
            {t('email_preview_failed')}
          </div>
        ) : email ? (
          <EmailHtmlViewer content={email.html} />
        ) : null}
      </div>
    </div>
  );
}
