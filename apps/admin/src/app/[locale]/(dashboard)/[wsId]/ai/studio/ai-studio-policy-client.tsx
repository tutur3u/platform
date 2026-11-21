'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { updateGlobalAiStudioSettingsAction } from './actions';
import { GlobalAiStudioSettingsSection } from './global-settings-section';
import type { AiStudioGlobalSettings } from './types';
import { WorkspaceAiStudioPoliciesSection } from './workspace-policies-section';

export function AiStudioPolicyClient({
  globalSettings: initialGlobalSettings,
  infrastructureWsId,
}: {
  globalSettings: AiStudioGlobalSettings;
  infrastructureWsId: string;
}) {
  const t = useTranslations('ai-studio-admin');
  const [globalSettings, setGlobalSettings] = useState(initialGlobalSettings);
  const [isPending, startTransition] = useTransition();

  function saveGlobalSettings() {
    startTransition(async () => {
      try {
        await updateGlobalAiStudioSettingsAction(
          infrastructureWsId,
          globalSettings
        );
        toast.success(t('saved'));
      } catch (error) {
        console.error(error);
        toast.error(t('save_error'));
      }
    });
  }

  return (
    <div className="space-y-6">
      <GlobalAiStudioSettingsSection
        isPending={isPending}
        onSave={saveGlobalSettings}
        settings={globalSettings}
        setSettings={setGlobalSettings}
      />
      <WorkspaceAiStudioPoliciesSection
        infrastructureWsId={infrastructureWsId}
      />
    </div>
  );
}
