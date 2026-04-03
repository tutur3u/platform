'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { RequireAttentionName } from '@/components/users/require-attention-name';
import { UserFeedbackPanel } from './user-feedback-panel';

interface UserFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wsId: string;
  user: {
    id: string;
    full_name?: string | null;
    display_name?: string | null;
    has_require_attention_feedback?: boolean | null;
  } | null;
  canManageFeedbacks: boolean;
}

export function UserFeedbackDialog({
  open,
  onOpenChange,
  wsId,
  user,
  canManageFeedbacks,
}: UserFeedbackDialogProps) {
  const tUsers = useTranslations('ws-users');
  const tFeedback = useTranslations('ws-user-feedbacks');

  if (!user) {
    return null;
  }

  const userName =
    user.full_name?.trim() ||
    user.display_name?.trim() ||
    tFeedback('unknown_user');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {tUsers('feedback_support_title')}
            <RequireAttentionName
              name={userName}
              requireAttention={!!user.has_require_attention_feedback}
              className="font-semibold"
            />
          </DialogTitle>
          <DialogDescription>
            {tUsers('feedback_support_description')}
          </DialogDescription>
        </DialogHeader>

        <UserFeedbackPanel
          wsId={wsId}
          user={user}
          canManageFeedbacks={canManageFeedbacks}
          className="border-0 shadow-none"
        />
      </DialogContent>
    </Dialog>
  );
}
