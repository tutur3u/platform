import { DEV_MODE } from '@/constants/common';
import { createClient } from '@tutur3u/supabase/next/client';
import { Workspace } from '@repo/types/primitives/Workspace';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@repo/ui/components/ui/dropdown-menu';
import { useQuery } from '@tanstack/react-query';
import { ActivitySquare, Database } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

export default function DashboardMenuItem() {
  const t = useTranslations('common');

  const workspacesQuery = useQuery({
    queryKey: ['workspaces'],
    queryFn: fetchWorkspaces,
  });

  const workspaces = workspacesQuery.data;

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <Link href={`/${workspaces?.[0]?.id || 'onboarding'}`}>
          <DropdownMenuItem className="cursor-pointer">
            <ActivitySquare className="mr-2 h-4 w-4" />
            <span>{t('dashboard')}</span>
          </DropdownMenuItem>
        </Link>
        {DEV_MODE && (
          <Link
            href="http://localhost:8003/project/default/editor"
            target="_blank"
          >
            <DropdownMenuItem className="cursor-pointer">
              <Database className="mr-2 h-4 w-4" />
              <span>{t('local_database')}</span>
            </DropdownMenuItem>
          </Link>
        )}
      </DropdownMenuGroup>
    </>
  );
}

async function fetchWorkspaces() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [] as Workspace[];

  const { data: workspaces, error: error } = await supabase
    .from('workspaces')
    .select(
      'id, name, avatar_url, logo_url, created_at, workspace_members!inner(role)'
    )
    .eq('workspace_members.user_id', user.id);

  if (error) return [] as Workspace[];
  return workspaces as Workspace[];
}
