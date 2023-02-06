import {
  ArrowRightOnRectangleIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import { Tooltip } from '@mantine/core';
import { openModal } from '@mantine/modals';
import { showNotification } from '@mantine/notifications';
import { useUser } from '@supabase/auth-helpers-react';
import moment from 'moment';
import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { useAppearance } from '../../../hooks/useAppearance';
import { User } from '../../../types/primitives/User';
import SelectUserForm from '../../../components/forms/SelectUserForm';

const OrganizationMembersPage = () => {
  const router = useRouter();
  const { orgId } = router.query;

  const { data: orgData, error: orgError } = useSWR(
    orgId ? `/api/orgs/${orgId}` : null
  );

  const { data: membersData, error: membersError } = useSWR(
    orgId ? `/api/orgs/${orgId}/members` : null
  );

  const isLoadingOrg = !orgData && !orgError;
  const isLoadingMembers = !membersData && !membersError;

  const isLoading = isLoadingOrg || isLoadingMembers;

  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment(
      orgId
        ? [
            {
              content: orgData?.name ?? 'Loading...',
              href: `/orgs/${orgId}`,
            },
            {
              content: 'Members',
              href: `/orgs/${orgId}/members`,
            },
          ]
        : []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, orgData?.name]);

  useEffect(() => {
    if (orgData?.error || orgError) router.push('/');
  }, [orgData, orgError, router]);

  const user = useUser();

  if (isLoading) return <div>Loading...</div>;

  const deleteMember = async (member: User, invited: boolean) => {
    if (!member?.id) return;

    const response = await fetch(
      `/api/orgs/${orgId}/members/${member.id}${
        invited ? '?invited=true' : ''
      }`,
      {
        method: 'DELETE',
      }
    );

    if (response.ok) {
      mutate(`/api/orgs/${orgId}/members`);
      showNotification({
        title: invited ? 'Invitation revoked' : 'Member removed',
        message: invited
          ? `Invitation to ${
              (member?.username && `@${member?.username}`) ||
              member?.displayName ||
              member?.email
            } has been revoked`
          : `${
              member?.displayName || member?.email
            } has been removed from the organization`,
        color: 'teal',
      });

      if (member.id === user?.id) router.push('/');
    } else {
      showNotification({
        title: invited
          ? 'Could not revoke invitation'
          : 'Could not remove member',
        message: 'Something went wrong',
      });
    }
  };

  const showSelectUserForm = () => {
    if (!orgId) return;
    openModal({
      title: <div className="font-semibold">Invite a member</div>,
      centered: true,
      children: <SelectUserForm orgId={orgId as string} />,
    });
  };

  return (
    <>
      {orgId && (
        <div className="mt-2 mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold md:text-xl lg:text-2xl xl:text-3xl">
            Members ({membersData?.members?.length || 0})
          </h1>
          <button
            onClick={showSelectUserForm}
            className="flex items-center gap-1 rounded bg-blue-300/20 px-4 py-2 font-semibold text-blue-300 transition hover:bg-blue-300/10"
          >
            Invite <PlusIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mb-16 flex max-w-lg flex-col gap-4">
        {membersData?.members
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
          ?.map(
            (member: {
              id: string;
              display_name: string;
              email: string;
              created_at?: string;
            }) => (
              <div
                key={member.id}
                className="relative rounded-lg border border-zinc-800/80 bg-[#19191d] p-4"
              >
                <p className="font-semibold lg:text-lg xl:text-xl">
                  {member.display_name}
                </p>
                <p className="text-zinc-400">{member.email}</p>

                <button
                  className="absolute top-4 right-4 font-semibold text-zinc-400 transition duration-150 hover:text-red-400"
                  onClick={() => deleteMember(member, false)}
                >
                  {user?.id === member.id ? (
                    <Tooltip label="Leave">
                      <ArrowRightOnRectangleIcon className="h-6 w-6" />
                    </Tooltip>
                  ) : (
                    <Tooltip label="Remove member">
                      <XMarkIcon className="h-6 w-6" />
                    </Tooltip>
                  )}
                </button>

                {member?.created_at ? (
                  <div className="mt-2 border-t border-zinc-800 pt-2 text-zinc-500">
                    Member since{' '}
                    <span className="font-semibold text-zinc-400">
                      {moment(member.created_at).fromNow()}
                    </span>
                    .
                  </div>
                ) : null}
              </div>
            )
          )}
      </div>

      <h1 className="mb-4 text-lg font-bold md:text-xl lg:text-2xl xl:text-3xl">
        Pending invitations ({membersData?.invites?.length || 0})
      </h1>

      <div className="flex max-w-lg flex-col gap-4">
        {membersData?.invites?.map(
          (member: {
            id: string;
            display_name: string;
            email: string;
            created_at?: string;
          }) => (
            <div
              key={member.id}
              className="relative rounded-lg border border-zinc-800/80 bg-[#19191d] p-4"
            >
              <p className="font-semibold lg:text-lg xl:text-xl">
                {member.display_name}
              </p>
              <p className="text-zinc-400">{member.email}</p>

              <button
                className="absolute top-4 right-4 font-semibold text-zinc-400 transition duration-150 hover:text-red-400"
                onClick={() => deleteMember(member, true)}
              >
                <Tooltip label="Revoke invitation">
                  <XMarkIcon className="h-6 w-6" />
                </Tooltip>
              </button>

              {member?.created_at ? (
                <div className="mt-2 border-t border-zinc-800 pt-2 text-zinc-500">
                  Invited{' '}
                  <span className="font-semibold text-zinc-400">
                    {moment(member.created_at).fromNow()}
                  </span>
                  .
                </div>
              ) : null}
            </div>
          )
        )}
      </div>
    </>
  );
};

OrganizationMembersPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout>{page}</NestedLayout>;
};

export default OrganizationMembersPage;
