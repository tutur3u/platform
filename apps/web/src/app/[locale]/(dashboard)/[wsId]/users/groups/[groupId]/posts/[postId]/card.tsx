'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Check,
  CircleSlash,
  Mail,
  MailCheck,
  MoveRight,
  Save,
  Send,
  X,
} from '@tuturuuu/icons';
import type { UserGroupPost } from '@tuturuuu/types/db';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Avatar, AvatarFallback } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { Textarea } from '@tuturuuu/ui/textarea';
import { isEmail } from '@tuturuuu/utils/email/client';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import useEmail from '@/hooks/useEmail';

interface Props {
  user: WorkspaceUser;
  wsId: string;
  post: UserGroupPost;
  hideEmailSending: boolean;
  disableEmailSending: boolean;
  isEmailBlacklisted?: boolean;
  canUpdateUserGroupsPosts?: boolean;
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

function UserCard({
  user,
  wsId,
  post,
  hideEmailSending,
  disableEmailSending,
  isEmailBlacklisted = false,
  canUpdateUserGroupsPosts = false,
  initialCheck = null,
  isLoadingChecks = false,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { sendEmail, localLoading, localError, localSuccess } = useEmail();

  useEffect(() => {
    if (localSuccess) router.refresh();
  }, [router, localSuccess]);

  // Use check data from parent query
  const check = initialCheck;
  const isLoadingCheck = isLoadingChecks;

  // Save or update group post check status
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

      if (isCompleted === check?.is_completed && finalNotes === check?.notes) {
        return check;
      }

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
      // Invalidate the parent query that fetches all checks
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

  const handleSendEmail = async () => {
    if (post && user.email && check?.is_completed != null) {
      await sendEmail({
        wsId,
        postId: post.id!,
        groupId: post.group_id!,
        post,
        users: [
          {
            id: user.id,
            email: user.email,
            username:
              user.full_name ||
              user.display_name ||
              user.email ||
              '<Chưa có tên>',
            notes: check?.notes || '',
            is_completed: check?.is_completed,
          },
        ],
      });
    }
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
        <div className="ml-4 w-full">
          <h3 className="font-semibold text-foreground text-lg">
            {user.full_name}
          </h3>
          {(user.email || user.phone) && (
            <p className="text-foreground text-sm">
              {user.email || user.phone}
            </p>
          )}
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

      <div
        className={cn(
          'mt-4 flex flex-wrap justify-between gap-2',
          hideEmailSending && 'justify-end'
        )}
      >
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
              variant={check?.is_completed != null ? 'outline' : 'ghost'}
              onClick={() =>
                handleSaveStatus({
                  isCompleted: null,
                })
              }
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
              variant={check?.is_completed == null ? 'outline' : 'ghost'}
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

        {hideEmailSending ? (
          <div>
            <Button variant="secondary" disabled>
              {disableEmailSending || localSuccess ? (
                <MailCheck className="h-6 w-6" />
              ) : (
                <Send className="h-6 w-6" />
              )}
            </Button>
          </div>
        ) : (
          <div className="w-full">
            <Button
              onClick={handleSendEmail}
              disabled={
                disableEmailSending ||
                isEmailBlacklisted ||
                localSuccess ||
                localLoading ||
                !user.email ||
                !isEmail(user.email) ||
                check?.is_completed == null ||
                isSaving ||
                !check ||
                !isApproved
              }
              variant={
                localLoading ||
                disableEmailSending ||
                localSuccess ||
                isEmailBlacklisted
                  ? 'secondary'
                  : undefined
              }
              className="w-full"
            >
              <Mail className="mr-2" />
              <span className="flex items-center justify-center opacity-70">
                {localLoading ? (
                  <LoadingIndicator />
                ) : isEmailBlacklisted ? (
                  'Email blacklisted'
                ) : disableEmailSending || localSuccess ? (
                  'Email sent'
                ) : (
                  'Send email'
                )}
              </span>
              {user.email && (
                <>
                  <MoveRight className="mx-2 hidden h-4 w-4 opacity-70 md:inline-block" />
                  <span className="hidden underline md:inline-block">
                    {user.email}
                  </span>
                </>
              )}
            </Button>
            {localError && (
              <div
                role="alert"
                aria-live="assertive"
                className="mt-2 flex items-start gap-2 rounded border border-dynamic-red/15 bg-dynamic-red/15 p-2 text-dynamic-red text-sm"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="flex-1 text-xs">
                  <div className="font-semibold text-sm">
                    Failed to send email
                  </div>
                  <div className="wrap-break-word opacity-80">
                    {String(localError)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

export default UserCard;
