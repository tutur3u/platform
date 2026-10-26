'use client';

import type { TopicAnnouncementAttachmentDraft } from '@tuturuuu/internal-api';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import type { Dispatch, SetStateAction } from 'react';
import { AnnouncementAttachmentsField } from './announcement-attachments-field';
import {
  type AnnouncementFormValues,
  NO_TEACHER,
} from './announcement-form-state';
import { TopicExtrasFields } from './announcement-teacher-fields';

interface Props {
  disabled: boolean;
  form: AnnouncementFormValues;
  onUploadAttachment: (file: File) => Promise<TopicAnnouncementAttachmentDraft>;
  setForm: Dispatch<SetStateAction<AnnouncementFormValues>>;
}

export function AnnouncementFormMessageStep({
  disabled,
  form,
  onUploadAttachment,
  setForm,
}: Props) {
  const t = useTranslations('ws-topic-announcements');

  return (
    <div className="space-y-4 rounded-md border bg-background p-4">
      <div>
        <h3 className="font-medium text-base">{t('announcement_message')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('announcement_message_helper')}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="topic-body">{t('topic_primary_label')}</Label>
        <Textarea
          className="min-h-[280px]"
          id="topic-body"
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              topic: event.target.value,
            }))
          }
          placeholder={t('topic_primary_placeholder')}
          value={form.topic}
        />
        {form.teacherWorkspaceUserId !== NO_TEACHER && !form.topic.trim() ? (
          <p className="text-muted-foreground text-xs">
            {t('topic_pending_teacher')}
          </p>
        ) : null}
      </div>
      <TopicExtrasFields
        courseBook={form.courseBook}
        disabled={disabled}
        idPrefix="topic"
        onCourseBookChange={(courseBook) =>
          setForm((current) => ({ ...current, courseBook }))
        }
        onVideoUrlChange={(videoUrl) =>
          setForm((current) => ({ ...current, videoUrl }))
        }
        videoUrl={form.videoUrl}
      />
      <AnnouncementAttachmentsField
        attachments={form.attachmentDrafts}
        disabled={disabled}
        onChange={(attachmentDrafts) =>
          setForm((current) => ({ ...current, attachmentDrafts }))
        }
        onUploadAttachment={onUploadAttachment}
      />
    </div>
  );
}
