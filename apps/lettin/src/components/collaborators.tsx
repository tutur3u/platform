'use client';
import type { LettinWorld } from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { useLettinMutation } from './use-lettin';

type AccessReview = {
  wsId: string;
  worldId: string;
  userId: string;
  name: string;
} & (
  | { action: 'setCollaborator'; role: 'editor' | 'publisher' }
  | { action: 'removeCollaborator' }
);

export function Collaborators({
  wsId,
  data,
}: {
  wsId: string;
  data: LettinWorld;
}) {
  const t = useTranslations('lettin');
  const mutation = useLettinMutation(wsId);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<'editor' | 'publisher'>('editor');
  const [review, setReview] = useState<AccessReview | null>(null);
  const submitting = useRef(false);
  const reviewValid =
    review &&
    review.wsId === wsId &&
    review.worldId === data.world.id &&
    data.role === 'owner' &&
    (review.action === 'setCollaborator'
      ? data.eligibleMembers.some((member) => member.user_id === review.userId)
      : data.collaborators.some((member) => member.user_id === review.userId));
  const confirm = async () => {
    if (!review || !reviewValid || mutation.isPending || submitting.current)
      return;
    submitting.current = true;
    try {
      await mutation.mutateAsync(
        review.action === 'setCollaborator'
          ? {
              action: review.action,
              worldId: review.worldId,
              userId: review.userId,
              role: review.role,
            }
          : {
              action: review.action,
              worldId: review.worldId,
              userId: review.userId,
            }
      );
      setReview(null);
      setUserId('');
      setRole('editor');
    } catch {
      // Keep the frozen selection available for retry; the mutation owns its error.
    } finally {
      submitting.current = false;
    }
  };
  return (
    <details className="rounded-lg border border-border bg-card p-4">
      <summary className="cursor-pointer">{t('collaborators')}</summary>
      <p className="my-3 text-muted-foreground text-sm">
        {t('collaboratorsHint')}
      </p>
      <form
        className="flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (mutation.isPending || review) return;
          const member = data.eligibleMembers.find(
            (member) => member.user_id === userId
          );
          if (!member) return;
          setReview({
            wsId,
            action: 'setCollaborator',
            worldId: data.world.id,
            userId,
            role,
            name: member.name || member.user_id,
          });
        }}
      >
        <select
          required
          disabled={mutation.isPending || !!review}
          aria-label={t('member')}
          className="max-w-full rounded border border-input bg-background p-2"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        >
          <option value="">{t('selectMember')}</option>
          {data.eligibleMembers.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.name || m.user_id}
            </option>
          ))}
        </select>
        <select
          aria-label={t('role')}
          disabled={mutation.isPending || !!review}
          className="rounded border border-input bg-background p-2"
          value={role}
          onChange={(e) => setRole(e.target.value as 'editor' | 'publisher')}
        >
          <option value="editor">{t('editor')}</option>
          <option value="publisher">{t('publisher')}</option>
        </select>
        <Button disabled={!userId || mutation.isPending || !!review}>
          {t('addCollaborator')}
        </Button>
      </form>
      <ul className="mt-4 space-y-2">
        {data.collaborators.map((c) => (
          <li
            key={c.user_id}
            className="flex flex-wrap items-center justify-between gap-3 border-border border-t pt-2"
          >
            <span>
              {c.name || c.user_id} · {t(c.role)}
            </span>
            <Button
              variant="ghost"
              disabled={mutation.isPending || !!review}
              onClick={() =>
                setReview({
                  wsId,
                  name: c.name || c.user_id,
                  action: 'removeCollaborator',
                  worldId: data.world.id,
                  userId: c.user_id,
                })
              }
            >
              {t('remove')}
            </Button>
          </li>
        ))}
      </ul>
      {!review && mutation.errorMessage && (
        <p role="alert">{mutation.errorMessage}</p>
      )}
      <Dialog
        open={
          !!review && review.wsId === wsId && review.worldId === data.world.id
        }
        onOpenChange={(open) => {
          if (!open && !mutation.isPending && !submitting.current)
            setReview(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('reviewCollaboratorAccess')}</DialogTitle>
            <DialogDescription>{t('collaboratorReviewHint')}</DialogDescription>
          </DialogHeader>
          {review && (
            <>
              <p>
                {t('member')}: {review.name}
              </p>
              <p>
                {review.action === 'removeCollaborator'
                  ? t('collaboratorRemovalScope')
                  : t(
                      review.role === 'publisher'
                        ? 'collaboratorPublisherScope'
                        : 'collaboratorEditorScope'
                    )}
              </p>
            </>
          )}
          {!reviewValid && (
            <p role="alert">{t('collaboratorReviewUnavailable')}</p>
          )}
          {mutation.errorMessage && <p role="alert">{mutation.errorMessage}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => {
                if (!submitting.current) setReview(null);
              }}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              disabled={!reviewValid || mutation.isPending}
              onClick={confirm}
            >
              {t('confirmCollaboratorAccess')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </details>
  );
}
