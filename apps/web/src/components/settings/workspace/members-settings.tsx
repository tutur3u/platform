/**
 * Workspace Members Settings Component
 *
 * Full-featured member management component with:
 * - Tab filtering (All/Joined/Invited)
 * - Role and permission display
 * - Member invitation functionality
 * - Invite link management
 * - TanStack Query for data fetching and caching
 *
 * @example
 * ```tsx
 * import MembersSettings, { workspaceMembersKeys } from '@/components/settings/workspace/members-settings';
 * import { useQueryClient } from '@tanstack/react-query';
 *
 * function MyComponent() {
 *   const queryClient = useQueryClient();
 *
 *   // Invalidate members query after an action
 *   const handleMemberAction = async () => {
 *     await doSomething();
 *     queryClient.invalidateQueries({
 *       queryKey: workspaceMembersKeys.all
 *     });
 *   };
 *
 *   return (
 *     <MembersSettings
 *       workspace={workspace}
 *       currentUser={currentUser}
 *       canManageMembers={hasPermission}
 *     />
 *   );
 * }
 * ```
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { Crown, User as UserIcon, Users } from '@tuturuuu/icons';
import type { Workspace } from '@tuturuuu/types';
import type { User } from '@tuturuuu/types/primitives/User';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { getInitials } from '@tuturuuu/utils/name-helper';
import moment from 'moment';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import InviteLinksSection from '../../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/members/_components/invite-links-section';
import InviteMemberButton from '../../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/members/_components/invite-member-button';
import { MemberPermissionBreakdown } from '../../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/members/_components/member-permission-breakdown';
import { MemberSettingsButton } from '../../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/members/_components/member-settings-button';

interface Props {
  workspace: Workspace;
  currentUser?: User | null;
  canManageMembers?: boolean;
}

/**
 * Enhanced member type with roles and permissions
 */
export type MemberWithPermissions = User & {
  is_creator?: boolean;
  roles?: Array<{
    id: string;
    name: string;
    permissions?: Array<{ permission: string; enabled: boolean }>;
  }>;
  default_permissions?: Array<{ permission: string; enabled: boolean }>;
};

/**
 * Query key factory for workspace members
 *
 * Usage for query invalidation in other components:
 *
 * @example
 * // Invalidate all workspace members queries
 * queryClient.invalidateQueries({ queryKey: workspaceMembersKeys.all });
 *
 * @example
 * // Invalidate specific workspace members query
 * queryClient.invalidateQueries({
 *   queryKey: workspaceMembersKeys.list(workspaceId, 'joined')
 * });
 *
 * @example
 * // Invalidate all queries for a specific workspace
 * queryClient.invalidateQueries({
 *   queryKey: workspaceMembersKeys.lists(),
 *   predicate: (query) => query.queryKey.includes(workspaceId)
 * });
 */
export const workspaceMembersKeys = {
  all: ['workspace-members'] as const,
  lists: () => [...workspaceMembersKeys.all, 'list'] as const,
  list: (workspaceId: string, status?: 'all' | 'joined' | 'invited') =>
    [...workspaceMembersKeys.lists(), workspaceId, status] as const,
};

// Fetch members with enhanced data
async function fetchMembers(
  workspaceId: string,
  status?: 'all' | 'joined' | 'invited'
): Promise<MemberWithPermissions[]> {
  const params = new URLSearchParams();
  if (status && status !== 'all') {
    params.set('status', status);
  }

  const res = await fetch(
    `/api/workspaces/${workspaceId}/members/enhanced?${params.toString()}`
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch members: ${res.status}`);
  }

  return res.json();
}

// Custom hook for fetching workspace members
export function useWorkspaceMembers(
  workspaceId: string,
  status: 'all' | 'joined' | 'invited' = 'all'
) {
  return useQuery({
    queryKey: workspaceMembersKeys.list(workspaceId, status),
    queryFn: () => fetchMembers(workspaceId, status),
    enabled: !!workspaceId,
    staleTime: 30000, // Consider data fresh for 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    refetchOnWindowFocus: true, // Refetch when window regains focus
    retry: 2, // Retry failed requests twice
  });
}

export default function MembersSettings({
  workspace,
  currentUser,
  canManageMembers = false,
}: Props) {
  const t = useTranslations('ws-members');
  const tCommon = useTranslations('common');
  const [activeTab, setActiveTab] = useState<'all' | 'joined' | 'invited'>(
    'all'
  );

  // Use custom hook for data fetching with TanStack Query
  const {
    data: members = [],
    isLoading,
    isError,
    error,
  } = useWorkspaceMembers(workspace.id, activeTab);

  // Client-side filtering based on active tab
  const filteredMembers = members.filter((member) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'invited') return member.pending;
    if (activeTab === 'joined') return !member.pending;
    return true;
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-background p-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-foreground/20 border-t-foreground" />
          <p className="text-foreground/60 text-sm">{tCommon('loading')}</p>
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dynamic-red/20 bg-dynamic-red/5 p-12">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-full bg-dynamic-red/10 p-3">
            <Users className="h-8 w-8 text-dynamic-red" />
          </div>
          <div>
            <p className="font-semibold text-dynamic-red">
              Failed to load members
            </p>
            <p className="text-foreground/60 text-sm">
              {error instanceof Error ? error.message : 'An error occurred'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-linear-to-br from-background via-background to-foreground/2 p-6 shadow-sm">
        {/* Decorative elements */}
        <div className="pointer-events-none absolute -top-4 -right-4 h-32 w-32 rounded-full bg-dynamic-blue/5 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-4 -left-4 h-32 w-32 rounded-full bg-dynamic-purple/5 blur-2xl" />

        <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-dynamic-blue to-dynamic-purple shadow-lg">
                <Users className="h-6 w-6 text-background" />
              </div>
              <h3 className="bg-linear-to-br from-foreground to-foreground/70 bg-clip-text font-bold text-2xl text-transparent">
                {tCommon('members')}
              </h3>
            </div>
            <p className="ml-15 max-w-2xl text-foreground/70 leading-relaxed">
              {t('description')}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-3 md:flex-row md:items-center">
            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as typeof activeTab)}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-3 text-sm md:flex md:w-auto md:text-base">
                <TabsTrigger value="all">{t('all')}</TabsTrigger>
                <TabsTrigger value="joined">{t('joined')}</TabsTrigger>
                <TabsTrigger value="invited">{t('invited')}</TabsTrigger>
              </TabsList>
            </Tabs>
            {currentUser && (
              <InviteMemberButton
                wsId={workspace.id}
                currentUser={currentUser}
                canManageMembers={canManageMembers}
                label={t('invite_member')}
              />
            )}
          </div>
        </div>
      </div>

      {/* Members List Section */}
      <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
        {filteredMembers.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-primary-foreground/20 p-8">
            <p className="text-center text-foreground/80">
              {activeTab === 'invited'
                ? t('no_invited_members_found')
                : t('no_members_match')}
            </p>
            {currentUser && canManageMembers && (
              <InviteMemberButton
                wsId={workspace.id}
                currentUser={currentUser}
                canManageMembers={canManageMembers}
                label={t('invite_member')}
                variant="outline"
              />
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {filteredMembers.map((member) => (
              <div
                key={member.id || member.email}
                className={`relative rounded-lg border p-4 transition-colors ${
                  member?.pending
                    ? 'border-dashed bg-transparent'
                    : 'bg-primary-foreground/20 hover:bg-primary-foreground/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Avatar className="rounded-sm">
                    <AvatarImage src={member?.avatar_url ?? undefined} />
                    <AvatarFallback className="font-semibold">
                      {member?.display_name ? (
                        getInitials(member.display_name)
                      ) : (
                        <UserIcon className="h-5 w-5" />
                      )}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-semibold lg:text-lg">
                        {member?.display_name ? (
                          member.display_name
                        ) : (
                          <span className="opacity-50">Unknown</span>
                        )}
                      </p>
                      {member.is_creator && (
                        <Badge className="h-5 gap-1 border-dynamic-yellow/50 bg-dynamic-yellow/10 px-1.5 text-dynamic-yellow text-xs">
                          <Crown className="h-3 w-3" />
                          {t('creator_badge')}
                        </Badge>
                      )}
                      {member.roles?.map((role) => (
                        <Badge
                          key={role.id}
                          className="h-5 border-dynamic-purple/50 bg-dynamic-purple/10 px-1.5 text-dynamic-purple text-xs"
                        >
                          {role.name}
                        </Badge>
                      ))}
                    </div>
                    <p className="font-semibold text-foreground/60 text-sm">
                      {member?.email ||
                        (member?.handle
                          ? `@${member.handle}`
                          : member?.id?.replace(/-/g, ''))}
                    </p>
                  </div>
                </div>

                {currentUser && (
                  <div className="absolute top-4 right-4 flex gap-2">
                    <MemberSettingsButton
                      workspace={workspace}
                      user={member}
                      currentUser={currentUser}
                      canManageMembers={canManageMembers}
                    />
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm md:text-base lg:gap-4">
                  {member?.created_at ? (
                    <div className="line-clamp-1 text-foreground/80">
                      <span className="opacity-90">
                        {t(member?.pending ? 'invited' : 'member_since')}
                      </span>{' '}
                      <span className="font-semibold">
                        {moment(member.created_at).fromNow()}
                      </span>
                      .
                    </div>
                  ) : null}

                  <div className="flex gap-2">
                    {currentUser?.id === member.id && (
                      <div className="rounded border bg-primary px-2 py-0.5 text-center font-semibold text-primary-foreground">
                        {t('you')}
                      </div>
                    )}
                  </div>
                </div>

                {/* Permission Breakdown - only show for non-pending members */}
                {!member?.pending && member.id && (
                  <MemberPermissionBreakdown
                    wsId={workspace.id}
                    member={member as typeof member & { id: string }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite Links Section */}
      {canManageMembers && (
        <InviteLinksSection
          wsId={workspace.id}
          canManageMembers={canManageMembers}
        />
      )}
    </div>
  );
}
