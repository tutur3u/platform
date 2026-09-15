'use client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { FollowupReviewForm } from './followup-review-form';
import type { MeetingFollowup } from './followup-types';
import { useFollowupContext } from './use-followup-context';

export function FollowupReview({
  suggestion,
  sourceUrl,
  wsId,
  meetingId,
  onClose,
}: {
  suggestion: MeetingFollowup;
  sourceUrl: string;
  wsId: string;
  meetingId: string;
  onClose: () => void;
}) {
  const t = useTranslations('meet.ai');
  const context = useFollowupContext(wsId, meetingId);
  if (
    !context.profile.data ||
    !context.workspaces.data ||
    context.settings.isPending
  ) {
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('followup_heading')}</DialogTitle>
            <DialogDescription>{t('followup_review_hint')}</DialogDescription>
          </DialogHeader>
          <p role="status">
            {t(
              context.profile.isError || context.workspaces.isError
                ? 'followup_identity_failed'
                : 'loading'
            )}
          </p>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <FollowupReviewForm
      key={context.profile.data.id}
      suggestion={suggestion}
      sourceUrl={sourceUrl}
      onClose={onClose}
      context={context}
      wsId={wsId}
      meetingId={meetingId}
    />
  );
}
