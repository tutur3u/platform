'use client';

import { SettingsDialogShell } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { useState } from 'react';

export function GuidanceSettingsDialog() {
  const [activeTab, setActiveTab] = useState('onboarding_guide');

  return (
    <SettingsDialogShell
      activeTab={activeTab}
      navItems={[]}
      onActiveTabChange={setActiveTab}
    >
      {null}
    </SettingsDialogShell>
  );
}
