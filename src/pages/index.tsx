import { ReactElement, useEffect } from 'react';
import { PageWithLayoutProps } from '../types/PageWithLayoutProps';
import Layout from '../components/layout/Layout';
import { Organization } from '../types/primitives/Organization';
import { SparklesIcon } from '@heroicons/react/24/solid';
import { openModal } from '@mantine/modals';
import OrgEditForm from '../components/forms/OrgEditForm';
import { Project } from '../types/primitives/Project';
import ProjectEditForm from '../components/forms/ProjectEditForm';
import { withPageAuth } from '@supabase/auth-helpers-nextjs';
import { useOrgs } from '../hooks/useOrganizations';
import { mutate } from 'swr';
import LoadingIndicator from '../components/common/LoadingIndicator';
import Link from 'next/link';
import { useAppearance } from '../hooks/useAppearance';
import { showNotification } from '@mantine/notifications';
import OrganizationInviteSnippet from '../components/notifications/OrganizationInviteSnippet';

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

  const showEditProjectModal = (orgId: string, project?: Project) => {
    openModal({
      title: project?.id ? 'Edit project' : 'New project',
      centered: true,
      children: <ProjectEditForm orgId={orgId} project={project} />,
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
            <div key={org.id}>
              <Link
                href={`/orgs/${org.id}`}
                className="text-zinc-300 hover:text-blue-200 text-2xl font-semibold transition duration-150"
              >
                {org?.name || `Unnamed organization`}{' '}
                {org?.id === '00000000-0000-0000-0000-000000000000' && (
                  <SparklesIcon className="inline-block w-5 h-5 text-yellow-300" />
                )}
              </Link>
              <div className="mt-2 grid md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {/* {org?.projects?.map((project) => (
                  <div
                    key={project.id}
                    className="p-4 h-32 flex bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 font-semibold text-xl rounded transition duration-150 cursor-pointer"
                    onClick={() => showEditProjectModal(org.id, project)}
                  >
                    {project?.name || `Unnamed project`}
                  </div>
                ))} */}
                <div
                  className="p-2 h-32 flex justify-center items-center font-semibold text-xl rounded bg-zinc-300/10 hover:bg-blue-300/30 text-zinc-300 hover:text-blue-300 cursor-pointer transition duration-300"
                  onClick={() => showEditProjectModal(org.id)}
                >
                  New project
                </div>
              </div>
            </div>
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
