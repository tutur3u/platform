'use client';

import { RotateCcw } from '@tuturuuu/icons';
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
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useMeetUxV2 } from '../../../prejoin/prejoin-context';
import { useActivityPane } from '../../../stage-layout/activity-pane-context';
import { ToolAction } from '../../tool-ui';

/**
 * Starts a new attempt once results were released. That discards every answer
 * and grade of the attempt on screen, so a dialog asks first and only its
 * destructive confirm sends the command.
 */
export function NewAttemptAction({ onConfirm }: { onConfirm: () => void }) {
  const t = useTranslations('meet.call.live_activities');
  const [asking, setAsking] = useState(false);
  const meetUxV2 = useMeetUxV2();
  const visible = useActivityPane()?.visible ?? true;
  return (
    <>
      <ToolAction
        icon={RotateCcw}
        label={t('assessment.new_attempt')}
        onClick={() => setAsking(true)}
      />
      <AlertDialog
        open={asking && (!meetUxV2 || visible)}
        onOpenChange={setAsking}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('assessment.new_attempt')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('assessment.reopen_hint')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" onClick={onConfirm}>
                {t('assessment.reopen_confirm')}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
