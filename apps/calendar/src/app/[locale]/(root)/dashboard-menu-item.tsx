import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@tuturuuu/ui/dropdown-menu';
import { ActivitySquare, Database } from '@tuturuuu/ui/icons';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { DEV_MODE } from '@/constants/common';

export default function DashboardMenuItem() {
  const t = useTranslations('common');

  const defaultWorkspaceQuery = useQuery({
    queryKey: ['default-workspace'],
    queryFn: fetchDefaultWorkspace,
  });

  const defaultWorkspace = defaultWorkspaceQuery.data;

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <Link
          href={`${
            DEV_MODE
              ? `http://localhost:7803/${defaultWorkspace?.id || 'onboarding'}`
              : `https://tuturuuu.com/${defaultWorkspace?.id || 'onboarding'}`
          }`}
        >
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

async function fetchDefaultWorkspace() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // First try to get the user's default workspace
  const { data: userData, error: userError } = await supabase
    .from('user_private_details')
    .select('default_workspace_id')
    .eq('user_id', user.id)
    .single();

  if (!userError && userData?.default_workspace_id) {
    // Validate the default workspace exists and user has access
    const { data: workspace, error } = await supabase
      .from('workspaces')
      .select('id, name, workspace_members!inner(role)')
      .eq('id', userData.default_workspace_id)
      .eq('workspace_members.user_id', user.id)
      .single();

    if (!error && workspace) {
      return workspace;
    }
  }

  // If no default workspace or invalid, get the first available workspace
  const { data: workspaces, error } = await supabase
    .from('workspaces')
    .select('id, name, workspace_members!inner(role)')
    .eq('workspace_members.user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (error || !workspaces) {
    return null;
  }

  return workspaces;
}
