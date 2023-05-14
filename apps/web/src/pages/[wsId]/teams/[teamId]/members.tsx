import { useUser } from '@supabase/auth-helpers-react';
import moment from 'moment';
import { useRouter } from 'next/router';
import { ReactElement, useEffect, useState } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { useSegments } from '../../../../hooks/useSegments';
import HeaderX from '../../../../components/metadata/HeaderX';
import { Divider } from '@mantine/core';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import { User } from '../../../../types/primitives/User';
import { useLocalStorage } from '@mantine/hooks';
import ModeSelector, {
  Mode,
} from '../../../../components/selectors/ModeSelector';
import PaginationSelector from '../../../../components/selectors/PaginationSelector';
import MemberRoleMultiSelector from '../../../../components/selectors/MemberRoleMultiSelector';
import PaginationIndicator from '../../../../components/pagination/PaginationIndicator';
import LoadingIndicator from '../../../../components/common/LoadingIndicator';
import useTranslation from 'next-translate/useTranslation';

const TeamMembersPage = () => {
  const { t, lang } = useTranslation('ws-members');

  const router = useRouter();
  const user = useUser();

  const { wsId, teamId } = router.query;

  const { data: team } = useSWR(
    wsId && teamId ? `/api/workspaces/${wsId}/teams/${teamId}` : null
  );

  const { ws } = useWorkspaces();
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

  const [activePage, setPage] = useState(1);

  const [roles, setRoles] = useState<string[]>([]);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'team-members-items-per-page',
    defaultValue: 15,
  });

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'members-mode',
    defaultValue: 'grid',
  });

  const apiPath = ws?.id
    ? `/api/workspaces/${ws.id}/members?roles=${
        roles.length > 0 ? roles.join(',') : ''
      }&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  const { data, error } = useSWR<{ data: User[]; count: number }>(apiPath);

  const isMembersLoading = !data && !error;
  const members = data?.data || [];

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'member':
        return 'border-blue-300/10 bg-blue-300/10 text-blue-300';

      case 'admin':
        return 'border-orange-300/10 bg-orange-300/10 text-orange-300';

      case 'owner':
        return 'border-purple-300/10 bg-purple-300/10 text-purple-300';

      default:
        return 'border-zinc-800/80 bg-zinc-900 text-zinc-400';
    }
  };

  return (
    <div className="pb-20">
      <HeaderX label={`Members – ${team?.name || 'Untitled Team'}`} />

      {teamId && (
        <>
          <div className="flex items-start justify-between gap-4 rounded-lg border border-zinc-800/80 bg-zinc-900 p-4">
            <div>
              <h1 className="text-2xl font-bold">
                {t('team-tabs:members')}{' '}
                <span className="rounded-lg bg-purple-300/20 px-2 text-lg text-purple-300">
                  {members?.length || 0}
                </span>
              </h1>
              <p className="text-zinc-400">{t('description')}</p>
            </div>
          </div>
          <Divider className="my-4" />
        </>
      )}

      <div className="flex min-h-full w-full flex-col pb-20">
        <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ModeSelector mode={mode} setMode={setMode} showAll />
          <PaginationSelector
            items={itemsPerPage}
            setItems={(size) => {
              setPage(1);
              setItemsPerPage(size);
            }}
          />
          <MemberRoleMultiSelector roles={roles} setRoles={setRoles} />
        </div>

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
          {isMembersLoading ? (
            <div className="col-span-full flex items-center justify-center">
              <LoadingIndicator className="h-8" />
            </div>
          ) : (
            members
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
                  className="relative rounded-lg border border-zinc-800/80 bg-zinc-900 p-4"
                >
                  <p className="font-semibold lg:text-lg xl:text-xl">
                    {member.display_name}{' '}
                    {member?.role_title ? (
                      <span className="text-orange-300">
                        ({member.role_title})
                      </span>
                    ) : null}
                  </p>
                  <p className="text-blue-300">@{member.handle}</p>

                  <div className="mt-2 flex items-center justify-between gap-4 border-t border-zinc-800 pt-2">
                    {member?.created_at ? (
                      <div className="text-zinc-500">
                        {t('member_since')}{' '}
                        <span className="font-semibold text-zinc-400">
                          {moment(member.created_at).locale(lang).fromNow()}
                        </span>
                        .
                      </div>
                    ) : null}

                    <div
                      className={`rounded border px-2 py-0.5 font-semibold ${getRoleColor(
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
    </div>
  );
};

TeamMembersPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="team">{page}</NestedLayout>;
};

export default TeamMembersPage;
