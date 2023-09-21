import { Separator } from '@/components/ui/separator';
import MemberRoleMultiSelector from '@/components/selectors/MemberRoleMultiSelector';
import useTranslation from 'next-translate/useTranslation';
import InviteMemberButton from './_components/invite-member-button';
import MemberTabs from './_components/member-tabs';
import MemberList from './_components/member-list';
import { getWorkspace } from '@/lib/workspace-helper';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/types/supabase';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

interface Props {
  params: {
    wsId: string;
  };
  searchParams: {
    status: string;
    roles: string;
  };
}

export default async function WorkspaceMembersPage({
  params: { wsId },
  searchParams,
}: Props) {
  const ws = await getWorkspace(wsId);
  const members = await getMembers(wsId, searchParams);

  const { t } = useTranslation('ws-members');

  const membersLabel = t('workspace-tabs:members');
  const inviteLabel = t('invite_member');

  return (
    <>
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 dark:border-zinc-800/80 dark:bg-zinc-900 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-bold">{membersLabel}</h1>
          <p className="text-zinc-700 dark:text-zinc-400">{t('description')}</p>
        </div>

        <div className="flex flex-col items-center justify-center gap-2 md:flex-row">
          <InviteMemberButton wsId={wsId} label={inviteLabel} />
          <MemberTabs value={searchParams?.status || 'all'} />
        </div>
      </div>
      <Separator className="my-4" />

      <div className="flex min-h-full w-full flex-col">
        <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MemberRoleMultiSelector />
        </div>
        <Separator className="my-4" />
        {/* <PaginationIndicator
          activePage={Number(page)}
          itemsPerPage={Number(itemsPerPage)}
        /> */}

        <div className="grid items-end gap-4 lg:grid-cols-2">
          <MemberList
            workspace={ws}
            members={members}
            invited={searchParams?.status === 'invited'}
          />
        </div>
      </div>
    </>
  );
}

const getMembers = async (
  wsId: string,
  { status, roles }: { status: string; roles: string }
) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('workspace_members_and_invites')
    .select(
      'id, handle, display_name, avatar_url, pending, role, role_title, created_at',
      {
        count: 'exact',
      }
    )
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true });

  if (status && status !== 'all')
    queryBuilder.eq('pending', status === 'invited');

  if (roles && typeof roles === 'string')
    queryBuilder.in('role', roles.split(','));

  const { data, error } = await queryBuilder;

  if (error) {
    throw error;
  }

  return data;
};
