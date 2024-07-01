import { UserDatabaseFilter } from '../../../users/filters';
import { SectionProps } from './index';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { createClient } from '@/utils/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { User } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function RoleFormMembersSection({ wsId, form }: SectionProps) {
  const t = useTranslations();

  const query = useQuery({
    queryKey: ['workspaces', wsId, 'members'],
    queryFn: () => getUsers(wsId),
  });

  const users = query.data?.data || [];

  return (
    <>
      {form.watch('name') && (
        <div className="bg-dynamic-blue/10 border-dynamic-blue/20 text-dynamic-blue mb-2 rounded-md border p-2 text-center font-bold">
          {form.watch('name')}
        </div>
      )}
      <UserDatabaseFilter
        key="user-filter"
        tag="userId"
        title={t('user-data-table.user')}
        icon={<User className="mr-2 h-4 w-4" />}
        options={users.map((user) => ({
          label: user.display_name || user.full_name || 'No name',
          value: user.id,
        }))}
        sortCheckedFirst={false}
        multiple={false}
      />
    </>
  );
}

async function getUsers(wsId: string) {
  const supabase = createClient();

  const queryBuilder = supabase
    .from('workspace_user_linked_users')
    .select(
      'id:platform_user_id, ...workspace_users!inner(full_name, display_name)'
    )
    .eq('ws_id', wsId)
    .order('platform_user_id');

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: WorkspaceUser[]; count: number };
}
