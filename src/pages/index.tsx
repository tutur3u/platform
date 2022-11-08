import { ReactElement, useEffect } from 'react';
import { PageWithLayoutProps } from '../types/PageWithLayoutProps';
import Layout from '../components/layout/Layout';
import { Organization } from '../types/primitives/Organization';
import { openModal } from '@mantine/modals';
import OrgEditForm from '../components/forms/OrgEditForm';
import { withPageAuth } from '@supabase/auth-helpers-nextjs';
import { useOrgs } from '../hooks/useOrganizations';
import { mutate } from 'swr';
import LoadingIndicator from '../components/common/LoadingIndicator';
import { useAppearance } from '../hooks/useAppearance';
import { showNotification } from '@mantine/notifications';
import OrganizationInviteSnippet from '../components/notifications/OrganizationInviteSnippet';
import OrgPreviewCard from '../components/cards/OrgPreviewCard';

export const getServerSideProps = withPageAuth({ redirectTo: '/login' });

const Home: PageWithLayoutProps = () => {
  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment({
      content: 'Home',
      href: '/',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { isLoading, orgs, createOrg } = useOrgs();

  const maxOrgs = 3;

  useEffect(() => {
    mutate('/api/orgs');
  }, []);

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

  return isLoading ? (
    <div className="flex items-center justify-center">
      <LoadingIndicator className="h-8" />
    </div>
  ) : (
    <>
      {orgs.invited.length > 0 && (
        <div className="grid gap-8 mb-16">
          {orgs.invited.map((org) => (
            <OrganizationInviteSnippet
              key={org.id}
              org={org}
              onAccept={acceptInvite}
              onDecline={declineInvite}
            />
          ))}
        </div>
      )}

      {orgs.current.length > 0 ? (
        <div className="grid gap-8">
          {orgs.current.map((org) => (
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
        className={`w-full md:w-fit mt-8 font-semibold px-8 py-4 rounded ${
          orgs.current.length < maxOrgs
            ? 'bg-blue-300/20 hover:bg-blue-300/30 text-blue-300'
            : 'bg-gray-500/10 text-gray-500/50 cursor-not-allowed'
        } transition duration-300`}
        onClick={() =>
          orgs.current.length < maxOrgs ? showEditOrgModal() : null
        }
      >
        {orgs.current.length < maxOrgs
          ? 'New organization'
          : 'Maximum organizations reached'}
      </button>
    </>
  );
};

Home.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default Home;
