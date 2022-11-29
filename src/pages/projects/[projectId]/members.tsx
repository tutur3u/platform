import { useUser } from '@supabase/auth-helpers-react';
import moment from 'moment';
import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../components/layout/NestedLayout';
import { useAppearance } from '../../../hooks/useAppearance';

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
      orgData?.name
        ? [
            {
              content: project?.orgs?.name || 'Unnamed Organization',
              href: `/orgs/${project.orgs.id}`,
            },
            {
              content: project?.name || 'Untitled',
              href: `/projects/${projectId}`,
            },
            { content: 'Members', href: `/projects/${projectId}/members` },
          ]
        : []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgData?.name]);

  useEffect(() => {
    if (orgData?.error || orgError) router.push('/');
  }, [orgData, orgError, router]);

  const user = useUser();

  if (isLoading) return <div>Loading...</div>;

  return (
    <>
      {project.orgs.id && (
        <div className="flex justify-between items-center mt-2 mb-4">
          <h1 className="font-bold text-lg md:text-xl lg:text-2xl xl:text-3xl">
            Members ({membersData?.members?.length || 0})
          </h1>
        </div>
      )}

      <div className="max-w-lg flex flex-col gap-4 mb-16">
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
                className="relative p-4 border border-zinc-800/80 bg-[#19191d] rounded-lg"
              >
                <p className="font-semibold lg:text-lg xl:text-xl">
                  {member.display_name}
                </p>
                <p className="text-zinc-400">{member.email}</p>

                {member?.created_at ? (
                  <div className="mt-2 pt-2 border-t border-zinc-800 text-zinc-500">
                    Member since{' '}
                    <span className="text-zinc-400 font-semibold">
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
  return <NestedLayout orgMode={false}>{page}</NestedLayout>;
};

export default ProjectMembersPage;
