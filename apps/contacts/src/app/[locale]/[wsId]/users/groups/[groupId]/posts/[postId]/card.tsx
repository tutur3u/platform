'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, LoaderCircle, RotateCcw, Save, X } from '@tuturuuu/icons';
import {
  clearUserGroupPostChecks,
  createUserGroupPostCheck,
  updateUserGroupPostChecks,
} from '@tuturuuu/internal-api/posts';
import type { UserGroupPost } from '@tuturuuu/types/db';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import type { GroupPostRecipientRow } from '@tuturuuu/users-core/lib/group-post-recipient-types';
import type {
  PostApprovalStatus,
  PostReviewStage,
} from '@tuturuuu/users-core/lib/post-types';
import { isPostEmailQueueStatus } from '@tuturuuu/users-core/lib/post-types';
import { PostApprovalActions } from '@tuturuuu/users-ui/components/post-approval-actions';
import {
  getPostApprovalStatusAppearance,
  getPostEmailStatusAppearance,
  getPostReviewStageAppearance,
} from '@tuturuuu/users-ui/components/post-status-meta';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState } from 'react';

interface Props {
  recipient: GroupPostRecipientRow;
  wsId: string;
  post: UserGroupPost;
  canUpdateUserGroupsPosts?: boolean;
  canApprovePosts?: boolean;
}

function UserCardEditor({
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

  const [notesDraft, setNotesDraft] = useState(recipient.notes ?? '');
  const notesEditRevision = useRef(0);
  const acknowledgedNotesRevision = useRef(0);

  useEffect(() => {
    if (notesEditRevision.current === acknowledgedNotesRevision.current) {
      setNotesDraft(recipient.notes ?? '');
    }
  }, [recipient.notes]);

  const [marker, setMarker] = useState(() => ({
    approvalStatus: recipient.approval_status as
      | PostApprovalStatus
      | null
      | undefined,
    hasCheck: Boolean(recipient.has_check),
    isCompleted: recipient.is_completed ?? null,
    notes: recipient.notes ?? null,
  }));

  useEffect(() => {
    setMarker({
      approvalStatus: recipient.approval_status as
        | PostApprovalStatus
        | null
        | undefined,
      hasCheck: Boolean(recipient.has_check),
      isCompleted: recipient.is_completed ?? null,
      notes: recipient.notes ?? null,
    });
  }, [
    recipient.approval_status,
    recipient.has_check,
    recipient.is_completed,
    recipient.notes,
  ]);

  const hasExistingCheck = marker.hasCheck;
  const approvalStatus = hasExistingCheck ? marker.approvalStatus : undefined;
  const stageAppearance = getPostReviewStageAppearance(
    recipient.review_stage as PostReviewStage
  );
  const approvalAppearance = approvalStatus
    ? getPostApprovalStatusAppearance(approvalStatus)
    : null;
  const queueAppearance = isPostEmailQueueStatus(
    recipient.queue_status ?? undefined
  )
    ? getPostEmailStatusAppearance(recipient.queue_status ?? undefined)
    : null;
  const deliveryIssueMessage =
    recipient.delivery_issue_reason === 'missing_email'
      ? tableT('delivery_issue_reason_missing_email')
      : recipient.delivery_issue_reason === 'missing_sender_platform_user'
        ? tableT('delivery_issue_reason_missing_sender_platform_user')
        : recipient.delivery_issue_reason === 'blacklisted_email_or_domain'
          ? tableT('delivery_issue_reason_blacklisted_email_or_domain')
          : null;
  const isEmailBlocked =
    recipient.delivery_issue_reason === 'blacklisted_email_or_domain';
  const stageIconClassName = cn(
    'mr-1 h-3.5 w-3.5 shrink-0',
    stageAppearance.iconClassName
  );
  const queueIconClassName = cn(
    'mr-1 h-3.5 w-3.5 shrink-0',
    queueAppearance?.iconClassName
  );

  const {
    mutate: handleSaveStatus,
    mutateAsync: saveStatus,
    isPending: isSavingStatus,
  } = useMutation({
    mutationFn: async ({
      isCompleted,
      notes,
    }: {
      isCompleted: boolean;
      notes?: string;
      notesRevision?: number;
    }) => {
      if (!recipient.user_id || !post.id || !post.group_id) {
        throw new Error('Missing required fields');
      }

      if (hasExistingCheck) {
        return updateUserGroupPostChecks(wsId, post.group_id, post.id, {
          is_completed: isCompleted,
          ...(notes === undefined ? {} : { notes }),
          user_id: recipient.user_id,
        });
      }

      return createUserGroupPostCheck(wsId, post.group_id, {
        is_completed: isCompleted,
        ...(notes === undefined ? {} : { notes }),
        post_id: post.id,
        user_id: recipient.user_id,
      });
    },
    onSuccess: async (_, variables) => {
      if (variables.notesRevision !== undefined) {
        acknowledgedNotesRevision.current = variables.notesRevision;
      }
      setMarker((current) => ({
        ...current,
        approvalStatus: current.hasCheck ? current.approvalStatus : 'PENDING',
        hasCheck: true,
        isCompleted: variables.isCompleted,
        notes: variables.notes ?? current.notes,
      }));
      toast.success(t('ws_post_details.status_save_success'));
      await queryClient.invalidateQueries({
        queryKey: ['group-post-checks', post.id],
      });
      router.refresh();
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t('ws_post_details.status_save_error')
      );
    },
  });

  const { mutate: handleClearStatus, isPending: isClearing } = useMutation({
    mutationFn: async () => {
      if (!recipient.user_id || !post.id || !post.group_id) {
        throw new Error('Missing required fields');
      }
      return clearUserGroupPostChecks(wsId, post.group_id, post.id, [
        recipient.user_id,
      ]);
    },
    onSuccess: async () => {
      notesEditRevision.current += 1;
      acknowledgedNotesRevision.current = notesEditRevision.current;
      setNotesDraft('');
      setMarker({
        approvalStatus: undefined,
        hasCheck: false,
        isCompleted: null,
        notes: null,
      });
      toast.success(t('ws_post_details.reset_check_success'));
      await queryClient.invalidateQueries({
        queryKey: ['group-post-checks', post.id],
      });
      router.refresh();
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t('ws_post_details.reset_check_error')
      );
    },
  });

  const handleSaveNotes = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasExistingCheck || isSavingStatus || isClearing) return;
    try {
      await saveStatus({
        isCompleted: marker.isCompleted ?? false,
        notes: notesDraft,
        notesRevision: notesEditRevision.current,
      });
    } catch {
      // onError reports the failure; keep the draft for a deliberate retry.
    }
  };

  const handleSaveCompletion = (isCompleted: boolean) => {
    const hasUnsavedNotes =
      notesEditRevision.current !== acknowledgedNotesRevision.current;
    handleSaveStatus({
      isCompleted,
      ...(hasUnsavedNotes
        ? { notes: notesDraft, notesRevision: notesEditRevision.current }
        : {}),
    });
  };

  return (
    <Card className="w-full rounded-lg border-border/60 p-4 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <Avatar className="h-12 w-12 shrink-0 rounded-full object-cover">
          <AvatarImage
            src={recipient.user_avatar_url || undefined}
            alt={recipient.recipient || 'User avatar'}
          />
          <AvatarFallback>
            {(recipient.recipient || recipient.email || 'U').charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-foreground text-lg [overflow-wrap:anywhere]">
              {recipient.recipient}
            </h3>
            {(recipient.email || recipient.user_phone) && (
              <p className="text-foreground text-sm [overflow-wrap:anywhere]">
                {recipient.email || recipient.user_phone}
              </p>
            )}
          </div>
          <div className="flex min-w-0 flex-wrap gap-2 sm:max-w-1/2 sm:flex-col sm:items-end">
            <Badge
              variant="outline"
              className={cn(
                'max-w-full whitespace-normal [overflow-wrap:anywhere]',
                stageAppearance.className
              )}
            >
              <stageAppearance.icon className={stageIconClassName} />
              {tableT(stageAppearance.labelKey)}
            </Badge>
            {approvalAppearance && (
              <Badge
                variant="outline"
                className={cn(
                  'max-w-full whitespace-normal text-[10px] opacity-90 [overflow-wrap:anywhere]',
                  approvalAppearance.className
                )}
              >
                <approvalAppearance.icon className="mr-1 h-3.5 w-3.5 shrink-0" />
                {tableT(approvalAppearance.labelKey)}
              </Badge>
            )}
            {queueAppearance && (
              <Badge
                variant="outline"
                className={cn(
                  'max-w-full whitespace-normal [overflow-wrap:anywhere]',
                  queueAppearance.className
                )}
              >
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

      {deliveryIssueMessage && (
        <div className="mb-3 rounded border border-dynamic-orange/20 bg-dynamic-orange/5 p-2 text-dynamic-orange text-sm">
          {deliveryIssueMessage}
        </div>
      )}

      <form onSubmit={handleSaveNotes} id={`notes-form-${recipient.user_id}`}>
        <Textarea
          name="notes"
          placeholder={tableT('notes_placeholder')}
          value={notesDraft}
          onChange={(event) => {
            notesEditRevision.current += 1;
            setNotesDraft(event.target.value);
          }}
          disabled={!hasExistingCheck || isClearing}
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

      {canApprovePosts &&
        !isEmailBlocked &&
        post.id &&
        recipient.user_id &&
        hasExistingCheck && (
          <div className="mt-4">
            <PostApprovalActions
              wsId={wsId}
              itemId={`${post.id}:${recipient.user_id}`}
              approvalStatus={approvalStatus ?? 'PENDING'}
              queueStatus={recipient.queue_status ?? undefined}
              canRemoveApproval={Boolean(recipient.can_remove_approval)}
              onStatusChange={(status) =>
                setMarker((current) => ({
                  ...current,
                  approvalStatus: status,
                }))
              }
            />
          </div>
        )}

      {canUpdateUserGroupsPosts && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            className="bg-dynamic-green text-background hover:bg-dynamic-green/90"
            onClick={() => handleSaveCompletion(true)}
            disabled={isSavingStatus || isClearing}
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
            onClick={() => handleSaveCompletion(false)}
            disabled={isSavingStatus || isClearing}
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
              variant="ghost"
              onClick={() => handleClearStatus()}
              disabled={isSavingStatus || isClearing}
              title={t('ws_post_details.reset_check_description')}
            >
              {isClearing ? (
                <LoaderCircle className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-1 h-4 w-4" />
              )}
              {t('ws_post_details.reset_check')}
            </Button>
          )}
          {hasExistingCheck && (
            <Button
              size="sm"
              variant="outline"
              type="submit"
              form={`notes-form-${recipient.user_id}`}
              disabled={isSavingStatus || isClearing}
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

export default function UserCard(props: Props) {
  return (
    <UserCardEditor
      key={`${props.wsId}:${props.post.id}:${props.recipient.user_id}`}
      {...props}
    />
  );
}
