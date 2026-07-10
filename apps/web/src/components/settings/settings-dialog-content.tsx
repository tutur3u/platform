'use client';

import type { CalendarConnection, Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  AccountManagementSettings,
  AppearanceSettings,
  ApprovalsSettings,
  AttendanceDisplaySettings,
  BoardSettingsPanel,
  CalendarContentSettingsPanel,
  CalendarGeneralSettingsPanel,
  CalendarIntegrationsSettingsPanel,
  DebtLoanSettings,
  DefaultCurrencySettings,
  ExperimentalFinanceSettings,
  FinanceNavigationSettings,
  FormsAutosaveSettings,
  InvoiceSettings,
  InvoiceVisibilitySettings,
  KeyboardShortcutsSettings,
  MiraMemorySettings,
  MiraPersonalitySettings,
  NavigationSidebarSettings,
  NotificationSettings,
  ProfileSettingsPanel,
  ReferralSettings,
  ReportDefaultTitleSettings,
  SecuritySettings,
  SessionSettings,
  SettingsDialogNativeRoutePanels,
  TaskGeneralSettingsPanel,
  TaskInitiativesSettings,
  TaskLabelsSettings,
  TaskProjectsSettings,
  TaskShareSettings,
  TaskTemplatesSettings,
  TimeTrackerCategoriesSettings,
  TimeTrackerGeneralSettings,
  TimeTrackerGoalsSettings,
  TimeTrackerRequestsSettings,
  TransactionDefaultsSettings,
  UserStatusSettings,
  WorkspaceBillingSettings,
  WorkspaceBreakTypesSettings,
  WorkspaceGeneralSettingsPanel,
  WorkspaceMembersSettingsPanel,
} from './settings-dialog-lazy-panels';
import type { SettingsTranslator } from './settings-dialog-nav-types';

interface SettingsDialogContentProps {
  activeTab: string;
  allowWorkspaceBasicsEdit: boolean;
  boardId?: string;
  calendarConnections?: CalendarConnection[];
  canManageVersionBadge: boolean;
  canManageWorkspaceMembers: boolean;
  canManageWorkspaceRoles: boolean;
  canManageWorkspaceSettings: boolean;
  hasBillingPermission: boolean;
  isLoadingWorkspace: boolean;
  linkedProvider?: string;
  setActiveTab: (tab: string) => void;
  t: SettingsTranslator;
  user: WorkspaceUser | null;
  workspace: Workspace | null;
  workspaceError: Error | null;
  wsId?: string;
}

export function SettingsDialogContent({
  activeTab,
  allowWorkspaceBasicsEdit,
  boardId,
  calendarConnections,
  canManageVersionBadge,
  canManageWorkspaceMembers,
  canManageWorkspaceRoles,
  canManageWorkspaceSettings,
  hasBillingPermission,
  isLoadingWorkspace,
  linkedProvider,
  setActiveTab,
  t,
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
      {activeTab === 'forms' && (
        <div className="h-full">
          <FormsAutosaveSettings />
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
      {activeTab === 'tasks_general' && (
        <TaskGeneralSettingsPanel workspace={workspace} wsId={wsId} />
      )}
      {activeTab === 'task_board' && wsId && boardId && (
        <div className="h-full">
          <BoardSettingsPanel boardId={boardId} wsId={wsId} />
        </div>
      )}
      {activeTab === 'task_share' && (
        <div className="h-full">
          <TaskShareSettings boardId={boardId} wsId={wsId} />
        </div>
      )}
      {activeTab === 'task_labels' && wsId && (
        <div className="h-full">
          <TaskLabelsSettings wsId={wsId} />
        </div>
      )}
      {activeTab === 'task_projects' && wsId && (
        <div className="h-full">
          <TaskProjectsSettings wsId={wsId} />
        </div>
      )}
      {activeTab === 'task_initiatives' && wsId && (
        <div className="h-full">
          <TaskInitiativesSettings wsId={wsId} />
        </div>
      )}
      {activeTab === 'task_templates' && wsId && (
        <div className="h-full">
          <TaskTemplatesSettings wsId={wsId} />
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
      {activeTab === 'approvals' && wsId && (
        <div className="h-full">
          <ApprovalsSettings wsId={wsId} />
        </div>
      )}
      {activeTab === 'report_default_title' && workspace?.id && (
        <ReportDefaultTitleSettings workspaceId={workspace.id} />
      )}
      {activeTab === 'finance_navigation' && workspace?.id && (
        <FinanceNavigationSettings workspaceId={workspace.id} />
      )}
      {activeTab === 'invoice_visibility' && workspace?.id && (
        <InvoiceVisibilitySettings
          workspaceId={workspace.id}
          isPersonalWorkspace={workspace.personal}
        />
      )}
      {activeTab === 'transaction_defaults' && workspace?.id && (
        <TransactionDefaultsSettings workspaceId={workspace.id} user={user} />
      )}
      {activeTab === 'default_currency' && workspace?.id && (
        <DefaultCurrencySettings workspaceId={workspace.id} />
      )}
      {activeTab === 'invoice_settings' && workspace?.id && (
        <InvoiceSettings workspaceId={workspace.id} />
      )}
      {activeTab === 'debt_loan_categories' && workspace?.id && (
        <DebtLoanSettings workspaceId={workspace.id} />
      )}
      {activeTab === 'experimental_finance' && workspace?.id && (
        <ExperimentalFinanceSettings workspaceId={workspace.id} />
      )}
      {activeTab === 'referrals' && wsId && <ReferralSettings wsId={wsId} />}
      {activeTab === 'calendar_general' && (
        <CalendarGeneralSettingsPanel
          title={t('settings.calendar.general')}
          description={t('settings.calendar.general_description')}
          workspace={workspace}
          wsId={wsId}
        />
      )}
      {activeTab === 'calendar_integrations' && wsId && (
        <CalendarIntegrationsSettingsPanel
          wsId={wsId}
          title={t('settings.calendar.integrations')}
          description={t('settings.calendar.integrations_description')}
          workspace={workspace}
          calendarConnections={calendarConnections || []}
        />
      )}
      {(activeTab === 'calendar_hours' || activeTab === 'calendar_colors') &&
        wsId && (
          <CalendarContentSettingsPanel
            section={activeTab}
            wsId={wsId}
            workspace={workspace}
          />
        )}
      {activeTab === 'break_types' && wsId && (
        <WorkspaceBreakTypesSettings wsId={wsId} />
      )}
      {activeTab === 'time_tracker_categories' && wsId && (
        <TimeTrackerCategoriesSettings wsId={wsId} />
      )}
      {activeTab === 'time_tracker_goals' && wsId && (
        <TimeTrackerGoalsSettings wsId={wsId} />
      )}
      {activeTab === 'time_tracker_general' && wsId && (
        <TimeTrackerGeneralSettings wsId={wsId} />
      )}
      {activeTab === 'time_tracker_requests' && wsId && (
        <TimeTrackerRequestsSettings
          wsId={wsId}
          canManageWorkspaceSettings={canManageWorkspaceSettings}
        />
      )}
      {activeTab === 'attendance_display' && wsId && (
        <AttendanceDisplaySettings wsId={wsId} />
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
