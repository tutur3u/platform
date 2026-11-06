'use client';

import { OnboardingSettingsPanel } from '@tuturuuu/ui/custom/onboarding-settings-panel';
import {
  SatelliteSettingsDialogShell,
  type SettingsDialogShellProps,
} from '@tuturuuu/ui/custom/satellite-settings-dialog-shell';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';

/**
 * Mail settings persist their tab in `mailSettingsTab`. The shared
 * `settingsTab` parameter opens the account settings dialog, which would
 * otherwise stack on top of Mail settings whenever a Mail tab is selected.
 */
export function MailSettingsShell(
  props: Omit<
    SettingsDialogShellProps,
    't' | 'persistedTab' | 'setPersistedTab' | 'onboardingPanel'
  >
) {
  const t = useTranslations();
  const [persistedTab, setPersistedTab] = useQueryState(
    'mailSettingsTab',
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
