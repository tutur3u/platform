'use client';

import { useMutation } from '@tanstack/react-query';
import {
  createTopicAnnouncement,
  createTopicAnnouncementContact,
  importTopicAnnouncements,
  requestTopicAnnouncementContactVerification,
  sendTopicAnnouncement,
  type TopicAnnouncementContactPayload,
  type TopicAnnouncementPayload,
} from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';

interface Options {
  invalidate: () => void;
  wsId: string;
}

export function useTopicAnnouncementActions({ invalidate, wsId }: Options) {
  const t = useTranslations('ws-topic-announcements');

  const createContactMutation = useMutation({
    mutationFn: (payload: TopicAnnouncementContactPayload) =>
      createTopicAnnouncementContact(wsId, payload),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('contact_failed')),
    onSuccess: () => {
      toast.success(t('contact_created'));
      invalidate();
    },
  });
  const createAnnouncementMutation = useMutation({
    mutationFn: (payload: TopicAnnouncementPayload) =>
      createTopicAnnouncement(wsId, payload),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('create_failed')),
    onSuccess: () => {
      toast.success(t('announcement_created'));
      invalidate();
    },
  });
  const verifyMutation = useMutation({
    mutationFn: (contactId: string) =>
      requestTopicAnnouncementContactVerification(wsId, contactId),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('verify_failed')),
    onSuccess: (result) => {
      toast.success(
        result.alreadyPending ? t('verify_pending_toast') : t('verify_sent')
      );
      invalidate();
    },
  });
  const sendMutation = useMutation({
    mutationFn: (announcementId: string) =>
      sendTopicAnnouncement(wsId, announcementId),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('send_failed')),
    onSuccess: () => {
      toast.success(t('sent'));
      invalidate();
    },
  });
  const importMutation = useMutation({
    mutationFn: (rows: Parameters<typeof importTopicAnnouncements>[1]) =>
      importTopicAnnouncements(wsId, rows),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('import_failed')),
    onSuccess: (result) => {
      toast.success(
        t('imported', { count: result.createdAnnouncements.toString() })
      );
      invalidate();
    },
  });

  return {
    createAnnouncementMutation,
    createContactMutation,
    importMutation,
    sendMutation,
    verifyMutation,
  };
}
