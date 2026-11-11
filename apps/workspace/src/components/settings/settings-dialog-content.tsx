'use client';

import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  AccountManagementSettings,
  AppearanceSettings,
  KeyboardShortcutsSettings,
  MiraMemorySettings,
  MiraPersonalitySettings,
  NavigationSidebarSettings,
  NotificationSettings,
  ProfileSettingsPanel,
  SecuritySettings,
  SessionSettings,
  SettingsDialogNativeRoutePanels,
  UserStatusSettings,
  WorkspaceBillingSettings,
  WorkspaceGeneralSettingsPanel,
  WorkspaceMembersSettingsPanel,
} from './settings-dialog-lazy-panels';

interface SettingsDialogContentProps {
  activeTab: string;
  allowWorkspaceBasicsEdit: boolean;
  canManageVersionBadge: boolean;
  canManageWorkspaceMembers: boolean;
  canManageWorkspaceRoles: boolean;
  hasBillingPermission: boolean;
  isLoadingWorkspace: boolean;
  linkedProvider?: string;
  setActiveTab: (tab: string) => void;
  user: WorkspaceUser | null;
  workspace: Workspace | null;
  workspaceError: Error | null;
  wsId?: string;
}

export function SettingsDialogContent({
  activeTab,
  allowWorkspaceBasicsEdit,
  canManageVersionBadge,
  canManageWorkspaceMembers,
  canManageWorkspaceRoles,
  hasBillingPermission,
  isLoadingWorkspace,
  linkedProvider,
  setActiveTab,
  user,
  workspace,
  workspaceError,
  wsId,
}: SettingsDialogContentProps) {
  return (
    <>
      {activeTab === 'profile' && user && <ProfileSettingsPanel user={user} />}
      {activeTab === 'security' && user && (
        <div className="h-full">
          <SecuritySettings
            user={user}
            linkedProvider={linkedProvider}
            onOpenSessions={() => setActiveTab('sessions')}
          />
        </div>
      )}
      {activeTab === 'sessions' && (
        <div className="h-full">
          <SessionSettings />
        </div>
      )}
      {activeTab === 'accounts' && (
        <div className="h-full">
          <AccountManagementSettings />
        </div>
      )}
      {activeTab === 'appearance' && (
        <div className="h-full">
          <AppearanceSettings canManageVersionBadge={canManageVersionBadge} />
        </div>
      )}
      {activeTab === 'navigation' && (
        <div className="h-full">
          <NavigationSidebarSettings wsId={wsId} user={user} />
        </div>
      )}
      {activeTab === 'notifications' && (
        <div className="h-full">
          <NotificationSettings />
        </div>
      )}
      {activeTab === 'keyboard_shortcuts' && (
        <div className="h-full">
          <KeyboardShortcutsSettings />
        </div>
      )}
      {activeTab === 'mira_personality' && (
        <div className="h-full">
          <MiraPersonalitySettings />
        </div>
      )}
      {activeTab === 'mira_memories' && (
        <div className="h-full">
          <MiraMemorySettings wsId={wsId} />
        </div>
      )}
      {activeTab === 'workspace_general' && (
        <WorkspaceGeneralSettingsPanel
          allowWorkspaceBasicsEdit={allowWorkspaceBasicsEdit}
          isLoadingWorkspace={isLoadingWorkspace}
          user={user}
          workspace={workspace}
          workspaceError={workspaceError}
        />
      )}
      {activeTab === 'workspace_members' && (
        <WorkspaceMembersSettingsPanel
          canManageWorkspaceMembers={canManageWorkspaceMembers}
          canManageWorkspaceRoles={canManageWorkspaceRoles}
          currentUserEmail={user?.email ?? null}
          isLoadingWorkspace={isLoadingWorkspace}
          workspace={workspace}
          workspaceError={workspaceError}
        />
      )}
      {activeTab === 'workspace_billing' && wsId && hasBillingPermission && (
        <div className="h-full">
          <WorkspaceBillingSettings wsId={wsId} />
        </div>
      )}
      {activeTab === 'user_status' && wsId && (
        <div className="h-full">
          <UserStatusSettings wsId={wsId} />
        </div>
      )}
      {wsId && (
        <SettingsDialogNativeRoutePanels
          activeTab={activeTab}
          currentUserEmail={user?.email ?? null}
          setActiveTab={setActiveTab}
          wsId={wsId}
        />
      )}
    </>
  );
}
