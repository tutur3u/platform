'use client';

import { Eye } from '@tuturuuu/icons';
import type { TopicAnnouncementContact } from '@tuturuuu/internal-api';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AnnouncementDeliveryOptions } from './announcement-delivery-options';
import { AnnouncementEmailPreviewPanel } from './announcement-email-preview-panel';
import type {
  AnnouncementDeliveryMode,
  AnnouncementFormValues,
} from './announcement-form-state';
import { TopicAnnouncementEmailPreviewDialog } from './announcements/topic-announcement-email-preview-dialog';

interface Props {
  canSend: boolean;
  contacts: TopicAnnouncementContact[];
  deliveryMode: AnnouncementDeliveryMode;
  form: AnnouncementFormValues;
  groups: UserGroup[];
  onTimezoneRequired: () => void;
  scheduledAt: Date | undefined;
  schedulingTimezone: string | null;
  setDeliveryMode: (mode: AnnouncementDeliveryMode) => void;
  setScheduledAt: (date: Date | undefined) => void;
  wsId: string;
}

export function AnnouncementFormReviewStep({
  canSend,
  contacts,
  deliveryMode,
  form,
  groups,
  onTimezoneRequired,
  scheduledAt,
  schedulingTimezone,
  setDeliveryMode,
  setScheduledAt,
  wsId,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const selectedContacts = contacts.filter((contact) =>
    form.contactIds.includes(contact.id)
  );
  const groupName =
    groups.find((group) => group.id === form.groupId)?.name ?? t('none');
  const classContext = form.classLabel || groupName;
  const timeRange = [form.startTime, form.endTime].filter(Boolean).join(' - ');
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewAnnouncement = {
    attachments: form.attachmentDrafts,
    body: null,
    class_label: classContext === t('none') ? null : classContext,
    contacts: selectedContacts,
    day_label: form.dayLabel || null,
    end_time: form.endTime || null,
    place: form.place || null,
    room: form.room || null,
    session_date: form.sessionDate || null,
    start_time: form.startTime || null,
    title: form.title,
    topic: form.topic,
  };

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-4 rounded-md border bg-background p-4">
          <div>
            <h3 className="font-medium text-base">
              {t('announcement_review_title')}
            </h3>
            <p className="text-muted-foreground text-sm">
              {t('announcement_review_helper')}
            </p>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <ReviewItem label={t('announcement_title')} value={form.title} />
            <ReviewItem label={t('classLabel')} value={classContext} />
            <ReviewItem
              label={t('day_label')}
              value={form.dayLabel || t('none')}
            />
            <ReviewItem
              label={t('session_date')}
              value={form.sessionDate || t('none')}
            />
            <ReviewItem label={t('startTime')} value={timeRange || t('none')} />
            <ReviewItem
              label={t('place')}
              value={
                [form.room, form.place].filter(Boolean).join(' / ') || t('none')
              }
            />
            <ReviewItem
              label={t('recipients')}
              value={selectedContacts.length.toString()}
            />
            <ReviewItem
              label={t('attachments')}
              value={form.attachmentDrafts.length.toString()}
            />
          </dl>
          <div className="rounded-md border bg-foreground/5 p-3">
            <p className="font-medium text-sm">{t('announcement_message')}</p>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground text-sm">
              {form.topic}
            </p>
          </div>
          <Button
            className="gap-2"
            onClick={() => setPreviewOpen(true)}
            type="button"
            variant="outline"
          >
            <Eye className="h-4 w-4" />
            {t('preview_announcement')}
          </Button>
        </div>

        <div className="grid min-h-[32rem] gap-4">
          <AnnouncementEmailPreviewPanel
            announcement={previewAnnouncement}
            onOpenFullPreview={() => setPreviewOpen(true)}
            wsId={wsId}
          />
          <AnnouncementDeliveryOptions
            canSend={canSend}
            deliveryMode={deliveryMode}
            onTimezoneRequired={onTimezoneRequired}
            scheduledAt={scheduledAt}
            schedulingTimezone={schedulingTimezone}
            setDeliveryMode={setDeliveryMode}
            setScheduledAt={setScheduledAt}
          />
        </div>
      </div>

      <TopicAnnouncementEmailPreviewDialog
        announcement={previewAnnouncement}
        onOpenChange={setPreviewOpen}
        open={previewOpen}
        wsId={wsId}
      />
    </>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
