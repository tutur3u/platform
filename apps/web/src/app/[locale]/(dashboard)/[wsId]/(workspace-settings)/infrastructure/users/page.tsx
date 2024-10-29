import UserCard from '../../../../../../../components/cards/UserCard';
import GeneralSearchBar from '../../../../../../../components/inputs/GeneralSearchBar';
import PaginationIndicator from '@/components/pagination/PaginationIndicator';
import { enforceRootWorkspaceAdmin } from '@/lib/workspace-helper';
import { User } from '@/types/primitives/User';
import { createAdminClient } from '@/utils/supabase/server';
import { Separator } from '@repo/ui/components/ui/separator';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function InfrastructureUsersPage({ params }: Props) {
  const { wsId } = await params;
  await enforceRootWorkspaceAdmin(wsId, {
    redirectTo: `/${wsId}/settings`,
  });

  const users = await getUsers();
  const count = await getUserCount();

  return (
    <div className="flex min-h-full w-full flex-col">
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GeneralSearchBar />
      </div>

      <Separator className="mt-4" />
      <PaginationIndicator totalItems={count} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {users.map((u) => (
          <UserCard key={u.id} user={u} />
        ))}
      </div>
    </div>
  );
}

async function getUsers() {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) notFound();

  const { data } = await supabaseAdmin.from('users').select('*');

  return data as User[];
}

async function getUserCount() {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) notFound();

  const { count } = await supabaseAdmin.from('users').select('*', {
    count: 'exact',
    head: true,
  });

  return count;
}
