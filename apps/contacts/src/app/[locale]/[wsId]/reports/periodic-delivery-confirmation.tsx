'use client';

import { Loader2 } from '@tuturuuu/icons';
import type { PeriodicReport } from '@tuturuuu/internal-api/reports';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { useTranslations } from 'next-intl';
import type { PeriodicDeliveryAction } from './periodic-report-row';

export function PeriodicDeliveryConfirmation({
  intent,
  isPending,
  onCancel,
  onConfirm,
}: {
  intent: {
    action: PeriodicDeliveryAction;
    report: PeriodicReport;
  } | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations('reports-hub');
  return (
    <AlertDialog
      open={Boolean(intent)}
      onOpenChange={(open) => !open && onCancel()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(`confirm_${intent?.action ?? 'send'}_title`)}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(`confirm_${intent?.action ?? 'send'}_description`, {
              email: intent?.report.user_email ?? t('missing_email'),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!intent || isPending}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {t(
              intent?.action === 'cancel'
                ? 'confirm_cancel'
                : 'confirm_delivery_action'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
