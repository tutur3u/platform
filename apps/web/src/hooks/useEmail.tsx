import type { UserGroupPost } from '@/app/[locale]/(dashboard)/[wsId]/users/groups/[groupId]/posts';
import { atom, useAtom } from 'jotai';
import { useState } from 'react';

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

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMessage =
          errorData?.message ||
          errorData?.error ||
          `Failed to send email (${res.status})`;
        setLocalError(errorMessage);
        setLocalLoading(false);
        setGlobalState({
          loading: false,
          error: errorMessage,
          success: false,
        });
        return false;
      }

      setLocalSuccess(true);
      setLocalLoading(false);
      setGlobalState({ loading: false, error: null, success: true });
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'An unexpected error occurred';
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
