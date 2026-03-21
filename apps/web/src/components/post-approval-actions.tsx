'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, LoaderCircle, RotateCcw, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface Props {
  wsId: string;
  itemId: string;
  approvalStatus: ApprovalStatus;
  queueStatus?: string;
  canRemoveApproval?: boolean;
  compact?: boolean;
  onCompleted?: () => void;
}

export function PostApprovalActions({
  wsId,
  itemId,
  approvalStatus,
  queueStatus,
  canRemoveApproval = false,
  compact = false,
  onCompleted,
}: Props) {
  const isSentOrProcessing =
    queueStatus === 'sent' || queueStatus === 'processing';
  const t = useTranslations('approvals');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: async ({
      action,
      reason,
    }: {
      action: 'approve' | 'reject' | 'unapprove';
      reason?: string;
    }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/approvals`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action,
            kind: 'posts',
            itemId,
            reason,
          }),
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || tCommon('error'));
      }
    },
    onSuccess: async (_, variables) => {
      if (variables.action === 'approve') {
        toast.success(t('actions.approved'));
      } else if (variables.action === 'reject') {
        toast.success(t('actions.rejected'));
      } else {
        toast.success(t('actions.unapproved'));
      }

      setRejectOpen(false);
      setReason('');
      await queryClient.invalidateQueries({
        queryKey: ['ws', wsId, 'approvals', 'posts'],
      });
      await queryClient.invalidateQueries({
        queryKey: ['group-post-checks'],
      });
      router.refresh();
      onCompleted?.();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : tCommon('error'));
    },
  });

  const buttonSize = compact ? 'sm' : 'default';

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {approvalStatus !== 'APPROVED' && (
          <Button
            size={buttonSize}
            onClick={() => mutation.mutate({ action: 'approve' })}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <LoaderCircle className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-1 h-4 w-4" />
            )}
            {t('actions.approve')}
          </Button>
        )}

        {approvalStatus !== 'REJECTED' &&
          !(approvalStatus === 'APPROVED' && isSentOrProcessing) && (
            <Button
              size={buttonSize}
              variant="destructive"
              onClick={() => setRejectOpen(true)}
              disabled={mutation.isPending}
            >
              <X className="mr-1 h-4 w-4" />
              {t('actions.reject')}
            </Button>
          )}

        {approvalStatus === 'APPROVED' && canRemoveApproval && (
          <Button
            size={buttonSize}
            variant="outline"
            onClick={() => mutation.mutate({ action: 'unapprove' })}
            disabled={mutation.isPending}
          >
            <RotateCcw className="mr-1 h-4 w-4" />
            {t('actions.unapprove')}
          </Button>
        )}
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('actions.reject')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="post-approval-reason">
              {t('labels.rejection_reason')}
            </Label>
            <Textarea
              id="post-approval-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('detail.rejectionReasonPlaceholder')}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              {t('actions.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                mutation.mutate({
                  action: 'reject',
                  reason: reason.trim(),
                })
              }
              disabled={mutation.isPending || !reason.trim()}
            >
              {mutation.isPending ? (
                <LoaderCircle className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <X className="mr-1 h-4 w-4" />
              )}
              {t('actions.reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
