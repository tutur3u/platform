import { useUser } from '@supabase/auth-helpers-react';
import moment from 'moment';
import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { useSegments } from '../../../../hooks/useSegments';
import HeaderX from '../../../../components/metadata/HeaderX';
import { Divider } from '@mantine/core';

const ProjectMembersPage = () => {
  const router = useRouter();
  const { projectId } = router.query;

  const { data: project, error: projectError } = useSWR(
    projectId ? `/api/projects/${projectId}` : null
  );

  const { data: ws, error: wsError } = useSWR(
    project?.workspaces?.id ? `/api/workspaces/${project.workspaces?.id}` : null
  );

  const { data: membersData, error: membersError } = useSWR(
    project?.workspaces?.id
      ? `/api/workspaces/${project.workspaces?.id}/members`
      : null
  );

  const isProjectLoading = !project && !projectError;
  const isWsLoading = !ws && !wsError;
  const isMembersLoading = !membersData && !membersError;

  const isLoading = isProjectLoading || isWsLoading || isMembersLoading;

  const { setRootSegment } = useSegments();

  useEffect(() => {
    setRootSegment(
      project?.workspaces?.id
        ? [
            {
              content: project?.workspaces?.name || 'Unnamed Workspace',
              href: `/${project.workspaces.id}`,
            },
            {
              content: 'Projects',
              href: `/${project?.workspaces?.id}/projects`,
            },
            {
              content: project?.name || 'Untitled Project',
              href: `/${project?.workspaces?.id}/projects/${projectId}`,
            },
            {
              content: 'Members',
              href: `/${project?.workspaces?.id}/projects/${projectId}/members`,
            },
          ]
        : []
    );
  }, [
    setRootSegment,
    projectId,
    project?.workspaces?.id,
    project?.workspaces?.name,
    project?.name,
  ]);

  useEffect(() => {
    if (ws?.error || wsError) router.push('/');
  }, [ws, wsError, router]);

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
