import { UserGroup } from '@/types/primitives/UserGroup';
import GeneralSearchBar from '@/components/inputs/GeneralSearchBar';
import PlusCardButton from '@/components/common/PlusCardButton';
import GeneralItemCard from '@/components/cards/GeneralItemCard';
import { Separator } from '@/components/ui/separator';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/types/supabase';
import { cookies } from 'next/headers';
import useTranslation from 'next-translate/useTranslation';
import PaginationIndicator from '@/components/pagination/PaginationIndicator';

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
  const { t } = useTranslation();

  const groups = await getGroups(wsId, searchParams);
  const count = await getCount(wsId, searchParams);

  return (
    <div className="flex min-h-full w-full flex-col ">
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GeneralSearchBar />
      </div>

      <Separator className="my-4" />
      <PaginationIndicator totalItems={count} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PlusCardButton href={`/${wsId}/users/groups/new`} />
        {groups.map((g) => (
          <GeneralItemCard
            key={g.id}
            name={g.name}
            href={`/${wsId}/users/groups/${g.id}`}
            amountFetchPath={`/api/workspaces/${wsId}/users/groups/${g.id}/amount`}
            amountTrailing={t('sidebar-tabs:users').toLowerCase()}
            showAmount={true}
          />
        ))}
      </div>
    </div>
  );
}

async function getGroups(wsId: string, { q }: { q: string }) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('workspace_user_groups')
    .select('*')
    .eq('ws_id', wsId);

  if (q) queryBuilder.ilike('name', `%${q}%`);

  const { data } = await queryBuilder;
  return data as UserGroup[];
}

async function getCount(wsId: string, { q }: { q: string }) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('workspace_user_groups')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  if (q) queryBuilder.ilike('name', `%${q}%`);

  const { count } = await queryBuilder;
  return count;
}
