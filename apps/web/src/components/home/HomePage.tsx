import { useEffect } from 'react';
import { useAppearance } from '../../hooks/useAppearance';
import { useUserData } from '../../hooks/useUserData';
import { useUserList } from '../../hooks/useUserList';
import { Organization } from '../../types/primitives/Organization';
import { useOrgs } from '../../hooks/useOrganizations';
import { openModal } from '@mantine/modals';
import OrgEditForm from '../forms/OrgEditForm';
import { showNotification } from '@mantine/notifications';
import { mutate } from 'swr';
import HeaderX from '../metadata/HeaderX';
import LoadingIndicator from '../common/LoadingIndicator';
import OrganizationInviteSnippet from '../notifications/OrganizationInviteSnippet';
import OrgPreviewCard from '../cards/OrgPreviewCard';

const HomePage = () => {
  const { setRootSegment, changeLeftSidebarSecondaryPref } = useAppearance();
  const { updateUsers } = useUserList();
  const { data } = useUserData();

  useEffect(() => {
    changeLeftSidebarSecondaryPref('hidden');

    setRootSegment({
      content: 'Home',
      href: '/',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (data) updateUsers([data]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const { isLoading, orgs, createOrg } = useOrgs();
  const addOrg = (org: Organization) => createOrg(org);

  const showEditOrgModal = (org?: Organization) => {
    openModal({
      title: 'New organization',
      centered: true,
      children: <OrgEditForm org={org} onSubmit={addOrg} />,
    });
  };

  const acceptInvite = async (org: Organization) => {
    const response = await fetch(`/api/orgs/${org.id}/invites`, {
      method: 'POST',
    });

    if (response.ok) {
      mutate('/api/orgs');
      showNotification({
        title: `Accepted invite to ${org.name}`,
        message: 'You can now access this organization',
      });
    } else {
      showNotification({
        title: `Failed to accept invite to ${org.name}`,
        message: 'Please try again later',
      });
    }
  };

  const declineInvite = async (org: Organization) => {
    const response = await fetch(`/api/orgs/${org.id}/invites`, {
      method: 'DELETE',
    });

    if (response.ok) {
      mutate('/api/orgs');
    } else {
      showNotification({
        title: `Failed to decline invite to ${org.name}`,
        message: 'Please try again later',
      });
    }
  };

  return (
    <div className="p-4 md:p-8">
      <HeaderX label="Home" />
      {isLoading ? (
        <div className="flex items-center justify-center">
          <LoadingIndicator className="h-8" />
        </div>
      ) : (
        <>
          {orgs?.invited?.length > 0 && (
            <div className="mb-16 grid gap-8">
              {orgs?.invited?.map((org) => (
                <OrganizationInviteSnippet
                  key={org.id}
                  org={org}
                  onAccept={acceptInvite}
                  onDecline={declineInvite}
                />
              ))}
            </div>
          )}

          {orgs?.current?.length > 0 ? (
            <div className="grid gap-8">
              {orgs?.current
                // sort org with nill uuid first, since it's the root org
                // and should be displayed first
                ?.sort((a) =>
                  a.id === '00000000-0000-0000-0000-000000000000' ? -1 : 1
                )
                ?.map((org) => (
                  <OrgPreviewCard key={org.id} org={org} />
                ))}
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="flex flex-row">
                You are not a member of any organizations.
              </div>
            </div>
          )}

          <button
            className="mt-8 w-full rounded bg-blue-300/20 px-8 py-4 font-semibold text-blue-300 transition duration-300 hover:bg-blue-300/30 md:w-fit"
            onClick={() => showEditOrgModal()}
          >
            New organization
          </button>
        </>
      )}
    </div>
  );
};

export default HomePage;
