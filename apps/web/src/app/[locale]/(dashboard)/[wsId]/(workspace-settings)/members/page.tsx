import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { User } from '@tuturuuu/types/primitives/User';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import {
  getPermissions,
  verifyHasSecrets,
} from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import InviteLinksSection from './_components/invite-links-section';
import InviteMemberButton from './_components/invite-member-button';
import MemberList from './_components/member-list';
import MemberTabs from './_components/member-tabs';

export const metadata: Metadata = {
  title: 'Members',
  description:
    'Manage Members in the Workspace Settings area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    status: string;
    roles: string;
  }>;
}

export default async function WorkspaceMembersPage({
  params,
  searchParams,
}: Props) {
  const { status } = await searchParams;

  return (
    <WorkspaceWrapper params={params}>
      {async ({ workspace, wsId }) => {
        const permissions = await getPermissions({
          wsId,
        });
        if (!permissions) notFound();
        const { withoutPermission } = permissions;

        if (withoutPermission('manage_workspace_members'))
          redirect(`/${wsId}/settings`);

        const user = await getCurrentUser();
        const members = await getMembers(wsId, await searchParams);

        const t = await getTranslations();
        const disableInvite = await verifyHasSecrets(wsId, ['DISABLE_INVITE']);

        const canManageMembers = !withoutPermission('manage_workspace_members');

        return (
          <div className="space-y-8">
            {/* Header Section with gradient background */}
            <div className="relative overflow-hidden rounded-xl border border-border bg-linear-to-br from-background via-background to-foreground/2 p-6 shadow-sm">
              {/* Decorative elements */}
              <div className="pointer-events-none absolute -top-4 -right-4 h-32 w-32 rounded-full bg-dynamic-blue/5 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-4 -left-4 h-32 w-32 rounded-full bg-dynamic-purple/5 blur-2xl" />

              <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-start">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-dynamic-blue to-dynamic-purple shadow-lg">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-6 w-6 text-background"
                      >
                        <title>{t('workspace-settings-layout.members')}</title>
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </div>
                    <h1 className="bg-linear-to-br from-foreground to-foreground/70 bg-clip-text font-bold text-3xl text-transparent">
                      {t('workspace-settings-layout.members')}
                    </h1>
                  </div>
                  <p className="ml-15 max-w-2xl text-foreground/70 text-lg leading-relaxed">
                    {t('ws-members.description')}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-stretch gap-3 md:flex-row md:items-center">
                  <MemberTabs value={status || 'all'} />
                  <InviteMemberButton
                    wsId={wsId}
                    currentUser={user!}
                    canManageMembers={canManageMembers}
                    label={
                      disableInvite
                        ? t('ws-members.invite_member_disabled')
                        : t('ws-members.invite_member')
                    }
                    disabled={disableInvite}
                  />
                </div>
              </div>
            </div>

            {/* Members List Section */}
            <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
              <MemberList
                workspace={workspace}
                members={members}
                invited={status === 'invited'}
                canManageMembers={canManageMembers}
              />
            </div>

            {/* Invite Links Section */}
            <InviteLinksSection
              wsId={wsId}
              canManageMembers={canManageMembers}
            />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}

const getMembers = async (wsId: string, { status }: { status: string }) => {
  const supabase = await createClient();
  const sbAdmin = await createAdminClient();

  const { data: secretData, error: secretError } = await sbAdmin
    .from('workspace_secrets')
    .select('name')
    .eq('ws_id', wsId)
    .in('name', ['HIDE_MEMBER_EMAIL', 'HIDE_MEMBER_NAME'])
    .eq('value', 'true');

  if (secretError) throw secretError;

  const queryBuilder = supabase
    .from('workspace_members_and_invites')
    .select(
      'id, handle, email, display_name, avatar_url, pending, created_at',
      {
        count: 'exact',
      }
    )
    .eq('ws_id', wsId)
    .order('pending')
    .order('created_at', { ascending: false })
    .order('id', { ascending: true });

  if (status && status !== 'all')
    queryBuilder.eq('pending', status === 'invited');

  const { data, error } = await queryBuilder;
  if (error) throw error;

  // Fetch workspace creator
  const { data: workspaceData } = await supabase
    .from('workspaces')
    .select('creator_id')
    .eq('id', wsId)
    .single();

  // Fetch role memberships for all users with permissions
  const userIds = data.filter((m) => !m.pending && m.id).map((m) => m.id!);
  const { data: roleMembershipsData } = await supabase
    .from('workspace_role_members')
    .select(
      'user_id, workspace_roles!inner(id, name, ws_id, workspace_role_permissions(permission, enabled))'
    )
    .eq('workspace_roles.ws_id', wsId)
    .in('user_id', userIds);

  // Fetch default permissions
  const { data: defaultPermissionsData } = await supabase
    .from('workspace_default_permissions')
    .select('permission, enabled')
    .eq('ws_id', wsId)
    .eq('enabled', true);

  // Build role map with permissions
  const roleMap = new Map<
    string,
    Array<{
      id: string;
      name: string;
      permissions: Array<{ permission: string; enabled: boolean }>;
    }>
  >();
  roleMembershipsData?.forEach((rm: any) => {
    if (!roleMap.has(rm.user_id)) {
      roleMap.set(rm.user_id, []);
    }
    roleMap.get(rm.user_id)?.push({
      id: rm.workspace_roles.id,
      name: rm.workspace_roles.name,
      permissions: rm.workspace_roles.workspace_role_permissions || [],
    });
  });

  return data.map(({ email, ...rest }) => {
    return {
      ...rest,
      display_name:
        secretData.filter((secret) => secret.name === 'HIDE_MEMBER_NAME')
          .length === 0
          ? rest.display_name
          : undefined,
      email:
        secretData.filter((secret) => secret.name === 'HIDE_MEMBER_EMAIL')
          .length === 0
          ? email
          : undefined,
      is_creator: workspaceData?.creator_id === rest.id,
      roles: rest.id ? roleMap.get(rest.id) || [] : [],
      default_permissions: defaultPermissionsData || [],
    };
  }) as (User & {
    is_creator: boolean;
    roles: Array<{
      id: string;
      name: string;
      permissions: Array<{ permission: string; enabled: boolean }>;
    }>;
    default_permissions: Array<{ permission: string; enabled: boolean }>;
  })[];
};
