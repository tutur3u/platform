'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getTutoringSessionComment,
  type TutoringCompletionResponse,
  updateTutoringSession,
} from '@tuturuuu/internal-api/tutoring';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function TutoringCommentDialog({
  wsId,
  sessionId,
  complete,
  canManage,
  onClose,
}: {
  wsId: string;
  sessionId: string;
  complete: boolean;
  canManage: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('ws-tutoring');
  const client = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const comment = useQuery({
    queryKey: ['tutoring-comment', wsId, sessionId],
    queryFn: () => getTutoringSessionComment(wsId, sessionId),
  });
  const save = useMutation({
    mutationFn: (): Promise<TutoringCompletionResponse> =>
      updateTutoringSession(wsId, sessionId, {
        ...(comment.isSuccess && comment.data.canEdit && draft !== null
          ? { tutorComment: draft }
          : {}),
        ...(complete ? { attendanceStatus: 'DONE' } : {}),
      }),
    onSuccess: (result) => {
      if (result.warning === 'LINKED_CONTENT_NOT_STORED')
        toast.warning(t('linked_content_not_stored'));
      for (const key of [
        'tutoring-comment',
        'tutoring-sessions',
        'tutoring-session-stats',
        'tutoring-queue',
      ])
        void client.invalidateQueries({ queryKey: [key, wsId] });
      if (complete) {
        void client.invalidateQueries({ queryKey: ['tutoring-payroll', wsId] });
        toast.success(t('marked'));
      }
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('tutor_comment')}</DialogTitle>
        </DialogHeader>
        {save.isError ? (
          <p role="alert">{t(complete ? 'mark_failed' : 'comment_failed')}</p>
        ) : null}
        {comment.isSuccess ? (
          <Textarea
            aria-label={t('tutor_comment')}
            maxLength={2000}
            disabled={!canManage || !comment.data.canEdit || save.isPending}
            value={draft ?? comment.data?.tutorComment ?? ''}
            onChange={(event) => setDraft(event.target.value)}
          />
        ) : null}
        {canManage && (complete || comment.data?.canEdit) ? (
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {complete ? t('mark_done') : t('save_content')}
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
