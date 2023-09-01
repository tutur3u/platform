import WorkspaceUserCard from '@/components/cards/WorkspaceUserCard';
import PlusCardButton from '@/components/common/PlusCardButton';
import PaginationIndicator from '@/components/pagination/PaginationIndicator';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import GeneralSearchBar from '@/components/inputs/GeneralSearchBar';
import { Separator } from '@/components/ui/separator';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/types/supabase';
import { cookies } from 'next/headers';

interface Props {
  params: {
    wsId: string;
  };
  searchParams: {
    q: string;
  };
}

export default async function WorkspaceUsersPage({
  params: { wsId },
  searchParams,
}: Props) {
  const users = await getUsers(wsId, searchParams);
  const count = await getCount(wsId, searchParams);

  return (
    <div className="flex min-h-full w-full flex-col ">
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GeneralSearchBar />
      </div>

      <Separator className="my-4" />
      <PaginationIndicator totalItems={count} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PlusCardButton href={`/${wsId}/users/new`} />
        {users.map((u) => (
          <WorkspaceUserCard
            key={u.id}
            wsId={wsId}
            user={u}
            showAddress={true}
            showGender={true}
            showPhone={true}
          />
        ))}
      </div>
    </div>
  );
}

async function getUsers(wsId: string, { q }: { q: string }) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('workspace_users')
    .select('*')
    .eq('ws_id', wsId);

  if (q) queryBuilder.ilike('name', `%${q}%`);

  const { data } = await queryBuilder;
  return data as WorkspaceUser[];
}

async function getCount(wsId: string, { q }: { q: string }) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('workspace_users')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  if (q) queryBuilder.ilike('name', `%${q}%`);

  const { count } = await queryBuilder;
  return count;
}
