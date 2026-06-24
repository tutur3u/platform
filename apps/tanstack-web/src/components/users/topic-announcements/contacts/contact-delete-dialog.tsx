'use client';

import type { TopicAnnouncementContact } from '@tuturuuu/internal-api';
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

interface ContactDeleteDialogProps {
  isDeleting: boolean;
  onDelete: (contactId: string) => void;
  onOpenChange: (open: boolean) => void;
  target: TopicAnnouncementContact | null;
}

export function ContactDeleteDialog({
  isDeleting,
  onDelete,
  onOpenChange,
  target,
}: ContactDeleteDialogProps) {
  const t = useTranslations('ws-topic-announcements');

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open && !isDeleting) onOpenChange(open);
      }}
      open={Boolean(target)}
    >
      <AlertDialogContent
        onEscapeKeyDown={(event) => isDeleting && event.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t('remove_contact_title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('remove_contact_description', {
              name: target?.name ?? '',
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
            {t('remove_contact')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
