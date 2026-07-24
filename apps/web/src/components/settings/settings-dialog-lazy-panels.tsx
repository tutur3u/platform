'use client';

import { lazy } from 'react';
import { withPanelSuspense } from './settings-dialog-lazy-panel-utils';

const LazyAccountManagementSettings = lazy(
  () => import('./account/account-management-settings')
);
const LazyAppearanceSettings = lazy(() => import('./appearance-settings'));
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
const LazySecuritySettings = lazy(() => import('./account/security-settings'));
const LazySessionSettings = lazy(() => import('./account/session-settings'));
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
const LazySettingsDialogNativeRoutePanels = lazy(() =>
  import('./settings-dialog-native-route-panels').then((module) => ({
    default: module.SettingsDialogNativeRoutePanels,
  }))
);
export const AccountManagementSettings = withPanelSuspense(
  LazyAccountManagementSettings
);
export const AppearanceSettings = withPanelSuspense(LazyAppearanceSettings);
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
export const SettingsDialogNativeRoutePanels = withPanelSuspense(
  LazySettingsDialogNativeRoutePanels
);
export const SecuritySettings = withPanelSuspense(LazySecuritySettings);
export const SessionSettings = withPanelSuspense(LazySessionSettings);
export const UserStatusSettings = withPanelSuspense(LazyUserStatusSettings);
export const WorkspaceBillingSettings = withPanelSuspense(
  LazyWorkspaceBillingSettings
);
export const WorkspaceGeneralSettingsPanel = withPanelSuspense(
  LazyWorkspaceGeneralSettingsPanel
);
export const WorkspaceMembersSettingsPanel = withPanelSuspense(
  LazyWorkspaceMembersSettingsPanel
);
