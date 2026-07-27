'use client';

import { Dialog, DialogContent, DialogTitle } from '@tuturuuu/ui/dialog';
import { PostPreviewSkeleton } from './loading-skeletons';
import { PostDisplay } from './post-display';
import type { PostEmail } from './types';

export function PostPreviewDialog({
  canApprovePosts,
  canForceSendPosts,
  isPermissionsLoading,
  onApprovalCompleted,
  onOpenChange,
  open,
  postEmail,
  wsId,
}: {
  canApprovePosts: boolean;
  canForceSendPosts: boolean;
  isPermissionsLoading: boolean;
  onApprovalCompleted: (postEmail: PostEmail) => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  postEmail: PostEmail | null;
  wsId: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[min(92dvh,60rem)] sm:max-h-[calc(100dvh-1rem)] sm:w-[calc(100vw-1rem)] sm:max-w-7xl sm:rounded-xl sm:border">
        <DialogTitle className="sr-only">
          {postEmail?.recipient ?? postEmail?.post_title ?? 'Daily report'}
        </DialogTitle>
        {isPermissionsLoading ? (
          <PostPreviewSkeleton />
        ) : (
          <PostDisplay
            wsId={wsId}
            postEmail={postEmail}
            canApprovePosts={canApprovePosts}
            canForceSendPosts={canForceSendPosts}
            onApprovalCompleted={onApprovalCompleted}
            presentation="dialog"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
