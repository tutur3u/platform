'use client';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { OnboardingSettingsPanel } from './onboarding-settings-panel';
import {
  SatelliteSettingsDialogShell,
  type SettingsDialogShellProps as SharedProps,
} from './satellite-settings-dialog-shell';

export type {
  SettingsNavGroup,
  SettingsNavItem,
} from './satellite-settings-dialog-shell';
export type SettingsDialogShellProps = Omit<
  SharedProps,
  't' | 'persistedTab' | 'setPersistedTab' | 'onboardingPanel'
>;
export function SettingsDialogShell(props: SettingsDialogShellProps) {
  const t = useTranslations();
  const [persistedTab, setPersistedTab] = useQueryState(
    'settingsTab',
    parseAsString.withOptions({
      history: 'replace',
      shallow: true,
      scroll: false,
    })
  );
  return (
    <SatelliteSettingsDialogShell
      {...props}
      t={t}
      persistedTab={persistedTab}
      setPersistedTab={setPersistedTab}
      onboardingPanel={<OnboardingSettingsPanel />}
    />
  );
}
