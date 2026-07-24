'use client';

import { useQuery } from '@tanstack/react-query';
import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { SettingsDialogShell } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useUserBooleanConfig } from '@/hooks/use-user-config';
import { apiFetch } from '@/lib/api-fetch';
import { SettingsDialogContent } from './settings-dialog-content';
import { buildSettingsNavItems } from './settings-dialog-nav-items';
import {
  getSettingsDialogAvailability,
  type WorkspaceSettingsPermissions,
} from './settings-dialog-permissions';
import { SettingsWorkspaceBreadcrumb } from './settings-workspace-breadcrumb';

interface SettingsDialogProps {
  boardId?: string;
  wsId?: string;
  user: WorkspaceUser | null;
  defaultTab?: string;
  workspace?: Workspace | null;
  linkedProvider?: string;
}

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

  const normalizedDefaultTab = normalizeSettingsTab(defaultTab);
  const [activeTab, setActiveTab] = useState(normalizedDefaultTab);

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
  const workspaceGroup = navItems.find((group) =>
    group.items.some((item) => item.name === 'workspace_general')
  );
  const isWorkspaceSettingsTab = workspaceGroup?.items.some(
    (item) => item.name === activeTab
  );
  useEffect(() => {
    if (isBillingPermissionLoading || activeTabIsVisible) return;

    if (fallbackTab && fallbackTab !== activeTab) {
      setActiveTab(fallbackTab);
    }
  }, [activeTab, activeTabIsVisible, fallbackTab, isBillingPermissionLoading]);

  return (
    <SettingsDialogShell
      activeGroupBreadcrumb={
        wsId && isWorkspaceSettingsTab ? (
          <SettingsWorkspaceBreadcrumb activeTab={activeTab} wsId={wsId} />
        ) : undefined
      }
      navItems={navItems}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
      expandAllAccordions={expandAllAccordions}
      keyboardNavigation
    >
      <SettingsDialogContent
        activeTab={activeTab}
        allowWorkspaceBasicsEdit={availability.allowWorkspaceBasicsEdit}
        canManageVersionBadge={canManageVersionBadge}
        canManageWorkspaceMembers={availability.canManageWorkspaceMembers}
        canManageWorkspaceRoles={availability.canManageWorkspaceRoles}
        hasBillingPermission={availability.hasBillingPermission}
        isLoadingWorkspace={isLoadingWorkspace}
        linkedProvider={linkedProvider}
        setActiveTab={setActiveTab}
        user={user}
        workspace={workspace}
        workspaceError={workspaceError ?? null}
        wsId={wsId}
      />
    </SettingsDialogShell>
  );
}
