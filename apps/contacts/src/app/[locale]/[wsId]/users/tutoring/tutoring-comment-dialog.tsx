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
        tutorComment: draft ?? comment.data?.tutorComment ?? '',
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
        {comment.isError || save.isError ? (
          <p role="alert">{t('comment_failed')}</p>
        ) : null}
        <Textarea
          aria-label={t('tutor_comment')}
          maxLength={2000}
          disabled={!canManage || !comment.isSuccess || save.isPending}
          value={draft ?? comment.data?.tutorComment ?? ''}
          onChange={(event) => setDraft(event.target.value)}
        />
        {canManage ? (
          <Button
            disabled={!comment.isSuccess || save.isPending}
            onClick={() => save.mutate()}
          >
            {complete ? t('mark_done') : t('save_content')}
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
