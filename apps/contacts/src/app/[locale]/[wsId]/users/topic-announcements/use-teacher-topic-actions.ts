'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  sendTopicAnnouncement,
  updateTopicAnnouncement,
} from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import {
  type PreviewableTopicAnnouncementAttachment,
  toTopicAnnouncementAttachmentDraft,
} from './announcement-attachment-types';

export const TEACHER_TOPICS_QUERY_KEY = 'teacher-topic-announcements';

export interface TeacherTopicSaveInput {
  attachments: PreviewableTopicAnnouncementAttachment[];
  courseBook: string;
  send: boolean;
  topic: string;
  videoUrl: string;
}

/**
 * Saves a teacher's topic and optionally sends it. `onPersisted` runs as soon
 * as the save succeeds (before any send), so the dialog can drop the
 * attachment drafts it just saved: a retry after a failed send then cannot
 * attach (and email) the same files twice.
 */
export function useTeacherTopicActions({
  announcementId,
  onPersisted,
  onSaved,
  wsId,
}: {
  announcementId: string;
  onPersisted?: () => void;
  onSaved: () => void;
  wsId: string;
}) {
  const t = useTranslations('ws-topic-announcements');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: TeacherTopicSaveInput) => {
      await updateTopicAnnouncement(wsId, announcementId, {
        ...(input.attachments.length > 0
          ? {
              attachmentDrafts: input.attachments.map(
                toTopicAnnouncementAttachmentDraft
              ),
            }
          : {}),
        courseBook: input.courseBook.trim() || null,
        topic: input.topic.trim(),
        videoUrl: input.videoUrl.trim() || null,
      });
      onPersisted?.();
      if (input.send) {
        await sendTopicAnnouncement(wsId, announcementId);
      }
      return input.send;
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('teacher_save_failed')
      ),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: [TEACHER_TOPICS_QUERY_KEY, wsId],
      }),
    onSuccess: (sent) => {
      toast.success(sent ? t('teacher_sent') : t('teacher_saved'));
      onSaved();
    },
  });

  return {
    isPending: mutation.isPending,
    save: (input: TeacherTopicSaveInput) => mutation.mutate(input),
  };
}
