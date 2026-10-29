'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, LogOut } from '@tuturuuu/icons';
import type { TutoringQueueItem } from '@tuturuuu/internal-api';
import { endTutoringWeakSupport } from '@tuturuuu/internal-api/tutoring';
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
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { isTutoringContentRestricted } from './tutoring-errors';

/**
 * Rows whose learner is still on the weak-support list. Needs-tutoring group
 * members leave the queue only when removed from the group, so ending weak
 * support is not offered for them.
 */
export function canEndWeakSupport(item: TutoringQueueItem) {
  return (
    !item.support_group &&
    (item.review_only ||
      item.reason_type === 'WEAK_SUPPORT' ||
      item.reason_type === 'BOTH')
  );
}

/** "Thoát kèm": confirm in-app, then take the learner off weak support. */
export function TutoringEndWeakSupport({
  item,
  wsId,
}: {
  item: TutoringQueueItem;
  wsId: string;
}) {
  const t = useTranslations('ws-tutoring');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const endSupport = useMutation({
    mutationFn: () =>
      endTutoringWeakSupport(wsId, {
        groupId: item.group_id,
        studentUserId: item.student_user_id,
      }),
    onSuccess: () => {
      toast.success(t('end_weak_support_done'));
      setOpen(false);
      for (const key of ['tutoring-queue', 'tutoring-session-stats']) {
        void queryClient.invalidateQueries({ queryKey: [key, wsId] });
      }
    },
    onError: (error) =>
      toast.error(
        isTutoringContentRestricted(error)
          ? t('content_restricted')
          : error instanceof Error
            ? error.message
            : t('end_weak_support_failed')
      ),
  });

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" variant="outline">
        <LogOut className="h-4 w-4" />
        {t('end_weak_support')}
      </Button>
      <AlertDialog
        onOpenChange={(next) => {
          if (!endSupport.isPending) setOpen(next);
        }}
        open={open}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('end_weak_support_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('end_weak_support_description', {
                group: item.group_name,
                student: item.student_name,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={endSupport.isPending}>
              {tCommon('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={endSupport.isPending}
              onClick={(event) => {
                event.preventDefault();
                endSupport.mutate();
              }}
            >
              {endSupport.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {t('end_weak_support_confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
