'use client';

import { Button } from '@tuturuuu/ui/button';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

interface Props {
  announcementTitle: string;
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (scheduledSendAt: string) => void;
  timezone: string;
}

export function AnnouncementScheduleDialog({
  announcementTitle,
  isOpen,
  isSubmitting,
  onClose,
  onConfirm,
  timezone,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const defaultDate = useMemo(() => {
    const next = new Date();
    next.setMinutes(next.getMinutes() + 30, 0, 0);
    return next;
  }, []);
  const [scheduledAt, setScheduledAt] = useState<Date | undefined>(defaultDate);

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={isOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('schedule_send_title')}</DialogTitle>
          <DialogDescription>
            {t('schedule_send_description', { title: announcementTitle })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <DateTimePicker
            date={scheduledAt}
            inline
            preferences={{ timezone }}
            setDate={setScheduledAt}
          />
          <p className="text-muted-foreground text-xs">
            {t('schedule_send_timezone_helper', { timezone })}
          </p>
        </div>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t('schedule_send_cancel')}
          </Button>
          <Button
            disabled={!scheduledAt || isSubmitting}
            onClick={() => {
              if (!scheduledAt) return;
              onConfirm(scheduledAt.toISOString());
            }}
            type="button"
          >
            {t('schedule_send_confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
