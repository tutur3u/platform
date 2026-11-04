'use client';

import type { TutoringSessionRecord } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * A pending make-up whose content still follows the missed class needs the
 * completer's confirmation: what they see here, posts included when they may
 * read them, is exactly what gets saved.
 */
export function needsCompletionReview(session: TutoringSessionRecord) {
  return (
    session.attendance_status === 'PENDING' &&
    Boolean(session.content_linked) &&
    session.content.trim() !== ''
  );
}

/** Confirms the text stored when a linked make-up session is completed. */
export function TutoringCompleteDialog({
  isSaving,
  onComplete,
  onOpenChange,
  session,
}: {
  isSaving: boolean;
  /** Blank `content` completes with the session notes only. */
  onComplete: (session: TutoringSessionRecord, content: string) => void;
  onOpenChange: (open: boolean) => void;
  session: TutoringSessionRecord | null;
}) {
  const t = useTranslations('ws-tutoring');
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open && !isSaving) onOpenChange(false);
      }}
      open={Boolean(session)}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('complete_content_title')}</DialogTitle>
          <DialogDescription>
            {t('complete_content_description')}
          </DialogDescription>
        </DialogHeader>
        {session ? (
          <CompleteForm
            isSaving={isSaving}
            key={session.id}
            onComplete={(content) => onComplete(session, content)}
            initial={session.content}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CompleteForm({
  initial,
  isSaving,
  onComplete,
}: {
  initial: string;
  isSaving: boolean;
  onComplete: (content: string) => void;
}) {
  const t = useTranslations('ws-tutoring');
  const [draft, setDraft] = useState(initial);
  return (
    <>
      <Textarea
        aria-label={t('content')}
        maxLength={10_000}
        onChange={(event) => setDraft(event.target.value)}
        rows={8}
        value={draft}
      />
      <Button disabled={isSaving} onClick={() => onComplete(draft)}>
        {t('mark_done')}
      </Button>
    </>
  );
}
