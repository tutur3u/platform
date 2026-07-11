'use client';

import { lazy } from 'react';
import { withPanelSuspense } from './settings-dialog-lazy-panel-utils';

export {
  CalendarContentSettingsPanel,
  CalendarGeneralSettingsPanel,
  CalendarIntegrationsSettingsPanel,
} from './settings-dialog-lazy-calendar-panels';

const LazyApprovalsSettings = lazy(() =>
  import('./approvals/approvals-settings').then((module) => ({
    default: module.ApprovalsSettings,
  }))
);
const LazyAccountManagementSettings = lazy(
  () => import('./account/account-management-settings')
);
const LazyAppearanceSettings = lazy(() => import('./appearance-settings'));
const LazyFormsAutosaveSettings = lazy(() =>
  import('./forms/forms-autosave-settings').then((module) => ({
    default: module.FormsAutosaveSettings,
  }))
);
const LazyKeyboardShortcutsSettings = lazy(() =>
  import('./keyboard-shortcuts-settings').then((module) => ({
    default: module.KeyboardShortcutsSettings,
  }))
);
const LazyNavigationSidebarSettings = lazy(() => import('./sidebar-settings'));
const LazyNotificationSettings = lazy(
  () => import('./account/notification-settings')
);
const LazyProfileSettingsPanel = lazy(() =>
  import('./settings-dialog-profile-panel').then((module) => ({
    default: module.ProfileSettingsPanel,
  }))
);
const LazyReferralSettings = lazy(
  () => import('./inventory/referral-settings')
);
const LazySecuritySettings = lazy(() => import('./account/security-settings'));
const LazySessionSettings = lazy(() => import('./account/session-settings'));
const LazyTaskGeneralSettingsPanel = lazy(() =>
  import('./settings-dialog-task-general-panel').then((module) => ({
    default: module.TaskGeneralSettingsPanel,
  }))
);
const LazyAttendanceDisplaySettings = lazy(
  () => import('./attendance/attendance-display-settings')
);
const LazyUserStatusSettings = lazy(
  () => import('./workspace/user-status-settings')
);
const LazyWorkspaceBillingSettings = lazy(
  () => import('./workspace/billing-settings')
);
const LazyWorkspaceGeneralSettingsPanel = lazy(() =>
  import('./settings-dialog-workspace-panels').then((module) => ({
    default: module.WorkspaceGeneralSettingsPanel,
  }))
);
const LazyWorkspaceMembersSettingsPanel = lazy(() =>
  import('./settings-dialog-workspace-panels').then((module) => ({
    default: module.WorkspaceMembersSettingsPanel,
  }))
);
const LazyDebtLoanSettings = lazy(() => import('./finance/debt-loan-settings'));
const LazyDefaultCurrencySettings = lazy(
  () => import('./finance/default-currency-settings')
);
const LazyExperimentalFinanceSettings = lazy(
  () => import('./finance/experimental-finance-settings')
);
const LazyFinanceNavigationSettings = lazy(
  () => import('./finance/finance-navigation-settings')
);
const LazyInvoiceSettings = lazy(() => import('./finance/invoice-settings'));
const LazyInvoiceVisibilitySettings = lazy(
  () => import('./finance/invoice-visibility-settings')
);
const LazyTransactionDefaultsSettings = lazy(
  () => import('./finance/transaction-defaults-settings')
);
const LazyMiraMemorySettings = lazy(() =>
  import('./mira/mira-memory-settings').then((module) => ({
    default: module.MiraMemorySettings,
  }))
);
const LazyMiraPersonalitySettings = lazy(() =>
  import('./mira/mira-personality-settings').then((module) => ({
    default: module.MiraPersonalitySettings,
  }))
);
const LazyReportDefaultTitleSettings = lazy(() =>
  import('./reports/report-default-title-settings').then((module) => ({
    default: module.ReportDefaultTitleSettings,
  }))
);
const LazySettingsDialogNativeRoutePanels = lazy(() =>
  import('./settings-dialog-native-route-panels').then((module) => ({
    default: module.SettingsDialogNativeRoutePanels,
  }))
);
const LazyTimeTrackerCategoriesSettings = lazy(() =>
  import('./time-tracker/time-tracker-categories-settings').then((module) => ({
    default: module.TimeTrackerCategoriesSettings,
  }))
);
const LazyTimeTrackerGeneralSettings = lazy(() =>
  import('./time-tracker/time-tracker-general-settings').then((module) => ({
    default: module.TimeTrackerGeneralSettings,
  }))
);
const LazyTimeTrackerGoalsSettings = lazy(() =>
  import('./time-tracker/time-tracker-goals-settings').then((module) => ({
    default: module.TimeTrackerGoalsSettings,
  }))
);
const LazyTimeTrackerRequestsSettings = lazy(() =>
  import('./time-tracker/time-tracker-requests-settings').then((module) => ({
    default: module.TimeTrackerRequestsSettings,
  }))
);
const LazyWorkspaceBreakTypesSettings = lazy(() =>
  import('./time-tracker/workspace-break-types-settings').then((module) => ({
    default: module.WorkspaceBreakTypesSettings,
  }))
);

const loadBoardSettingsPanel = () =>
  import('./tasks/board-settings/board-settings-panel').then((module) => ({
    default: module.BoardSettingsPanel,
  }));
const LazyBoardSettingsPanel = lazy(loadBoardSettingsPanel);

export function preloadBoardSettingsPanel() {
  void loadBoardSettingsPanel();
}

const LazyTaskInitiativesSettings = lazy(() =>
  import('./tasks/task-initiatives-settings').then((module) => ({
    default: module.TaskInitiativesSettings,
  }))
);
const LazyTaskLabelsSettings = lazy(() =>
  import('./tasks/task-labels-settings').then((module) => ({
    default: module.TaskLabelsSettings,
  }))
);
const LazyTaskProjectsSettings = lazy(() =>
  import('./tasks/task-projects-settings').then((module) => ({
    default: module.TaskProjectsSettings,
  }))
);
const LazyTaskShareSettings = lazy(() =>
  import('./tasks/task-share-settings').then((module) => ({
    default: module.TaskShareSettings,
  }))
);
const LazyTaskTemplatesSettings = lazy(() =>
  import('./tasks/task-templates-settings').then((module) => ({
    default: module.TaskTemplatesSettings,
  }))
);

export const AccountManagementSettings = withPanelSuspense(
  LazyAccountManagementSettings
);
export const AppearanceSettings = withPanelSuspense(LazyAppearanceSettings);
export const ApprovalsSettings = withPanelSuspense(LazyApprovalsSettings);
export const AttendanceDisplaySettings = withPanelSuspense(
  LazyAttendanceDisplaySettings
);
export const BoardSettingsPanel = withPanelSuspense(LazyBoardSettingsPanel);
export const DebtLoanSettings = withPanelSuspense(LazyDebtLoanSettings);
export const DefaultCurrencySettings = withPanelSuspense(
  LazyDefaultCurrencySettings
);
export const ExperimentalFinanceSettings = withPanelSuspense(
  LazyExperimentalFinanceSettings
);
export const FormsAutosaveSettings = withPanelSuspense(
  LazyFormsAutosaveSettings
);
export const FinanceNavigationSettings = withPanelSuspense(
  LazyFinanceNavigationSettings
);
export const InvoiceSettings = withPanelSuspense(LazyInvoiceSettings);
export const InvoiceVisibilitySettings = withPanelSuspense(
  LazyInvoiceVisibilitySettings
);
export const KeyboardShortcutsSettings = withPanelSuspense(
  LazyKeyboardShortcutsSettings
);
export const MiraMemorySettings = withPanelSuspense(LazyMiraMemorySettings);
export const MiraPersonalitySettings = withPanelSuspense(
  LazyMiraPersonalitySettings
);
export const NavigationSidebarSettings = withPanelSuspense(
  LazyNavigationSidebarSettings
);
export const NotificationSettings = withPanelSuspense(LazyNotificationSettings);
export const ProfileSettingsPanel = withPanelSuspense(LazyProfileSettingsPanel);
export const ReferralSettings = withPanelSuspense(LazyReferralSettings);
export const ReportDefaultTitleSettings = withPanelSuspense(
  LazyReportDefaultTitleSettings
);
export const SettingsDialogNativeRoutePanels = withPanelSuspense(
  LazySettingsDialogNativeRoutePanels
);
export const SecuritySettings = withPanelSuspense(LazySecuritySettings);
export const SessionSettings = withPanelSuspense(LazySessionSettings);
export const TaskGeneralSettingsPanel = withPanelSuspense(
  LazyTaskGeneralSettingsPanel
);
export const TaskInitiativesSettings = withPanelSuspense(
  LazyTaskInitiativesSettings
);
export const TaskLabelsSettings = withPanelSuspense(LazyTaskLabelsSettings);
export const TaskProjectsSettings = withPanelSuspense(LazyTaskProjectsSettings);
export const TaskShareSettings = withPanelSuspense(LazyTaskShareSettings);
export const TaskTemplatesSettings = withPanelSuspense(
  LazyTaskTemplatesSettings
);
export const TimeTrackerCategoriesSettings = withPanelSuspense(
  LazyTimeTrackerCategoriesSettings
);
export const TimeTrackerGeneralSettings = withPanelSuspense(
  LazyTimeTrackerGeneralSettings
);
export const TimeTrackerGoalsSettings = withPanelSuspense(
  LazyTimeTrackerGoalsSettings
);
export const TimeTrackerRequestsSettings = withPanelSuspense(
  LazyTimeTrackerRequestsSettings
);
export const TransactionDefaultsSettings = withPanelSuspense(
  LazyTransactionDefaultsSettings
);
export const UserStatusSettings = withPanelSuspense(LazyUserStatusSettings);
export const WorkspaceBillingSettings = withPanelSuspense(
  LazyWorkspaceBillingSettings
);
export const WorkspaceBreakTypesSettings = withPanelSuspense(
  LazyWorkspaceBreakTypesSettings
);
export const WorkspaceGeneralSettingsPanel = withPanelSuspense(
  LazyWorkspaceGeneralSettingsPanel
);
export const WorkspaceMembersSettingsPanel = withPanelSuspense(
  LazyWorkspaceMembersSettingsPanel
);
