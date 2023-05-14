import {
  ArrowUturnLeftIcon,
  Cog6ToothIcon,
  UserPlusIcon,
} from '@heroicons/react/24/solid';
import { Divider, SegmentedControl, Tooltip } from '@mantine/core';
import { openModal } from '@mantine/modals';
import { showNotification } from '@mantine/notifications';
import { useUser } from '@supabase/auth-helpers-react';
import moment from 'moment';
import { useRouter } from 'next/router';
import { ReactElement, useEffect, useState } from 'react';
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
import WorkspaceMemberEditForm from '../../components/forms/WorkspaceMemberEditForm';
import PaginationIndicator from '../../components/pagination/PaginationIndicator';
import PaginationSelector from '../../components/selectors/PaginationSelector';
import ModeSelector, { Mode } from '../../components/selectors/ModeSelector';
import { useLocalStorage } from '@mantine/hooks';
import MemberRoleMultiSelector from '../../components/selectors/MemberRoleMultiSelector';
import useSWR from 'swr';
import LoadingIndicator from '../../components/common/LoadingIndicator';

export const getServerSideProps = enforceHasWorkspaces;

const WorkspaceMembersPage = () => {
  const { t, lang } = useTranslation('ws-members');

  const loadingLabel = t('common:loading');
  const membersLabel = t('workspace-tabs:members');

  const router = useRouter();
  const { wsId } = router.query;

  const { ws } = useWorkspaces();

  const [view, setView] = useState<'members' | 'invited'>('members');
  const [activePage, setPage] = useState(1);

  const [roles, setRoles] = useState<string[]>([]);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'ws-members-items-per-page',
    defaultValue: 15,
  });

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'members-mode',
    defaultValue: 'grid',
  });

  useEffect(() => {
    setPage(1);
  }, [view, roles, itemsPerPage]);

  const apiPath = ws?.id
    ? (view === 'members'
        ? `/api/workspaces/${ws.id}/members`
        : `/api/workspaces/${ws.id}/members/invites`) +
      // Add query params
      `?roles=${
        roles.length > 0 ? roles.join(',') : ''
      }&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  const { data, error } = useSWR<{ data: User[]; count: number }>(apiPath);

  const isMembersLoading = !data && !error;

  const members = data?.data || [];
  const owners = members?.filter((member) => member?.role === 'OWNER') || [];
  const ownersCount = owners?.length || 0;

  const disallowOwnerChange = ownersCount <= 1;

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
    if (!user?.id || !member?.id) return;

    const response = await fetch(
      `/api/workspaces/${wsId}/members/${member.id}${
        invited ? '?invited=true' : ''
      }`,
      {
        method: 'DELETE',
      }
    );

    if (response.ok) {
      if (user.id === member.id) mutate(`/api/workspaces/current`);
      else mutate(apiPath);

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

  const updateMember = async (wsId: string, member: User) => {
    if (!member?.id) return;

    const response = await fetch(
      `/api/workspaces/${wsId}/members/${member.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: member.role,
          role_title: member.role_title,
        } as User),
      }
    );

    if (response.ok) {
      mutate(apiPath);
      showNotification({
        title: t('member-updated'),
        message: `${member?.display_name || member?.email} ${t(
          'has-been-updated'
        )}`,
        color: 'teal',
      });
    } else {
      showNotification({
        title: t('error'),
        message: `${t('update-error')} ${
          member?.display_name || member?.email
        }`,
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

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'member':
        return 'border-blue-300/10 bg-blue-300/10 text-blue-300';

      case 'admin':
        return 'border-orange-300/10 bg-orange-300/10 text-orange-300';

      case 'owner':
        return 'border-purple-300/10 bg-purple-300/10 text-purple-300';

      default:
        return 'border-zinc-800/80 bg-zinc-900 text-zinc-400';
    }
  };

  const showEditModal = (member: User) => {
    if (!ws?.id || !user?.id || !ws?.role) return;

    openModal({
      title: <div className="font-semibold">{t('member-settings')}</div>,
      centered: true,
      children: (
        <WorkspaceMemberEditForm
          currentUserId={user.id}
          currentRole={ws.role}
          wsId={ws.id}
          user={member}
          onSubmit={async (wsId, user) => await updateMember(wsId, user)}
          onDelete={async () => await deleteMember(member, false)}
          disallowOwnerChange={disallowOwnerChange}
        />
      ),
    });
  };

  return (
    <div className="pb-20">
      <HeaderX label={`${membersLabel} – ${ws?.name}`} />

      {wsId && (
        <>
          <div className="flex items-start justify-between gap-4 rounded-lg border border-zinc-800/80 bg-zinc-900 p-4">
            <div>
              <h1 className="text-2xl font-bold">
                {view === 'members' ? membersLabel : t('pending_invitations')}{' '}
                <span className="rounded-lg bg-purple-300/20 px-2 text-lg text-purple-300">
                  {members?.length || 0}
                </span>
              </h1>
              <p className="text-zinc-400">{t('description')}</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={showSelectUserForm}
                className="flex h-fit items-center justify-center gap-1 rounded border border-blue-300/10 bg-blue-300/10 px-4 py-2 font-semibold text-blue-300 transition hover:bg-blue-300/20"
              >
                {t('invite_member')}
                <UserPlusIcon className="h-4 w-4" />
              </button>{' '}
              <SegmentedControl
                value={view}
                onChange={(value) => setView(value as 'members' | 'invited')}
                data={[
                  { label: membersLabel, value: 'members' },
                  { label: t('invited'), value: 'invited' },
                ]}
              />
            </div>
          </div>
          <Divider className="my-4" />
        </>
      )}

      <div className="flex min-h-full w-full flex-col pb-20">
        <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ModeSelector mode={mode} setMode={setMode} showAll />
          <PaginationSelector
            items={itemsPerPage}
            setItems={(size) => {
              setPage(1);
              setItemsPerPage(size);
            }}
          />
          <MemberRoleMultiSelector
            roles={view === 'members' ? roles : []}
            setRoles={setRoles}
            disabled={view === 'invited'}
          />
        </div>

        <Divider className="mt-4" variant="dashed" />
        <PaginationIndicator
          activePage={activePage}
          setActivePage={setPage}
          itemsPerPage={itemsPerPage}
          totalItems={data?.count || 0}
        />

        <div
          className={`grid items-end gap-4 ${
            mode === 'grid' ? 'md:grid-cols-2' : ''
          }`}
        >
          {isMembersLoading ? (
            <div className="col-span-full flex items-center justify-center">
              <LoadingIndicator className="h-8" />
            </div>
          ) : (
            members
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
                  className="relative rounded-lg border border-zinc-800/80 bg-zinc-900 p-4"
                >
                  <p className="font-semibold lg:text-lg xl:text-xl">
                    {member.display_name}{' '}
                    {member?.role_title ? (
                      <span className="text-orange-300">
                        ({member.role_title})
                      </span>
                    ) : null}
                  </p>
                  <p className="text-blue-300">@{member.handle}</p>

                  <div className="absolute right-4 top-4 flex gap-2">
                    <button
                      className="font-semibold text-zinc-400 transition duration-150 hover:text-zinc-200"
                      onClick={
                        view === 'members'
                          ? () => showEditModal(member)
                          : () => deleteMember(member, true)
                      }
                    >
                      <Tooltip
                        label={
                          view === 'members'
                            ? t('common:settings')
                            : t('revoke_invitation')
                        }
                      >
                        {view === 'members' ? (
                          <Cog6ToothIcon className="h-6 w-6" />
                        ) : (
                          <ArrowUturnLeftIcon className="h-6 w-6" />
                        )}
                      </Tooltip>
                    </button>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-4 border-t border-zinc-800 pt-2">
                    {member?.created_at ? (
                      <div className="text-zinc-500">
                        {view === 'members' ? t('member_since') : t('invited')}{' '}
                        <span className="font-semibold text-zinc-400">
                          {moment(member.created_at).locale(lang).fromNow()}
                        </span>
                        .
                      </div>
                    ) : null}

                    {view === 'members' && (
                      <div
                        className={`rounded border px-2 py-0.5 font-semibold ${getRoleColor(
                          member?.role?.toLocaleLowerCase() || 'unknown'
                        )}`}
                      >
                        {t(member?.role?.toLocaleLowerCase() || 'unknown')}
                      </div>
                    )}
                  </div>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
};

WorkspaceMembersPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="workspace">{page}</NestedLayout>;
};

export default WorkspaceMembersPage;
