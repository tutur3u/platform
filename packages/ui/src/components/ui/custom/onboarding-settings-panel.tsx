'use client';

import { MessageSquareText, Play, RotateCcw } from '@tuturuuu/icons';
import { updateConnectedOnboardingProgress } from '@tuturuuu/internal-api/onboarding';
import { Button } from '@tuturuuu/ui/button';
import {
  getLaunchableApp,
  getLaunchableAppByHostname,
  resolveLaunchableAppUrl,
} from '@tuturuuu/utils/launchable-apps';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

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

  const actions = [
    {
      description: t('replay_app_description'),
      icon: Play,
      label: t('replay_app'),
      onClick: replayApp,
      pending: pending === 'replay',
    },
    {
      description: t('restart_journey_description'),
      icon: RotateCcw,
      label: t('restart_journey'),
      onClick: restartJourney,
      pending: pending === 'restart',
    },
    {
      description: t('feedback_description'),
      icon: MessageSquareText,
      label: t('feedback'),
      onClick: shareFeedback,
      pending: false,
    },
  ];

  return (
    <div className="space-y-3">
      {actions.map((action) => (
        <div
          key={action.label}
          className="flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/40">
              <action.icon className="size-4" />
            </div>
            <div>
              <p className="font-medium text-sm">{action.label}</p>
              <p className="mt-1 max-w-xl text-muted-foreground text-sm">
                {action.description}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={action.pending}
            onClick={action.onClick}
          >
            <action.icon className="size-4" />
            {action.label}
          </Button>
        </div>
      ))}
    </div>
  );
}
