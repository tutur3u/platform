'use client';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
export function LeaveDialog({
  busy,
  open,
  onOpenChange,
  onLeave,
  onEnd,
}: {
  open: boolean;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onLeave: () => void;
  onEnd: () => void;
}) {
  const t = useTranslations('meet.call');
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('leave_choice_title')}</DialogTitle>
          <DialogDescription>{t('leave_choice_hint')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Button disabled={busy} variant="outline" onClick={onLeave}>
            {t('leave_only')}
          </Button>
          <Button disabled={busy} variant="destructive" onClick={onEnd}>
            {t(busy ? 'ending_meeting' : 'end_for_everyone')}
          </Button>
          <Button
            disabled={busy}
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            {t('stay_in_call')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
