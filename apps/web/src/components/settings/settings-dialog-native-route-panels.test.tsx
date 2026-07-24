import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsDialogNativeRoutePanels } from './settings-dialog-native-route-panels';

const { adminTabs } = vi.hoisted(() => ({
  adminTabs: new Set(['api_keys', 'integrations', 'secrets']),
}));

vi.mock('./settings-dialog-native-admin-panels', () => ({
  WORKSPACE_ADMIN_NATIVE_TABS: adminTabs,
  WorkspaceAdminNativeSettingsPanels: ({ activeTab }: { activeTab: string }) =>
    adminTabs.has(activeTab) ? (
      <div data-testid={`native-settings-panel-${activeTab}`} />
    ) : null,
}));

describe('SettingsDialogNativeRoutePanels', () => {
  it.each(['integrations', 'api_keys', 'secrets'])(
    'renders a native panel for %s',
    (activeTab) => {
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
    }
  );
});
