import { PlusIcon, TrashIcon } from '@heroicons/react/24/solid';
import { openModal } from '@mantine/modals';
import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import SelectUserForm from '../../../components/forms/SelectUserForm';
import NestedLayout from '../../../components/layout/NestedLayout';
import { useAppearance } from '../../../hooks/useAppearance';

const OrganizationMembersPage = () => {
  const router = useRouter();
  const { orgId } = router.query;

  const { data: orgData, error: orgError } = useSWR(
    orgId ? `/api/orgs/${orgId}` : null
  );

  const {
    data: membersData,
    error: membersError,
    mutate: mutateMembers,
  } = useSWR(orgId ? `/api/orgs/${orgId}/members` : null);

  const isLoadingOrg = !orgData && !orgError;
  const isLoadingMembers = !membersData && !membersError;

  const isLoading = isLoadingOrg || isLoadingMembers;

  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment(
      orgData?.name
        ? [
            {
              content: orgData.name,

              href: `/orgs/${orgData.id}`,
            },
            {
              content: 'Members',
              href: `/orgs/${orgData.id}/members`,
            },
          ]
        : []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgData?.name]);

  useEffect(() => {
    if (orgData?.error || orgError) router.push('/');
  }, [orgData, orgError, router]);

  if (isLoading) return <div>Loading...</div>;

  const deleteMember = async (memberId: string) => {
    await fetch(`/api/orgs/${orgId}/members/${memberId}`, {
      method: 'DELETE',
    });
    mutateMembers(
      (
        members: [
          {
            users: { id: string; display_name: string; email: string };
          }
        ]
      ) => {
        return members.filter((member) => member.users.id !== memberId);
      }
    );
    mutate(`/api/orgs/${orgId}`);
  };

  const showSelectUserForm = () => {
    openModal({
      title: <div className="font-semibold">Invite a member</div>,
      centered: true,
      children: <SelectUserForm />,
    });
  };

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h1 className="font-bold text-lg md:text-xl lg:text-2xl xl:text-3xl">
          Members ({membersData.length})
        </h1>
        <button
          onClick={showSelectUserForm}
          className="px-4 py-2 font-semibold rounded flex gap-1 bg-blue-300/20 text-blue-300 hover:bg-blue-300/10 transition"
        >
          Invite <PlusIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="max-w-lg flex flex-col gap-4">
        {membersData &&
          membersData.length > 0 &&
          membersData
            .map(
              (m: {
                users: { id: string; display_name: string; email: string };
              }) => m.users
            )
            .map(
              (member: { id: string; display_name: string; email: string }) => (
                <div
                  key={member.id}
                  className="relative p-4 border border-zinc-800/80 bg-[#19191d] rounded-lg"
                >
                  <p className="font-semibold lg:text-lg xl:text-xl">
                    {member.display_name}
                  </p>
                  <p className="text-zinc-400">{member.email}</p>

                  <button
                    className="absolute top-4 right-4 text-zinc-400 hover:text-red-400 transition duration-150"
                    onClick={() => deleteMember(member.id)}
                  >
                    <TrashIcon className="h-6 w-6" />
                  </button>
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
