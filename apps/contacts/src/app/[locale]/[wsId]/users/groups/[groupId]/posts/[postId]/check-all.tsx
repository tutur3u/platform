'use client';

import { useMutation } from '@tanstack/react-query';
import { CheckCheck, RotateCcw } from '@tuturuuu/icons';
import {
  clearUserGroupPostChecks,
  updateUserGroupPostChecks,
} from '@tuturuuu/internal-api/posts';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function CheckAll({
  wsId,
  groupId,
  postId,
  users,
  completed,
  canUpdateUserGroupsPosts = false,
}: {
  wsId: string;
  groupId: string;
  postId: string;
  users: WorkspaceUser[];
  completed: boolean;
  canUpdateUserGroupsPosts?: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();

  const mutation = useMutation({
    mutationFn: (action: 'check' | 'clear') =>
      action === 'check'
        ? updateUserGroupPostChecks(
            wsId,
            groupId,
            postId,
            users.map((user) => ({
              is_completed: true,
              user_id: user.id,
            }))
          )
        : clearUserGroupPostChecks(
            wsId,
            groupId,
            postId,
            users.map((user) => user.id)
          ),
    onSuccess: (_, action) => {
      toast.success(
        t(
          action === 'check'
            ? 'ws_post_details.check_all_success'
            : 'ws_post_details.uncheck_all_success'
        )
      );
      router.refresh();
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t('ws_post_details.bulk_update_error')
      );
    },
  });

  const loading = mutation.isPending;

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        onClick={() => mutation.mutate('check')}
        disabled={loading || completed || !canUpdateUserGroupsPosts}
      >
        <CheckCheck className="mr-1" />
        {completed
          ? t('ws_post_details.completed')
          : t('ws_post_details.check_all')}
      </Button>
      <Button
        onClick={() => mutation.mutate('clear')}
        disabled={loading || !canUpdateUserGroupsPosts}
        variant="outline"
        title={t('ws_post_details.uncheck_all_description')}
      >
        <RotateCcw className="mr-1" />
        {t('ws_post_details.uncheck_all')}
      </Button>
    </div>
  );
}
