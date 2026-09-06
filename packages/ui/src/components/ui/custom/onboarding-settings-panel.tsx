'use client';

import { updateConnectedOnboardingProgress } from '@tuturuuu/internal-api/onboarding';
import {
  getLaunchableApp,
  getLaunchableAppByHostname,
  resolveLaunchableAppUrl,
} from '@tuturuuu/utils/launchable-apps';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { SatelliteOnboardingSettingsPanel } from './satellite-onboarding-settings-panel';

function currentAppSlug() {
  if (typeof window === 'undefined') return 'platform';
  return (
    getLaunchableAppByHostname(window.location.hostname)?.slug ?? 'platform'
  );
}

function closeSettingsDialog() {
  window.dispatchEvent(new Event('tuturuuu:settings-dialog-close-intent'));
}

export function OnboardingSettingsPanel() {
  const t = useTranslations('onboarding_guide');
  const [pending, setPending] = useState<'replay' | 'restart' | null>(null);

  const replayApp = async () => {
    const appSlug = currentAppSlug();
    setPending('replay');
    await updateConnectedOnboardingProgress({
      dismissed_at: null,
      replay_app: appSlug,
    }).catch(() => null);
    setPending(null);
    closeSettingsDialog();
    window.dispatchEvent(
      new CustomEvent('tuturuuu:onboarding-replay', { detail: { appSlug } })
    );
  };

  const restartJourney = async () => {
    setPending('restart');
    await updateConnectedOnboardingProgress({
      completed_missions: [],
      dismissed_at: null,
      goals: [],
      guidance_mode: 'standard',
      journey_revision: 2,
      persona: null,
      replay_app: 'platform',
    }).catch(() => null);

    const platform = getLaunchableApp('platform');
    if (!platform) return;
    window.location.assign(
      resolveLaunchableAppUrl({
        app: platform,
        currentOrigin: window.location.origin,
        path: '/personal',
        searchParams: { guide: 'platform' },
      })
    );
  };

  const shareFeedback = () => {
    closeSettingsDialog();
    window.dispatchEvent(
      new CustomEvent('tuturuuu:report-problem-open-intent', {
        detail: { context: `onboarding:${currentAppSlug()}` },
      })
    );
  };

  return (
    <SatelliteOnboardingSettingsPanel
      t={t}
      pending={pending}
      replayApp={replayApp}
      restartJourney={restartJourney}
      shareFeedback={shareFeedback}
    />
  );
}
