import { useUser } from '@supabase/auth-helpers-react';
import moment from 'moment';
import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { useSegments } from '../../../../hooks/useSegments';
import HeaderX from '../../../../components/metadata/HeaderX';
import { Divider } from '@mantine/core';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';

const TeamMembersPage = () => {
  const router = useRouter();
  const { wsId, teamId } = router.query;

  const { data: team } = useSWR(
    wsId && teamId ? `/api/workspaces/${wsId}/teams/${teamId}` : null
  );

  const { ws, members } = useWorkspaces();
  const { setRootSegment } = useSegments();

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws.name || 'Unnamed Workspace',
              href: `/${ws.id}`,
            },
            {
              content: 'Teams',
              href: `/${ws.id}/teams`,
            },
            {
              content: team?.name || 'Untitled Team',
              href: `/${ws.id}/teams/${teamId}`,
            },
            {
              content: 'Members',
              href: `/${ws.id}/teams/${teamId}/members`,
            },
          ]
        : []
    );
  }, [setRootSegment, ws, teamId, team?.name]);

  const user = useUser();

  return (
    <div className="pb-8">
      <HeaderX label={`Members – ${team?.name || 'Untitled Team'}`} />

      {teamId && (
        <>
          <div className="rounded-lg bg-zinc-900 p-4">
            <h1 className="text-2xl font-bold">
              Members{' '}
              <span className="rounded-lg bg-purple-300/20 px-2 text-lg text-purple-300">
                {members?.length || 0}
              </span>
            </h1>
            <p className="text-zinc-400">Manage who can access this team.</p>
          </div>
          <Divider className="my-4" />
        </>
      )}

      <div className="mb-8 mt-4 grid gap-4 md:grid-cols-2">
        {members
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
          ))}
      </div>
    </div>
  );
};

TeamMembersPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="team">{page}</NestedLayout>;
};

export default TeamMembersPage;
