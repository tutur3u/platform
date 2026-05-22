'use client';

import { FileText, Mail, Paperclip } from '@tuturuuu/icons';
import type {
  TopicAnnouncementAttachmentDraft,
  TopicAnnouncementContact,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { EmailHtmlViewer } from '@/components/email/email-html-viewer';
import { renderTopicAnnouncementEmail } from '@/lib/topic-announcements-email';

export interface TopicAnnouncementPreviewData {
  attachments: TopicAnnouncementAttachmentDraft[];
  body?: string | null;
  class_label?: string | null;
  contacts: TopicAnnouncementContact[];
  day_label?: string | null;
  end_time?: string | null;
  place?: string | null;
  room?: string | null;
  session_date?: string | null;
  start_time?: string | null;
  title: string;
  topic: string;
}

interface Props {
  announcement: TopicAnnouncementPreviewData | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${value} B`;
}

export function TopicAnnouncementEmailPreviewDialog({
  announcement,
  onOpenChange,
  open,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const email = announcement
    ? renderTopicAnnouncementEmail({
        announcement,
        workspaceName: null,
      })
    : null;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-dynamic-blue" />
            {t('email_preview_title')}
          </DialogTitle>
          <DialogDescription>{t('email_preview_helper')}</DialogDescription>
        </DialogHeader>

        {announcement && email ? (
          <div className="grid min-h-0 gap-0 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <aside className="space-y-4 border-b p-4 lg:border-r lg:border-b-0">
              <div>
                <p className="text-muted-foreground text-xs uppercase">
                  {t('subject')}
                </p>
                <p className="mt-1 font-medium text-sm">{email.subject}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase">
                  {t('recipients')}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {announcement.contacts.map((contact) => (
                    <Badge key={contact.id} variant="outline">
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
                {announcement.attachments.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {announcement.attachments.map((attachment) => (
                      <div
                        className="rounded-md border bg-background p-2 text-sm"
                        key={attachment.storagePath}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
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

            <Tabs className="min-h-0 p-4" defaultValue="preview">
              <TabsList>
                <TabsTrigger value="preview">{t('preview')}</TabsTrigger>
                <TabsTrigger value="text">{t('text_version')}</TabsTrigger>
                <TabsTrigger value="source">{t('html_source')}</TabsTrigger>
              </TabsList>
              <TabsContent
                className="mt-3 h-[58vh] overflow-hidden rounded-md border"
                value="preview"
              >
                <EmailHtmlViewer content={email.html} />
              </TabsContent>
              <TabsContent
                className="mt-3 h-[58vh] overflow-auto rounded-md border bg-muted/30 p-4"
                value="text"
              >
                <pre className="whitespace-pre-wrap text-sm">{email.text}</pre>
              </TabsContent>
              <TabsContent
                className="mt-3 h-[58vh] overflow-auto rounded-md border bg-muted/30 p-4"
                value="source"
              >
                <pre className="whitespace-pre-wrap text-xs">{email.html}</pre>
              </TabsContent>
            </Tabs>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
