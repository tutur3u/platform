import UserCard from '../../../../../../../components/cards/UserCard';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { User } from '@tuturuuu/types/primitives/User';
import { Separator } from '@tuturuuu/ui/separator';
import { enforceRootWorkspaceAdmin } from '@tuturuuu/utils/workspace-helper';
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

  return (
    <div className="flex min-h-full w-full flex-col">
      <Separator className="mt-4" />

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
