import {
  ArrowRightOnRectangleIcon,
  UserPlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import { Divider, Tooltip } from '@mantine/core';
import { openModal } from '@mantine/modals';
import { showNotification } from '@mantine/notifications';
import { useUser } from '@supabase/auth-helpers-react';
import moment from 'moment';
import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';
import { mutate } from 'swr';
import NestedLayout from '../../components/layouts/NestedLayout';
import { useSegments } from '../../hooks/useSegments';
import { User } from '../../types/primitives/User';
import SelectUserForm from '../../components/forms/SelectUserForm';
import HeaderX from '../../components/metadata/HeaderX';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { enforceHasWorkspaces } from '../../utils/serverless/enforce-has-workspaces';
import useTranslation from 'next-translate/useTranslation';
import 'moment/locale/vi';

export const getServerSideProps = enforceHasWorkspaces;

const WorkspaceMembersPage = () => {
  const { t, lang } = useTranslation('ws-members');

  const loadingLabel = t('common:loading');
  const membersLabel = t('workspace-tabs:members');

  const router = useRouter();
  const { wsId } = router.query;

  const { ws, members, memberInvites } = useWorkspaces();

  const { setRootSegment } = useSegments();

  useEffect(() => {
    setRootSegment(
      wsId
        ? [
            {
              content: ws?.name ?? loadingLabel,
              href: `/${wsId}`,
            },
            {
              content: membersLabel,
              href: `/${wsId}/members`,
            },
          ]
        : []
    );
  }, [setRootSegment, wsId, loadingLabel, membersLabel, ws?.name]);

  const user = useUser();

  const deleteMember = async (member: User, invited: boolean) => {
    if (!member?.id) return;

    const response = await fetch(
      `/api/workspaces/${wsId}/members/${member.id}${
        invited ? '?invited=true' : ''
      }`,
      {
        method: 'DELETE',
      }
    );

    if (response.ok) {
      mutate(`/api/workspaces/${wsId}/members`);
      mutate(`/api/workspaces/${wsId}/members/invites`);
      showNotification({
        title: invited ? t('invitation_revoked') : t('member_removed'),
        message: invited
          ? `${t('invitation_to')} ${
              (member?.handle && `@${member?.handle}`) ||
              member?.display_name ||
              member?.email
            } ${t('has_been_revoked')}`
          : `${member?.display_name || member?.email} ${t('has_been_removed')}`,
        color: 'teal',
      });

      if (member.id === user?.id) router.push('/');
    } else {
      showNotification({
        title: t('error'),
        message: invited
          ? t('revoke_error')
          : `${t('remove_error')} ${member?.display_name || member?.email}`,
      });
    }
  };

  const showSelectUserForm = () => {
    openModal({
      title: <div className="font-semibold">{t('invite_member')}</div>,
      centered: true,
      children: <SelectUserForm wsId={wsId as string} />,
    });
  };

  return (
    <div className="pb-20">
      <HeaderX label={`${membersLabel} – ${ws?.name}`} />

      {wsId && (
        <>
          <div className="rounded-lg bg-zinc-900 p-4">
            <h1 className="text-2xl font-bold">
              {membersLabel}{' '}
              <span className="rounded-lg bg-purple-300/20 px-2 text-lg text-purple-300">
                {members?.length || 0}
              </span>
            </h1>
            <p className="text-zinc-400">{t('description')}</p>
          </div>
          <Divider className="my-4" />
        </>
      )}

      {wsId && (
        <button
          onClick={showSelectUserForm}
          className="flex items-center gap-1 rounded bg-blue-300/20 px-4 py-2 font-semibold text-blue-300 transition hover:bg-blue-300/10"
        >
          {t('invite_member')}
          <UserPlusIcon className="h-4 w-4" />
        </button>
      )}

      <div className="mb-8 mt-4 grid gap-4 md:grid-cols-2">
        {members
          ?.sort(
            (
              a: {
                id: string;
              },
              b: {
                id: string;
              }
            ) => {
              if (a.id === user?.id) return -1;
              if (b.id === user?.id) return 1;
              return 0;
            }
          )
          ?.map((member) => (
            <div
              key={member.id}
              className="relative rounded-lg border border-zinc-800/80 bg-[#19191d] p-4"
            >
              <p className="font-semibold lg:text-lg xl:text-xl">
                {member.display_name}
              </p>
              <p className="text-blue-300">@{member.handle}</p>

              <button
                className="absolute right-4 top-4 font-semibold text-zinc-400 transition duration-150 hover:text-red-400"
                onClick={() => deleteMember(member, false)}
              >
                {user?.id === member.id ? (
                  <Tooltip label={t('leave')}>
                    <ArrowRightOnRectangleIcon className="h-6 w-6" />
                  </Tooltip>
                ) : (
                  <Tooltip label={t('remove_member')}>
                    <XMarkIcon className="h-6 w-6" />
                  </Tooltip>
                )}
              </button>

              {member?.created_at ? (
                <div className="mt-2 border-t border-zinc-800 pt-2 text-zinc-500">
                  {t('member_since')}{' '}
                  <span className="font-semibold text-zinc-400">
                    {moment(member.created_at).locale(lang).fromNow()}
                  </span>
                  .
                </div>
              ) : null}
            </div>
          ))}
      </div>

      <h1 className="mb-4 text-lg font-bold md:text-xl lg:text-2xl xl:text-3xl">
        {t('pending_invitations')} ({memberInvites?.length || 0})
      </h1>

      <div className="mb-8 mt-4 grid gap-4 md:grid-cols-2">
        {memberInvites?.map((member) => (
          <div
            key={member.id}
            className="relative rounded-lg border border-zinc-800/80 bg-[#19191d] p-4"
          >
            <p className="font-semibold lg:text-lg xl:text-xl">
              {member.display_name}
            </p>
            <p className="text-blue-300">@{member.handle}</p>

            <button
              className="absolute right-4 top-4 font-semibold text-zinc-400 transition duration-150 hover:text-red-400"
              onClick={() => deleteMember(member, true)}
            >
              <Tooltip label={t('revoke_invitation')}>
                <XMarkIcon className="h-6 w-6" />
              </Tooltip>
            </button>

            {member?.created_at ? (
              <div className="mt-2 border-t border-zinc-800 pt-2 text-zinc-500">
                {t('invited')}{' '}
                <span className="font-semibold text-zinc-400">
                  {moment(member.created_at).fromNow()}
                </span>
                .
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};

WorkspaceMembersPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="workspace">{page}</NestedLayout>;
};

export default WorkspaceMembersPage;
