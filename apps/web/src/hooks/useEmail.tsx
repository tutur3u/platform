import PostEmailTemplate from '@/app/[locale]/(dashboard)/[wsId]/mail/default-email-template';
import GuestEmailTemplate from '@/app/[locale]/(dashboard)/[wsId]/mail/guest-email-template';
import type { UserGroupPost } from '@/app/[locale]/(dashboard)/[wsId]/users/groups/[groupId]/posts';
import { atom, useAtom } from 'jotai';
import { useState } from 'react';
import ReactDOMServer from 'react-dom/server';

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
    isGuest = false,
    users: rawUsers,
  }: {
    wsId: string;
    groupId: string;
    postId: string;
    isGuest?: boolean | null;
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

    const users = rawUsers.map((user) => ({
      ...user,
      content: ReactDOMServer.renderToString(
        isGuest ? (
          <GuestEmailTemplate
            studentName={user.username}
            className={post.title ?? ''}
            teacherName={
              undefined // Remove the non-existent property reference
            }
            avgScore={user.is_completed ? 85 : undefined}
            comments={user.notes}
          />
        ) : (
          <PostEmailTemplate
            post={post}
            username={user.username}
            isHomeworkDone={user?.is_completed}
            notes={user?.notes || undefined}
          />
        )
      ),
    }));

    const res = await fetch(
      `/api/v1/workspaces/${wsId}/user-groups/${groupId}/group-checks/${postId}/email`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          users,
          date: post.created_at,
          isGuest,
        }),
      }
    );

    if (!res.ok) {
      setLocalError('Failed to send email');
      setLocalLoading(false);
      setGlobalState({
        loading: false,
        error: 'Failed to send email',
        success: false,
      });
      return false;
    }

    setLocalSuccess(true);
    setLocalLoading(false);
    setGlobalState({ loading: false, error: null, success: true });
    return true;
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
