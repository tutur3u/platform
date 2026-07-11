'use client';

import { useMutation } from '@tanstack/react-query';
import {
  cancelTopicAnnouncementSchedule,
  createTopicAnnouncement,
  createTopicAnnouncementContact,
  createTopicAnnouncementTemplate,
  deleteTopicAnnouncement,
  deleteTopicAnnouncementContact,
  deleteTopicAnnouncementTemplate,
  importTopicAnnouncements,
  requestTopicAnnouncementContactVerification,
  scheduleTopicAnnouncement,
  sendTopicAnnouncement,
  sendTopicAnnouncementsBulk,
  type TopicAnnouncementContactPayload,
  type TopicAnnouncementImportResult,
  type TopicAnnouncementPayload,
  type TopicAnnouncementTemplatePayload,
  updateTopicAnnouncementTemplate,
} from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';

interface Options {
  invalidate: () => void;
  onImportSuccess?: (result: TopicAnnouncementImportResult) => void;
  wsId: string;
}

export function useTopicAnnouncementActions({
  invalidate,
  onImportSuccess,
  wsId,
}: Options) {
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
  const deleteContactMutation = useMutation({
    mutationFn: (contactId: string) =>
      deleteTopicAnnouncementContact(wsId, contactId),
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('contact_remove_failed')
      ),
    onSuccess: () => {
      toast.success(t('contact_removed'));
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
  const deleteAnnouncementMutation = useMutation({
    mutationFn: (announcementId: string) =>
      deleteTopicAnnouncement(wsId, announcementId),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('delete_failed')),
    onSuccess: () => {
      toast.success(t('announcement_removed'));
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
  const scheduleMutation = useMutation({
    mutationFn: ({
      announcementId,
      scheduledSendAt,
    }: {
      announcementId: string;
      scheduledSendAt: string;
    }) => scheduleTopicAnnouncement(wsId, announcementId, { scheduledSendAt }),
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : t('schedule_send_failed');
      if (message.includes('WORKSPACE_TIMEZONE_REQUIRED')) {
        toast.error(t('workspace_timezone_required'));
        return;
      }
      toast.error(message);
    },
    onSuccess: () => {
      toast.success(t('schedule_send_success'));
      invalidate();
    },
  });
  const cancelScheduleMutation = useMutation({
    mutationFn: (announcementId: string) =>
      cancelTopicAnnouncementSchedule(wsId, announcementId),
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('cancel_schedule_failed')
      ),
    onSuccess: () => {
      toast.success(t('cancel_schedule_success'));
      invalidate();
    },
  });
  const createTemplateMutation = useMutation({
    mutationFn: (payload: TopicAnnouncementTemplatePayload) =>
      createTopicAnnouncementTemplate(wsId, payload),
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('template_save_failed')
      ),
    onSuccess: () => {
      toast.success(t('template_saved'));
      invalidate();
    },
  });
  const updateTemplateMutation = useMutation({
    mutationFn: ({
      payload,
      templateId,
    }: {
      payload: Partial<TopicAnnouncementTemplatePayload>;
      templateId: string;
    }) => updateTopicAnnouncementTemplate(wsId, templateId, payload),
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('template_save_failed')
      ),
    onSuccess: () => {
      toast.success(t('template_saved'));
      invalidate();
    },
  });
  const deleteTemplateMutation = useMutation({
    mutationFn: (templateId: string) =>
      deleteTopicAnnouncementTemplate(wsId, templateId),
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('template_delete_failed')
      ),
    onSuccess: () => {
      toast.success(t('template_deleted'));
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
      onImportSuccess?.(result);
      invalidate();
    },
  });
  const importAndSendMutation = useMutation({
    mutationFn: async (
      rows: Parameters<typeof importTopicAnnouncements>[1]
    ) => {
      const importResult = await importTopicAnnouncements(wsId, rows);
      const announcementIds = importResult.announcementIds ?? [];
      if (announcementIds.length === 0) {
        return { importResult, sendResult: null };
      }

      const sendResult = await sendTopicAnnouncementsBulk(wsId, {
        announcementIds,
      });

      return { importResult, sendResult };
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('send_failed')),
    onSuccess: ({ importResult, sendResult }) => {
      const sentCount =
        sendResult?.results.filter((result) => !result.error).length ?? 0;
      toast.success(
        t('bulk_created_and_sent', {
          created: importResult.createdAnnouncements.toString(),
          sent: sentCount.toString(),
        })
      );
      onImportSuccess?.(importResult);
      invalidate();
    },
  });

  return {
    cancelScheduleMutation,
    createAnnouncementMutation,
    createContactMutation,
    createTemplateMutation,
    deleteContactMutation,
    deleteAnnouncementMutation,
    deleteTemplateMutation,
    importAndSendMutation,
    importMutation,
    scheduleMutation,
    sendMutation,
    updateTemplateMutation,
    verifyMutation,
  };
}
