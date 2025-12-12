import { toast } from '@tuturuuu/ui/sonner';
import { atom, useAtom } from 'jotai';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { UserGroupPost } from '@/app/[locale]/(dashboard)/[wsId]/users/groups/[groupId]/posts';

interface EmailState {
  loading: boolean;
  error: string | null;
  success: boolean;
}

const emailGlobalStateAtom = atom<EmailState>({
  loading: false,
  error: null,
  success: false,
});

const useEmail = () => {
  const [globalState, setGlobalState] = useAtom(emailGlobalStateAtom);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = useState(false);

  const t = useTranslations();

  const sendEmail = async ({
    wsId,
    groupId,
    postId,
    post,
    users: rawUsers,
  }: {
    wsId: string;
    groupId: string;
    postId: string;
    post: UserGroupPost;
    users: {
      id: string;
      email: string;
      username: string;
      notes: string;
      is_completed: boolean;
    }[];
  }): Promise<boolean> => {
    setLocalLoading(true);
    setLocalError(null);
    setLocalSuccess(false);
    setGlobalState({ loading: true, error: null, success: false });

    try {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/group-checks/${postId}/email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            users: rawUsers,
            post,
            date: post.created_at,
          }),
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        let errorMessage =
          data?.message ||
          data?.error ||
          `${t('email_service.send_failed')} (${res.status})`;

        // Handle explicit blocked message
        if (
          res.status === 429 ||
          errorMessage.toLowerCase().includes('rate limit')
        ) {
          if (data?.rateLimitInfo) {
            errorMessage = t('email_service.rate_limit_exceeded_details', {
              usage: data.rateLimitInfo.usage,
              limit: data.rateLimitInfo.limit,
              retryAfter: Math.ceil(data.rateLimitInfo.retryAfter / 1000), // ms to s
              limitType: data.rateLimitInfo.limitType,
            });
          } else {
            errorMessage = t('email_service.rate_limit_blocked');
          }
          toast.error(errorMessage);
        } else {
          toast.error(errorMessage);
        }

        setLocalError(errorMessage);
        setLocalLoading(false);
        setGlobalState({
          loading: false,
          error: errorMessage,
          success: false,
        });
        return false;
      }

      // Handle partial success / checking specific counts
      const { successCount, failureCount, blockedCount, alreadySentCount } =
        data;

      if (blockedCount > 0) {
        if (data?.rateLimitInfo) {
          toast.warning(
            t('email_service.rate_limit_exceeded_details', {
              usage: data.rateLimitInfo.usage,
              limit: data.rateLimitInfo.limit,
              retryAfter: Math.ceil(data.rateLimitInfo.retryAfter / 1000),
              limitType: data.rateLimitInfo.limitType,
            })
          );
        } else {
          toast.warning(
            t('email_service.emails_blocked_count', { count: blockedCount })
          );
        }
      } else if (failureCount > 0) {
        toast.error(
          t('email_service.emails_send_failed_count', { count: failureCount })
        );
      } else if (alreadySentCount > 0 && successCount === 0) {
        toast.info(t('email_service.emails_already_sent'));
      } else {
        toast.success(
          t('email_service.emails_sent_success', { count: successCount })
        );
      }

      setLocalSuccess(true);
      setLocalLoading(false);
      setGlobalState({ loading: false, error: null, success: true });
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : t('email_service.unexpected_error');

      toast.error(errorMessage);

      setLocalError(errorMessage);
      setLocalLoading(false);
      setGlobalState({
        loading: false,
        error: errorMessage,
        success: false,
      });
      return false;
    }
  };

  return {
    sendEmail,
    localLoading,
    localError,
    localSuccess,
    globalState,
    setGlobalState,
  };
};

export default useEmail;
