'use client';

import { Loader2, Send } from '@tuturuuu/icons';
import {
  type TopicAnnouncementRecord,
  uploadTopicAnnouncementAttachment,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { PreviewableTopicAnnouncementAttachment } from './announcement-attachment-types';
import { AnnouncementAttachmentsField } from './announcement-attachments-field';
import { isTopicVideoUrlValid } from './announcement-form-state';
import { TopicExtrasFields } from './announcement-teacher-fields';
import { useTeacherTopicActions } from './use-teacher-topic-actions';

interface Props {
  announcement: TopicAnnouncementRecord;
  canSend: boolean;
  onClose: () => void;
  wsId: string;
}

/** Teacher topic form: course book, topic, page images, video link. */
export function TeacherTopicDialog({
  announcement,
  canSend,
  onClose,
  wsId,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const [courseBook, setCourseBook] = useState(announcement.course_book ?? '');
  const [topic, setTopic] = useState(announcement.topic ?? '');
  const [videoUrl, setVideoUrl] = useState(announcement.video_url ?? '');
  const [attachments, setAttachments] = useState<
    PreviewableTopicAnnouncementAttachment[]
  >([]);
  const { isPending, save } = useTeacherTopicActions({
    announcementId: announcement.id,
    onPersisted: () => setAttachments([]),
    onSaved: onClose,
    wsId,
  });
  const videoValid = isTopicVideoUrlValid(videoUrl);
  const hasTopic = topic.trim().length > 0;

  const submit = (send: boolean) =>
    save({
      attachments,
      courseBook,
      send,
      topic,
      videoUrl,
    });

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{announcement.title}</DialogTitle>
          <DialogDescription>
            {t('teacher_dialog_description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <TopicExtrasFields
            courseBook={courseBook}
            disabled={isPending}
            idPrefix="teacher-topic"
            onCourseBookChange={setCourseBook}
            onVideoUrlChange={setVideoUrl}
            videoUrl={videoUrl}
          />
          <div className="space-y-2">
            <Label htmlFor="teacher-topic-body">
              {t('teacher_topic_label')}
            </Label>
            <Textarea
              className="min-h-[200px]"
              disabled={isPending}
              id="teacher-topic-body"
              onChange={(event) => setTopic(event.target.value)}
              placeholder={t('teacher_topic_placeholder')}
              value={topic}
            />
          </div>
          {announcement.attachments.length > 0 ? (
            <p className="text-muted-foreground text-sm">
              {t('teacher_existing_attachments', {
                count: announcement.attachments.length,
              })}
            </p>
          ) : null}
          <AnnouncementAttachmentsField
            attachments={attachments}
            disabled={isPending}
            onChange={setAttachments}
            onUploadAttachment={(file) =>
              uploadTopicAnnouncementAttachment(wsId, file).then(
                (response) => response.data
              )
            }
          />
        </div>

        <DialogFooter className="gap-2">
          <Button
            disabled={isPending || !videoValid}
            onClick={() => submit(false)}
            type="button"
            variant="outline"
          >
            {t('teacher_save_draft')}
          </Button>
          {canSend ? (
            <Button
              className="gap-2"
              disabled={isPending || !videoValid || !hasTopic}
              onClick={() => submit(true)}
              type="button"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {t('teacher_save_and_send')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
