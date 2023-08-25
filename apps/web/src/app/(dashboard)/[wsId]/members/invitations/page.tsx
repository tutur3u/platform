import { Cog6ToothIcon, UserPlusIcon } from '@heroicons/react/24/solid';
import { Avatar, Divider, SegmentedControl, Tooltip } from '@mantine/core';
import { openModal } from '@mantine/modals';
import { showNotification } from '@mantine/notifications';
import { useUser } from '@supabase/auth-helpers-react';
import moment from 'moment';
import { mutate } from 'swr';
import useTranslation from 'next-translate/useTranslation';
import 'moment/locale/vi';
import useSWR from 'swr';
import { getInitials } from '@/utils/name-helper';
import LoadingIndicator from '@/components/common/LoadingIndicator';
import Filters from '../filters';
import PaginationIndicator from '@/components/pagination/PaginationIndicator';
import { User } from '@/types/primitives/User';
import { getRoleColor } from '@/utils/color-helper';
import WorkspaceMemberEditForm from '@/components/forms/WorkspaceMemberEditForm';
import SelectUserForm from '@/components/forms/SelectUserForm';
import { getWorkspace } from '@/lib/workspace-helper';

interface Props {
  params: {
    wsId: string;
  };
}

export default async function WorkspaceMemberInvitationsPage({
  params: { wsId },
}: Props) {
  const { t, lang } = useTranslation('ws-members');
  const ws = await getWorkspace(wsId);

  const membersLabel = t('workspace-tabs:members');

  const [activePage, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [view, roles, itemsPerPage]);

  const invitesApiPath = ws?.id
    ? `/api/workspaces/${ws.id}/members/invites` +
      // Add query params
      `?roles=${
        roles.length > 0 ? roles.join(',') : ''
      }&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  const { data: invitesData, error: invitesError } = useSWR<{
    data: User[];
    count: number;
  }>(invitesApiPath);

  const isLoading = !invitesData && !invitesError;

  const invites = invitesData?.data || [];

  const owners = invites?.filter((member) => member?.role === 'OWNER') || [];
  const ownersCount = owners?.length || 0;

  const disallowOwnerChange = ownersCount <= 1;

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

      // if (member.id === user?.id) router.push('/');
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
    if (!ws?.id || !user?.id || !member?.id) return;

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
      if (user.id === member.id) mutate(`/api/workspaces/${ws.id}`);
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
      children: (
        <SelectUserForm
          wsId={wsId as string}
          onComplete={() => mutate(invitesApiPath)}
        />
      ),
    });
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
    <>
      {wsId && (
        <>
          <div className="flex flex-col justify-between gap-4 rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 dark:border-zinc-800/80 dark:bg-zinc-900 md:flex-row md:items-start">
            <div>
              <h1 className="text-2xl font-bold">{membersLabel}</h1>
              <p className="text-zinc-700 dark:text-zinc-400">
                {t('description')}
              </p>
            </div>

            <div className="flex flex-col items-center justify-center gap-2 md:flex-row">
              <button
                onClick={showSelectUserForm}
                className="flex h-fit items-center justify-center gap-1 rounded border border-blue-500/10 bg-blue-500/10 px-4 py-2 font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20"
              >
                {t('invite_member')}
                <UserPlusIcon className="h-4 w-4" />
              </button>
              <SegmentedControl
                value={'joined'}
                data={[
                  {
                    label: `${t('joined')}`,
                    value: 'joined',
                  },
                  {
                    label: `${t('invited')}`,
                    value: 'invited',
                  },
                ]}
              />
            </div>
          </div>
          <Divider className="my-4" />
        </>
      )}

      <div className="flex min-h-full w-full flex-col ">
        <Filters />
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
          {isLoading ? (
            <div className="col-span-full flex items-center justify-center">
              <LoadingIndicator className="h-8" />
            </div>
          ) : (
            invites
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
                  className="relative rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 dark:border-zinc-800/80 dark:bg-zinc-900"
                >
                  <div className="flex items-center gap-2">
                    <Avatar
                      alt="Avatar"
                      src={member?.avatar_url}
                      size="2xl"
                      color="blue"
                      className="aspect-square w-full max-w-[3.5rem] rounded-full text-xl"
                    >
                      {getInitials(member?.display_name || '?')}
                    </Avatar>

                    <div>
                      <p className="font-semibold lg:text-lg xl:text-xl">
                        {member.display_name}{' '}
                        {member?.role_title ? (
                          <span className="text-orange-300">
                            ({member.role_title})
                          </span>
                        ) : null}
                      </p>
                      <p className="font-semibold text-blue-600 dark:text-blue-300">
                        @{member.handle}
                      </p>
                    </div>
                  </div>

                  <div className="absolute right-4 top-4 flex gap-2">
                    <button
                      className="font-semibold text-zinc-400 transition hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-200"
                      onClick={() => showEditModal(member)}
                    >
                      <Tooltip label={t('common:settings')}>
                        <Cog6ToothIcon className="h-6 w-6" />
                      </Tooltip>
                    </button>
                  </div>

                  <div className="mt-2 flex flex-col items-center justify-between gap-2 border-t border-zinc-300 pt-2 dark:border-zinc-800 lg:flex-row lg:gap-4">
                    {member?.created_at ? (
                      <div className="line-clamp-1 text-zinc-500">
                        {t('invited')}{' '}
                        <span className="font-semibold text-zinc-600 dark:text-zinc-400">
                          {moment(member.created_at).locale(lang).fromNow()}
                        </span>
                        .
                      </div>
                    ) : null}

                    <div
                      className={`w-full rounded border px-2 py-0.5 text-center font-semibold lg:w-fit ${getRoleColor(
                        member?.role?.toLocaleLowerCase() || 'unknown'
                      )}`}
                    >
                      {t(member?.role?.toLocaleLowerCase() || 'unknown')}
                    </div>
                  </div>
                </div>
              ))
          )}
        </div>
      </div>
    </>
  );
}
