import { useUser } from '@supabase/auth-helpers-react';
import moment from 'moment';
import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { useAppearance } from '../../../hooks/useAppearance';
import HeaderX from '../../../components/metadata/HeaderX';
import { Divider } from '@mantine/core';

const ProjectMembersPage = () => {
  const router = useRouter();
  const { projectId } = router.query;

  const { data: project, error: projectError } = useSWR(
    projectId ? `/api/projects/${projectId}` : null
  );

  const { data: orgData, error: orgError } = useSWR(
    project?.orgs?.id ? `/api/orgs/${project.orgs?.id}` : null
  );

  const { data: membersData, error: membersError } = useSWR(
    project?.orgs?.id ? `/api/orgs/${project.orgs?.id}/members` : null
  );

  const isLoadingProject = !project && !projectError;
  const isLoadingOrg = !orgData && !orgError;
  const isLoadingMembers = !membersData && !membersError;

  const isLoading = isLoadingProject || isLoadingOrg || isLoadingMembers;

  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment(
      project?.orgs?.id
        ? [
            {
              content: project?.orgs?.name || 'Unnamed Workspace',
              href: `/orgs/${project.orgs.id}`,
            },
            {
              content: 'Projects',
              href: `/orgs/${project?.orgs?.id}/projects`,
            },
            {
              content: project?.name || 'Untitled Project',
              href: `/projects/${projectId}`,
            },
            { content: 'Members', href: `/projects/${projectId}/members` },
          ]
        : []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, project?.orgs?.id, project?.orgs?.name, project?.name]);

  useEffect(() => {
    if (orgData?.error || orgError) router.push('/');
  }, [orgData, orgError, router]);

  const user = useUser();

  if (isLoading) return <div>Loading...</div>;

  return (
    <>
      <HeaderX label={`Members – ${project?.name || 'Untitled Project'}`} />

      {projectId && (
        <>
          <div className="rounded-lg bg-zinc-900 p-4">
            <h1 className="text-2xl font-bold">
              Members{' '}
              <span className="rounded-lg bg-purple-300/20 px-2 text-lg text-purple-300">
                {membersData?.members?.length || 0}
              </span>
            </h1>
            <p className="text-zinc-400">Manage who can access this project.</p>
          </div>
        </>
      )}

      <Divider className="my-4" />

      <div className="mb-8 mt-4 grid gap-4 md:grid-cols-2">
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
    </>
  );
};

ProjectMembersPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="project">{page}</NestedLayout>;
};

export default ProjectMembersPage;
