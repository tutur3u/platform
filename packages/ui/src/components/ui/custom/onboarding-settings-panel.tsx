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

// Resolve with host (including port): localhost apps are distinguished only
// by port, and the guide overlay resolves the app the same way.
function currentAppSlug() {
  if (typeof window === 'undefined') return 'platform';
  return getLaunchableAppByHostname(window.location.host)?.slug ?? 'platform';
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
      // The welcome flow replaces the platform app guide for a full restart.
      replay_app: null,
    }).catch(() => null);

    const platform = getLaunchableApp('platform');
    if (!platform) {
      setPending(null);
      return;
    }
    window.location.assign(
      resolveLaunchableAppUrl({
        app: platform,
        currentOrigin: window.location.origin,
        path: '/onboarding',
        searchParams: { replay: '1' },
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
