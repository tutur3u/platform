'use client';

import {
  deleteWorkspaceMeeting,
  updateWorkspaceMeeting,
} from '@tuturuuu/internal-api';
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { normalizeMeetingTime } from '@/features/call/lib/meeting-time';
import type { ScheduledMeeting } from './types';

/** The open management dialog; the server enforces creator or admin rights. */
export type ManageTarget =
  | { kind: 'none' }
  | { kind: 'edit'; meeting: ScheduledMeeting }
  | { kind: 'delete'; meeting: ScheduledMeeting };

type Submission =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'error'; message: string };

/** datetime-local value in the browser's wall-clock time. */
function toLocalInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function MeetingManageDialogs({
  wsId,
  target,
  onClose,
  onChanged,
}: {
  wsId: string;
  target: ManageTarget;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations('meet.meetings');
  const [submission, setSubmission] = useState<Submission>({ kind: 'idle' });
  const pending = submission.kind === 'pending';
  const close = () => {
    if (pending) return;
    setSubmission({ kind: 'idle' });
    onClose();
  };

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (target.kind !== 'edit' || pending) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const time = String(form.get('time') ?? '');
    if (!name) {
      setSubmission({ kind: 'error', message: t('name_required') });
      return;
    }
    setSubmission({ kind: 'pending' });
    try {
      await updateWorkspaceMeeting(wsId, target.meeting.id, {
        name,
        time: time ? normalizeMeetingTime(time) : new Date().toISOString(),
      });
      setSubmission({ kind: 'idle' });
      onClose();
      onChanged();
    } catch {
      setSubmission({ kind: 'error', message: t('update_failed') });
    }
  };

  const confirmDelete = async () => {
    if (target.kind !== 'delete' || pending) return;
    setSubmission({ kind: 'pending' });
    try {
      await deleteWorkspaceMeeting(wsId, target.meeting.id);
      setSubmission({ kind: 'idle' });
      onClose();
      onChanged();
    } catch {
      setSubmission({ kind: 'idle' });
      toast.error(t('delete_failed'));
    }
  };

  return (
    <>
      <Dialog
        onOpenChange={(open) => !open && close()}
        open={target.kind === 'edit'}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('edit_title')}</DialogTitle>
          </DialogHeader>
          {target.kind === 'edit' && (
            <form
              className="space-y-4"
              key={target.meeting.id}
              onSubmit={submitEdit}
            >
              <div className="space-y-2">
                <Label htmlFor="edit-meeting-name">{t('name')}</Label>
                <Input
                  defaultValue={target.meeting.name}
                  id="edit-meeting-name"
                  name="name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-meeting-time">{t('time')}</Label>
                <Input
                  defaultValue={toLocalInput(target.meeting.time)}
                  id="edit-meeting-time"
                  name="time"
                  type="datetime-local"
                />
              </div>
              {submission.kind === 'error' && (
                <p className="text-destructive text-sm" role="alert">
                  {submission.message}
                </p>
              )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button disabled={pending} type="button" variant="outline">
                    {t('cancel')}
                  </Button>
                </DialogClose>
                <Button disabled={pending} type="submit">
                  {pending ? t('saving') : t('save')}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(open) => !open && close()}
        open={target.kind === 'delete'}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete_description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {t('cancel')}
            </AlertDialogCancel>
            <Button
              disabled={pending}
              onClick={() => void confirmDelete()}
              type="button"
              variant="destructive"
            >
              {pending ? t('deleting') : t('delete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
