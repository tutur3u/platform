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
import { useWorkspaceActor } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import type { PeriodicDeliveryAction } from './periodic-report-row';

export type PeriodicDeliveryIntent = {
  action: PeriodicDeliveryAction;
  report: PeriodicReport;
  wsId: string;
  actor: NonNullable<ReturnType<typeof useWorkspaceActor>>;
};

export function PeriodicDeliveryConfirmation({
  intent,
  wsId,
  canSend,
  isPending,
  onCancel,
  onConfirm,
}: {
  intent: PeriodicDeliveryIntent | null;
  wsId: string;
  canSend: boolean;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations('reports-hub');
  const actor = useWorkspaceActor();
  const lease = useRef<{
    intent: typeof intent;
    actor: typeof actor;
    wsId: string;
    invalid: boolean;
    submitted: boolean;
    pending: boolean;
  } | null>(null);
  if (lease.current?.intent !== intent) {
    lease.current = {
      intent,
      actor,
      wsId,
      invalid:
        !canSend || !actor || intent?.actor !== actor || intent?.wsId !== wsId,
      submitted: false,
      pending: isPending,
    };
  }
  const current = lease.current;
  if (current) {
    if (current.actor !== actor || current.wsId !== wsId || !canSend)
      current.invalid = true;
    if (current.pending && !isPending) current.submitted = false;
    current.pending = isPending;
  }
  const uncertain =
    intent?.action === 'retry' &&
    [
      'Delivery worker timed out. Delivery outcome is unknown; check provider logs before retrying.',
      'Email delivery outcome is unknown. Check provider logs before retrying.',
    ].includes(intent.report.last_delivery_error ?? '');
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
            {uncertain && (
              <span className="mt-2 block text-destructive">
                {t('confirm_uncertain_retry_warning')}
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {t('cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={
              !intent || isPending || !canSend || Boolean(current?.invalid)
            }
            onClick={(event) => {
              event.preventDefault();
              if (
                !intent ||
                !current ||
                current.invalid ||
                current.submitted ||
                current.pending ||
                lease.current !== current
              )
                return;
              try {
                current.actor?.assertActive();
              } catch {
                current.invalid = true;
                onCancel();
                return;
              }
              current.submitted = true;
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
