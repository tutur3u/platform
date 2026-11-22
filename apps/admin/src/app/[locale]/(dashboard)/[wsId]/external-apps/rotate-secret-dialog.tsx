'use client';

import { Loader2, RotateCw } from '@tuturuuu/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

/**
 * Rotation revokes the app's refresh tokens, so every user of the app signs
 * in again at their next refresh; the operator confirms that first.
 */
export function RotateSecretButton({
  appName,
  isPending,
  onConfirm,
}: {
  appName: string;
  isPending: boolean;
  onConfirm: () => void;
}) {
  const t = useTranslations('external-apps-settings');

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={isPending} type="button" variant="secondary">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCw className="h-4 w-4" />
          )}
          {t('actions.rotate_secret')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('confirm_rotate.title', { app: appName })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('confirm_rotate.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {t('actions.rotate_secret')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
