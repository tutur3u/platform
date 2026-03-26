'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, LoaderCircle, Save, X } from '@tuturuuu/icons';
import type { Database, UserGroupPost } from '@tuturuuu/types/db';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PostApprovalActions } from '@/components/post-approval-actions';
import {
  getPostApprovalStatusAppearance,
  getPostEmailStatusAppearance,
  getPostReviewStageAppearance,
} from '../../../../../posts/status-meta';
import type {
  PostApprovalStatus,
  PostReviewStage,
} from '../../../../../posts/types';
import { isPostEmailQueueStatus } from '../../../../../posts/types';

type GroupPostRecipientRow =
  Database['public']['Functions']['get_user_group_post_recipient_rows']['Returns'][number];

interface Props {
  recipient: GroupPostRecipientRow;
  wsId: string;
  post: UserGroupPost;
  canUpdateUserGroupsPosts?: boolean;
  canApprovePosts?: boolean;
}

function UserCard({
  recipient,
  wsId,
  post,
  canUpdateUserGroupsPosts = false,
  canApprovePosts = false,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const tableT = useTranslations('post-email-data-table');

  const hasExistingCheck = Boolean(recipient.has_check);
  const approvalStatus = hasExistingCheck
    ? (recipient.approval_status as PostApprovalStatus | null | undefined)
    : undefined;
  const stageAppearance = getPostReviewStageAppearance(
    recipient.review_stage as PostReviewStage
  );
  const approvalAppearance = approvalStatus
    ? getPostApprovalStatusAppearance(approvalStatus)
    : null;
  const queueAppearance = isPostEmailQueueStatus(recipient.queue_status)
    ? getPostEmailStatusAppearance(recipient.queue_status)
    : null;
  const deliveryIssueMessage =
    recipient.delivery_issue_reason === 'missing_email'
      ? tableT('delivery_issue_reason_missing_email')
      : recipient.delivery_issue_reason === 'missing_sender_platform_user'
        ? tableT('delivery_issue_reason_missing_sender_platform_user')
        : null;
  const stageIconClassName = cn(
    'mr-1 h-3.5 w-3.5',
    stageAppearance.iconClassName
  );
  const queueIconClassName = cn(
    'mr-1 h-3.5 w-3.5',
    queueAppearance?.iconClassName
  );
  const notesDisabled = !hasExistingCheck;

  const { mutate: handleSaveStatus, isPending: isSavingStatus } = useMutation({
    mutationFn: async ({
      isCompleted,
      notes,
    }: {
      isCompleted: boolean;
      notes?: string;
    }) => {
      if (!recipient.user_id || !post.id || !post.group_id) {
        throw new Error('Missing required fields');
      }

      const endpoint = hasExistingCheck
        ? `/api/v1/workspaces/${wsId}/user-groups/${post.group_id}/group-checks/${post.id}`
        : `/api/v1/workspaces/${wsId}/user-groups/${post.group_id}/group-checks`;
      const payload = hasExistingCheck
        ? {
            user_id: recipient.user_id,
            is_completed: isCompleted,
            notes: notes ?? recipient.notes ?? '',
          }
        : {
            post_id: post.id,
            user_id: recipient.user_id,
            is_completed: isCompleted,
            notes: notes ?? '',
          };

      const response = await fetch(endpoint, {
        method: hasExistingCheck ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Error saving/updating data');
      }

      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['group-post-checks', post.id],
      });
      router.refresh();
    },
  });

  const handleSaveNotes = (formData: FormData) => {
    if (!hasExistingCheck) {
      return;
    }

    const notes = formData.get('notes') as string;
    handleSaveStatus({
      isCompleted: recipient.is_completed,
      notes,
    });
  };

  return (
    <Card className="w-full rounded-lg border-border/60 p-4 shadow-sm">
      <div className="mb-4 flex items-center">
        <Avatar className="h-12 w-12 rounded-full object-cover">
          <AvatarImage
            src={recipient.user_avatar_url || undefined}
            alt={recipient.recipient || 'User avatar'}
          />
          <AvatarFallback>
            {(recipient.recipient || recipient.email || 'U').charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="ml-4 flex w-full items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-foreground text-lg">
              {recipient.recipient}
            </h3>
            {(recipient.email || recipient.user_phone) && (
              <p className="text-foreground text-sm">
                {recipient.email || recipient.user_phone}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant="outline" className={stageAppearance.className}>
              <stageAppearance.icon className={stageIconClassName} />
              {tableT(stageAppearance.labelKey)}
            </Badge>
            {approvalAppearance && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] opacity-90',
                  approvalAppearance.className
                )}
              >
                <approvalAppearance.icon className="mr-1 h-3.5 w-3.5" />
                {tableT(approvalAppearance.labelKey)}
              </Badge>
            )}
            {queueAppearance && (
              <Badge variant="outline" className={queueAppearance.className}>
                <queueAppearance.icon className={queueIconClassName} />
                {tableT(queueAppearance.labelKey)}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {!hasExistingCheck && (
        <div className="mb-3 rounded border border-dynamic-blue/20 bg-dynamic-blue/5 p-2 text-dynamic-blue text-sm">
          {tableT('missing_check_description')}
        </div>
      )}

      {recipient.review_stage === 'undeliverable' && deliveryIssueMessage && (
        <div className="mb-3 rounded border border-dynamic-orange/20 bg-dynamic-orange/5 p-2 text-dynamic-orange text-sm">
          {deliveryIssueMessage}
        </div>
      )}

      <form action={handleSaveNotes} id={`notes-form-${recipient.user_id}`}>
        <Textarea
          key={recipient.notes}
          name="notes"
          placeholder={tableT('notes_placeholder')}
          defaultValue={recipient.notes || ''}
          disabled={notesDisabled}
        />
      </form>

      {recipient.approval_rejection_reason && approvalStatus === 'REJECTED' && (
        <div className="mt-3 rounded border border-dynamic-red/20 bg-dynamic-red/5 p-2 text-dynamic-red text-xs">
          {recipient.approval_rejection_reason}
        </div>
      )}

      {recipient.queue_last_error && (
        <div className="mt-3 rounded border border-dynamic-red/20 bg-dynamic-red/5 p-2 text-dynamic-red text-xs">
          {recipient.queue_last_error}
        </div>
      )}

      {canApprovePosts && post.id && recipient.user_id && hasExistingCheck && (
        <div className="mt-4">
          <PostApprovalActions
            wsId={wsId}
            itemId={`${post.id}:${recipient.user_id}`}
            approvalStatus={approvalStatus ?? 'PENDING'}
            queueStatus={recipient.queue_status ?? undefined}
            canRemoveApproval={Boolean(recipient.can_remove_approval)}
          />
        </div>
      )}

      {canUpdateUserGroupsPosts && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            className="bg-dynamic-green text-background hover:bg-dynamic-green/90"
            onClick={() =>
              handleSaveStatus({
                isCompleted: true,
              })
            }
            disabled={isSavingStatus}
          >
            {isSavingStatus ? (
              <LoaderCircle className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-1 h-4 w-4" />
            )}
            {t('common.completed')}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() =>
              handleSaveStatus({
                isCompleted: false,
              })
            }
            disabled={isSavingStatus}
          >
            {isSavingStatus ? (
              <LoaderCircle className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <X className="mr-1 h-4 w-4" />
            )}
            {t('common.incomplete')}
          </Button>
          {hasExistingCheck && (
            <Button
              size="sm"
              variant="outline"
              type="submit"
              form={`notes-form-${recipient.user_id}`}
              disabled={isSavingStatus}
            >
              {isSavingStatus ? (
                <LoaderCircle className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1 h-4 w-4" />
              )}
              {t('common.save')}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

export default UserCard;
