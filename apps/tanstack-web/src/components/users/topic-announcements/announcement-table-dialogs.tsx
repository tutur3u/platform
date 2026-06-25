'use client';

import type { TopicAnnouncementRecord } from '@tuturuuu/internal-api';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { TopicAnnouncementEmailPreviewDialog } from './announcements/topic-announcement-email-preview-dialog';

export function AnnouncementSendPreviewDialog({
  isSending,
  onOpenChange,
  onSend,
  target,
  wsId,
}: {
  isSending: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (announcementId: string) => void;
  target: TopicAnnouncementRecord | null;
  wsId: string;
}) {
  const t = useTranslations('ws-topic-announcements');

  return (
    <TopicAnnouncementEmailPreviewDialog
      announcement={target}
      confirmLabel={t('send_now')}
      isConfirming={isSending}
      onConfirm={() => {
        if (!target) return;
        onSend(target.id);
        onOpenChange(false);
      }}
      onOpenChange={(open) => {
        if (!open && !isSending) onOpenChange(false);
      }}
      open={Boolean(target)}
      wsId={wsId}
    />
  );
}

export function AnnouncementRemoveDialog({
  isDeleting,
  onDelete,
  onOpenChange,
  target,
}: {
  isDeleting: boolean;
  onDelete: (announcementId: string) => void;
  onOpenChange: (open: boolean) => void;
  target: TopicAnnouncementRecord | null;
}) {
  const t = useTranslations('ws-topic-announcements');

  return (
    <AlertDialog
      open={Boolean(target)}
      onOpenChange={(open) => {
        if (!open && !isDeleting) onOpenChange(false);
      }}
    >
      <AlertDialogContent
        onEscapeKeyDown={(event) => isDeleting && event.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t('remove_announcement_title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('remove_announcement_description', {
              title: target?.title ?? '',
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            {t('cancel')}
          </AlertDialogCancel>
          <Button
            disabled={isDeleting || !target}
            onClick={() => {
              if (!target) return;
              onDelete(target.id);
              onOpenChange(false);
            }}
            variant="destructive"
          >
            {t('remove_announcement')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
