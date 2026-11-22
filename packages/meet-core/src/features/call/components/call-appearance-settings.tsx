'use client';

import { ExperimentalUiSetting } from '@tuturuuu/ui/custom/settings/experimental-ui-setting';
import { ThemeModeSetting } from '@tuturuuu/ui/custom/settings/theme-mode-setting';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';

/**
 * Appearance page of the call settings, built from the shared settings rows.
 * The light, dark or system choice is kept on this device, so guests have it
 * too; the Sorbet design, palette and corners are account settings.
 */
export function CallAppearanceSettings({ signedIn }: { signedIn: boolean }) {
  return (
    <SettingsSection>
      <ThemeModeSetting idPrefix="meet-theme-" />
      {signedIn && <ExperimentalUiSetting />}
    </SettingsSection>
  );
}
