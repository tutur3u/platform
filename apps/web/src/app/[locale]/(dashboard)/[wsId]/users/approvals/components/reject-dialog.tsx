'use client';

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
import { MAX_APPROVAL_REJECTION_REASON_LENGTH } from '@/features/reports/report-limits';

interface RejectDialogProps {
  open: boolean;
  title?: string | null;
  reason: string;
  onReasonChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isSubmitting: boolean;
}

export function RejectDialog({
  open,
  title,
  reason,
  onReasonChange,
  onOpenChange,
  onConfirm,
  isSubmitting,
}: RejectDialogProps) {
  const t = useTranslations('approvals');
  const commonT = useTranslations('common');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('reject_dialog.title')}</DialogTitle>
          <DialogDescription>
            {t('reject_dialog.description', {
              title: title || t('labels.untitled'),
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="rejection-reason">{t('reject_dialog.reason')}</Label>
          <Textarea
            id="rejection-reason"
            maxLength={MAX_APPROVAL_REJECTION_REASON_LENGTH}
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder={t('reject_dialog.reason_placeholder')}
          />
          <p className="text-right text-muted-foreground text-xs">
            {reason.length.toLocaleString()}/
            {MAX_APPROVAL_REJECTION_REASON_LENGTH.toLocaleString()}{' '}
            {commonT('characters')}
          </p>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('reject_dialog.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={!reason.trim() || isSubmitting}
          >
            {t('reject_dialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
