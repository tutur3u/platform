'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, Mail } from '@tuturuuu/icons';
import type {
  TopicAnnouncementAttachmentDraft,
  TopicAnnouncementContact,
  TopicAnnouncementPayload,
} from '@tuturuuu/internal-api';
import { previewTopicAnnouncementEmail } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { EmailHtmlViewer } from '@/components/email/email-html-viewer';
import {
  TopicAnnouncementPreviewSidebar,
  TopicAnnouncementPreviewState,
} from './topic-announcement-email-preview-parts';

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
  confirmLabel?: string;
  isConfirming?: boolean;
  onConfirm?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  wsId: string;
}

export function buildTopicAnnouncementPreviewPayload(
  announcement: TopicAnnouncementPreviewData
): TopicAnnouncementPayload {
  return {
    attachmentDrafts: announcement.attachments,
    body: announcement.body ?? '',
    classLabel: announcement.class_label ?? null,
    contactIds: announcement.contacts.map((contact) => contact.id),
    dayLabel: announcement.day_label ?? null,
    endTime: announcement.end_time ?? null,
    groupId: null,
    place: announcement.place ?? null,
    room: announcement.room ?? null,
    sessionDate: announcement.session_date ?? null,
    sourceType: 'manual',
    startTime: announcement.start_time ?? null,
    title: announcement.title,
    topic: announcement.topic,
  };
}

export function TopicAnnouncementEmailPreviewDialog({
  announcement,
  confirmLabel,
  isConfirming = false,
  onConfirm,
  onOpenChange,
  open,
  wsId,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const payload = announcement
    ? buildTopicAnnouncementPreviewPayload(announcement)
    : null;
  const previewQuery = useQuery({
    enabled: open && Boolean(payload),
    queryFn: () => previewTopicAnnouncementEmail(wsId, payload!),
    queryKey: ['topic-announcement-email-preview', wsId, payload],
  });
  const email = previewQuery.data?.data ?? null;
  const canConfirm = Boolean(email) && !previewQuery.isError && !isConfirming;

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

        {announcement ? (
          <div className="grid min-h-0 gap-0 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <TopicAnnouncementPreviewSidebar
              attachments={announcement.attachments}
              contacts={announcement.contacts}
              subject={email?.subject ?? announcement.title}
            />

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
                <TopicAnnouncementPreviewState
                  error={previewQuery.isError}
                  isLoading={previewQuery.isLoading}
                >
                  {email ? <EmailHtmlViewer content={email.html} /> : null}
                </TopicAnnouncementPreviewState>
              </TabsContent>
              <TabsContent
                className="mt-3 h-[58vh] overflow-auto rounded-md border bg-muted/30 p-4"
                value="text"
              >
                <TopicAnnouncementPreviewState
                  error={previewQuery.isError}
                  isLoading={previewQuery.isLoading}
                >
                  <pre className="whitespace-pre-wrap text-sm">
                    {email?.text}
                  </pre>
                </TopicAnnouncementPreviewState>
              </TabsContent>
              <TabsContent
                className="mt-3 h-[58vh] overflow-auto rounded-md border bg-muted/30 p-4"
                value="source"
              >
                <TopicAnnouncementPreviewState
                  error={previewQuery.isError}
                  isLoading={previewQuery.isLoading}
                >
                  <pre className="whitespace-pre-wrap text-xs">
                    {email?.html}
                  </pre>
                </TopicAnnouncementPreviewState>
              </TabsContent>
            </Tabs>
          </div>
        ) : null}

        {onConfirm ? (
          <DialogFooter className="border-t px-6 py-4">
            <Button
              disabled={isConfirming}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t('cancel')}
            </Button>
            <Button disabled={!canConfirm} onClick={onConfirm} type="button">
              {isConfirming ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {confirmLabel ?? t('send_now')}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
