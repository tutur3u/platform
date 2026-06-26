'use client';

import {
  WORKSPACE_ADMIN_NATIVE_TABS,
  WorkspaceAdminNativeSettingsPanels,
} from './settings-dialog-native-admin-panels';
import {
  INFRASTRUCTURE_NATIVE_TABS,
  InfrastructureNativeSettingsPanels,
} from './settings-dialog-native-infrastructure-panels';

interface SettingsDialogNativeRoutePanelsProps {
  activeTab: string;
  currentUserEmail: string | null;
  setActiveTab: (tab: string) => void;
  wsId: string;
}

export const SETTINGS_DIALOG_NATIVE_ROUTE_TABS = new Set([
  ...WORKSPACE_ADMIN_NATIVE_TABS,
  ...INFRASTRUCTURE_NATIVE_TABS,
]);

export function SettingsDialogNativeRoutePanels({
  activeTab,
  setActiveTab,
  wsId,
}: SettingsDialogNativeRoutePanelsProps) {
  if (!SETTINGS_DIALOG_NATIVE_ROUTE_TABS.has(activeTab)) return null;

  return (
    <>
      <WorkspaceAdminNativeSettingsPanels
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        wsId={wsId}
      />
      <InfrastructureNativeSettingsPanels activeTab={activeTab} wsId={wsId} />
    </>
  );
}
