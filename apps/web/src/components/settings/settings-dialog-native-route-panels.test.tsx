import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsDialogNativeRoutePanels } from './settings-dialog-native-route-panels';

const { adminTabs, infrastructureTabs } = vi.hoisted(() => ({
  adminTabs: new Set([
    'api_keys',
    'integrations',
    'secrets',
    'workspace_reports',
  ]),
  infrastructureTabs: new Set([
    'infrastructure_calendar_sync',
    'infrastructure_devboxes',
    'infrastructure_email_audit',
    'infrastructure_email_templates',
    'infrastructure_entity_creation_limits',
    'infrastructure_external_apps',
    'infrastructure_monitoring',
    'infrastructure_overview',
    'infrastructure_push_notifications',
  ]),
}));

vi.mock('./settings-dialog-native-admin-panels', () => ({
  WORKSPACE_ADMIN_NATIVE_TABS: adminTabs,
  WorkspaceAdminNativeSettingsPanels: ({ activeTab }: { activeTab: string }) =>
    adminTabs.has(activeTab) ? (
      <div data-testid={`native-settings-panel-${activeTab}`} />
    ) : null,
}));

vi.mock('./settings-dialog-native-infrastructure-panels', () => ({
  INFRASTRUCTURE_NATIVE_TABS: infrastructureTabs,
  InfrastructureNativeSettingsPanels: ({ activeTab }: { activeTab: string }) =>
    infrastructureTabs.has(activeTab) ? (
      <div data-testid={`native-settings-panel-${activeTab}`} />
    ) : null,
}));

describe('SettingsDialogNativeRoutePanels', () => {
  it.each([
    'integrations',
    'api_keys',
    'secrets',
    'infrastructure_calendar_sync',
    'infrastructure_devboxes',
    'infrastructure_email_audit',
    'infrastructure_email_templates',
    'infrastructure_entity_creation_limits',
    'infrastructure_overview',
    'infrastructure_external_apps',
    'infrastructure_monitoring',
    'infrastructure_push_notifications',
    'workspace_reports',
  ])('renders a native panel for %s', (activeTab) => {
    render(
      <SettingsDialogNativeRoutePanels
        activeTab={activeTab}
        currentUserEmail="ada@example.com"
        setActiveTab={() => undefined}
        wsId="ws_1"
      />
    );

    expect(
      screen.getByTestId(`native-settings-panel-${activeTab}`)
    ).toBeVisible();
  });
});
