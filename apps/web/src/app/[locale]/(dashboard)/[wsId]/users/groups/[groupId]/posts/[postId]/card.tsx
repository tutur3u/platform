'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Ban,
  Check,
  CircleSlash,
  Clock3,
  LoaderCircle,
  MailCheck,
  Save,
  X,
} from '@tuturuuu/icons';
import type { UserGroupPost } from '@tuturuuu/types/db';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Avatar, AvatarFallback } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { PostEmailQueueRow } from '@/lib/post-email-queue';

interface Props {
  user: WorkspaceUser;
  wsId: string;
  post: UserGroupPost;
  canUpdateUserGroupsPosts?: boolean;
  queueItem?: PostEmailQueueRow;
  initialCheck?: Partial<{
    user_id: string;
    post_id: string;
    is_completed: boolean | null;
    notes: string;
    created_at?: string;
    email_id?: string | null;
  }> | null;
  isLoadingChecks?: boolean;
}

function getQueueBadge(queueItem?: PostEmailQueueRow) {
  switch (queueItem?.status) {
    case 'sent':
      return {
        icon: MailCheck,
        className:
          'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green',
        label: 'Sent',
      };
    case 'processing':
      return {
        icon: LoaderCircle,
        className:
          'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue',
        label: 'Processing',
      };
    case 'failed':
      return {
        icon: AlertCircle,
        className: 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red',
        label: 'Failed',
      };
    case 'blocked':
      return {
        icon: Ban,
        className:
          'border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange',
        label: 'Blocked',
      };
    case 'cancelled':
      return {
        icon: CircleSlash,
        className: 'border-muted bg-muted text-muted-foreground',
        label: 'Cancelled',
      };
    default:
      return {
        icon: Clock3,
        className:
          'border-dynamic-yellow/20 bg-dynamic-yellow/10 text-dynamic-yellow',
        label: 'Queued',
      };
  }
}

function UserCard({
  user,
  wsId,
  post,
  canUpdateUserGroupsPosts = false,
  queueItem,
  initialCheck = null,
  isLoadingChecks = false,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const check = initialCheck;
  const isLoadingCheck = isLoadingChecks;
  const queueBadge = getQueueBadge(queueItem);
  const QueueIcon = queueBadge.icon;

  const { mutate: handleSaveStatus, isPending: isSaving } = useMutation({
    mutationFn: async ({
      isCompleted,
      notes,
    }: {
      isCompleted?: boolean | null;
      notes?: string;
    }) => {
      if (!user.id || !post.id || !post.group_id) {
        throw new Error('Missing required fields');
      }

      const finalNotes = notes ?? check?.notes ?? '';
      const method = check?.user_id && check?.post_id ? 'PUT' : 'POST';
      const endpoint =
        check?.user_id && check?.post_id
          ? `/api/v1/workspaces/${wsId}/user-groups/${post.group_id}/group-checks/${post.id}`
          : `/api/v1/workspaces/${wsId}/user-groups/${post.group_id}/group-checks`;

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...check,
          user_id: user.id,
          post_id: post.id,
          is_completed: isCompleted,
          notes: finalNotes,
        }),
      });

      if (!response.ok) {
        throw new Error('Error saving/updating data');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['group-post-checks', post.id],
      });
      router.refresh();
    },
  });

  const handleSaveNotes = (formData: FormData) => {
    const notes = formData.get('notes') as string;
    handleSaveStatus({
      notes,
      isCompleted: check?.is_completed ?? null,
    });
  };

  const isApproved = post.post_approval_status === 'APPROVED';

  return (
    <Card className="w-full rounded-lg p-4 shadow-md">
      <div className="mb-4 flex items-center">
        {user.avatar_url ? (
          <Image
            src={user.avatar_url}
            width={48}
            height={48}
            alt="User avatar"
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <Avatar className="h-12 w-12 rounded-full object-cover">
            <AvatarFallback>
              {user.full_name ? user.full_name.charAt(0) : 'u'}
            </AvatarFallback>
          </Avatar>
        )}
        <div className="ml-4 flex w-full items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-foreground text-lg">
              {user.full_name}
            </h3>
            {(user.email || user.phone) && (
              <p className="text-foreground text-sm">
                {user.email || user.phone}
              </p>
            )}
          </div>
          <Badge variant="outline" className={queueBadge.className}>
            <QueueIcon className="mr-1 h-3.5 w-3.5" />
            {queueBadge.label}
          </Badge>
        </div>
      </div>

      <form action={handleSaveNotes} id={`notes-form-${user.id}`}>
        <Textarea
          key={check?.notes}
          name="notes"
          placeholder="Notes"
          defaultValue={check?.notes || ''}
          disabled={isLoadingCheck || !check || !isApproved}
        />
      </form>

      {queueItem?.last_error && (
        <div className="mt-3 rounded border border-dynamic-red/20 bg-dynamic-red/5 p-2 text-dynamic-red text-xs">
          {queueItem.last_error}
        </div>
      )}

      <div className={cn('mt-4 flex flex-wrap justify-between gap-2')}>
        <div className="flex w-full items-center justify-center gap-2">
          {canUpdateUserGroupsPosts && (
            <Button
              type="submit"
              form={`notes-form-${user.id}`}
              disabled={isSaving || !check || !isApproved}
              variant="outline"
              className="w-full border"
            >
              <Save />
            </Button>
          )}
          {canUpdateUserGroupsPosts && (
            <Button
              variant={
                check?.is_completed != null && check.is_completed
                  ? 'outline'
                  : 'ghost'
              }
              onClick={() =>
                handleSaveStatus({
                  isCompleted: false,
                })
              }
              className={cn(
                check?.is_completed != null && !check.is_completed
                  ? 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/20 hover:text-dynamic-red'
                  : '',
                'w-full border'
              )}
              disabled={isSaving || !check || !isApproved}
            >
              <X />
            </Button>
          )}
          {canUpdateUserGroupsPosts && (
            <Button
              variant={check?.is_completed == null ? 'outline' : 'ghost'}
              onClick={() => handleSaveStatus({ isCompleted: null })}
              className={cn(
                check?.is_completed == null
                  ? 'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20 hover:text-dynamic-blue'
                  : '',
                'w-full border'
              )}
              disabled={isSaving || !check || !isApproved}
            >
              <CircleSlash />
            </Button>
          )}
          {canUpdateUserGroupsPosts && (
            <Button
              variant={check?.is_completed != null ? 'outline' : 'ghost'}
              onClick={() => handleSaveStatus({ isCompleted: true })}
              className={cn(
                check?.is_completed != null && check.is_completed
                  ? 'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/20 hover:text-dynamic-green'
                  : '',
                'w-full border'
              )}
              disabled={isSaving || !check || !isApproved}
            >
              <Check />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

export default UserCard;
