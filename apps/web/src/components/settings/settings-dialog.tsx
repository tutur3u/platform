'use client';

import { useQuery } from '@tanstack/react-query';
import {
  DATABASE_AUTO_ADD_NEW_GROUPS_TO_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
  DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID,
  DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
  DATABASE_FEATURED_GROUPS_CONFIG_ID,
  parseWorkspaceConfigIdList,
} from '@tuturuuu/internal-api/workspace-configs';
import type { CalendarConnection, Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { SettingsDialogShell } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { useWorkspaceConfigs } from '@tuturuuu/ui/hooks/use-workspace-config';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useUserBooleanConfig } from '@/hooks/use-user-config';
import { apiFetch } from '@/lib/api-fetch';
import { SettingsDialogContent } from './settings-dialog-content';
import { preloadBoardSettingsPanel } from './settings-dialog-lazy-panels';
import { buildSettingsNavItems } from './settings-dialog-nav-items';
import {
  getSettingsDialogAvailability,
  type WorkspaceSettingsPermissions,
} from './settings-dialog-permissions';

interface SettingsDialogProps {
  boardId?: string;
  wsId?: string;
  user: WorkspaceUser | null;
  defaultTab?: string;
  workspace?: Workspace | null;
  linkedProvider?: string;
}

const BOARD_SETTINGS_PRELOAD_EVENT = 'tuturuuu:board-settings-intent';

function normalizeSettingsTab(tab: string) {
  return tab === 'sidebar' ? 'navigation' : tab;
}

export function SettingsDialog({
  boardId,
  wsId,
  user,
  defaultTab = 'profile',
  workspace: workspaceProp,
  linkedProvider,
}: SettingsDialogProps) {
  const t = useTranslations();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.addEventListener(
      BOARD_SETTINGS_PRELOAD_EVENT,
      preloadBoardSettingsPanel
    );

    return () => {
      window.removeEventListener(
        BOARD_SETTINGS_PRELOAD_EVENT,
        preloadBoardSettingsPanel
      );
    };
  }, []);

  const normalizedDefaultTab = normalizeSettingsTab(defaultTab);
  const [activeTab, setActiveTab] = useState(normalizedDefaultTab);
  const {
    data: workspaceCustomConfigs = {},
    isLoading: isLoadingWorkspaceCustomConfigs,
  } = useWorkspaceConfigs(
    wsId ?? '',
    wsId
      ? [
          DATABASE_AUTO_ADD_NEW_GROUPS_TO_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
          DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID,
          DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
          DATABASE_FEATURED_GROUPS_CONFIG_ID,
        ]
      : []
  );

  const { value: expandAllAccordions } = useUserBooleanConfig(
    'EXPAND_SETTINGS_ACCORDIONS',
    true
  );

  const {
    data: fetchedWorkspace,
    isLoading: isLoadingWorkspace,
    error: workspaceError,
  } = useQuery({
    queryKey: ['workspace', wsId],
    queryFn: () => {
      if (!wsId) throw new Error('No workspace ID provided');
      return apiFetch<Workspace>(`/api/workspaces/${wsId}`, {
        cache: 'no-store',
      });
    },
    enabled: !workspaceProp && !!wsId,
    staleTime: 5 * 60 * 1000,
  });

  const workspace = workspaceProp || fetchedWorkspace || null;

  const { data: workspacePermissions, isLoading: isBillingPermissionLoading } =
    useQuery({
      queryKey: ['workspace-settings-permissions', wsId],
      queryFn: () =>
        apiFetch<WorkspaceSettingsPermissions>(
          `/api/v1/workspaces/${wsId}/settings/permissions`,
          {
            cache: 'no-store',
          }
        ),
      enabled: !!wsId,
      staleTime: 5 * 60 * 1000,
    });

  const availability = getSettingsDialogAvailability({
    workspace,
    workspacePermissions,
  });
  const canManageVersionBadge = isExactTuturuuuDotComEmail(user?.email);
  const autoAddNewGroupsToDefaultIncludedGroups =
    workspaceCustomConfigs[
      DATABASE_AUTO_ADD_NEW_GROUPS_TO_DEFAULT_INCLUDED_GROUPS_CONFIG_ID
    ] === 'true';
  const defaultExcludedGroupIds = parseWorkspaceConfigIdList(
    workspaceCustomConfigs[DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID]
  );
  const defaultIncludedGroupIds = parseWorkspaceConfigIdList(
    workspaceCustomConfigs[DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID]
  );
  const featuredGroupIds = parseWorkspaceConfigIdList(
    workspaceCustomConfigs[DATABASE_FEATURED_GROUPS_CONFIG_ID]
  );

  useEffect(() => {
    setActiveTab(normalizedDefaultTab);
  }, [normalizedDefaultTab]);

  useEffect(() => {
    if (
      !isBillingPermissionLoading &&
      availability.hasBillingPermission === false &&
      activeTab === 'workspace_billing'
    ) {
      const safeFallback =
        normalizedDefaultTab === 'workspace_billing'
          ? 'profile'
          : normalizedDefaultTab;
      setActiveTab(safeFallback);
    }
  }, [
    activeTab,
    availability.hasBillingPermission,
    isBillingPermissionLoading,
    normalizedDefaultTab,
  ]);

  const { data: calendarConnections } = useQuery({
    queryKey: ['calendar-connections', workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];

      const payload = await apiFetch<{
        connections?: CalendarConnection[];
      }>(`/api/v1/calendar/connections?wsId=${workspace.id}`, {
        cache: 'no-store',
      });

      return payload.connections ?? [];
    },
    enabled: !!workspace?.id && activeTab === 'calendar_integrations',
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const navItems = buildSettingsNavItems({
    availability,
    boardId,
    isBillingPermissionLoading,
    t,
    wsId,
  });
  const activeTabIsVisible = navItems.some((group) =>
    group.items.some((item) => item.name === activeTab && !item.disabled)
  );
  const fallbackTab = navItems
    .flatMap((group) => group.items)
    .find((item) => !item.disabled)?.name;
  useEffect(() => {
    if (isBillingPermissionLoading || activeTabIsVisible) return;

    if (fallbackTab && fallbackTab !== activeTab) {
      setActiveTab(fallbackTab);
    }
  }, [activeTab, activeTabIsVisible, fallbackTab, isBillingPermissionLoading]);

  return (
    <SettingsDialogShell
      navItems={navItems}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
      expandAllAccordions={expandAllAccordions}
      keyboardNavigation
    >
      <SettingsDialogContent
        activeTab={activeTab}
        allowWorkspaceBasicsEdit={availability.allowWorkspaceBasicsEdit}
        autoAddNewGroupsToDefaultIncludedGroups={
          autoAddNewGroupsToDefaultIncludedGroups
        }
        boardId={boardId}
        calendarConnections={calendarConnections}
        canManageVersionBadge={canManageVersionBadge}
        canManageWorkspaceMembers={availability.canManageWorkspaceMembers}
        canManageWorkspaceRoles={availability.canManageWorkspaceRoles}
        canManageWorkspaceSettings={availability.canManageWorkspaceSettings}
        defaultExcludedGroupIds={defaultExcludedGroupIds}
        defaultIncludedGroupIds={defaultIncludedGroupIds}
        featuredGroupIds={featuredGroupIds}
        hasBillingPermission={availability.hasBillingPermission}
        isLoadingWorkspace={isLoadingWorkspace}
        isLoadingWorkspaceCustomConfigs={isLoadingWorkspaceCustomConfigs}
        linkedProvider={linkedProvider}
        setActiveTab={setActiveTab}
        t={t}
        user={user}
        workspace={workspace}
        workspaceError={workspaceError ?? null}
        wsId={wsId}
      />
    </SettingsDialogShell>
  );
}
