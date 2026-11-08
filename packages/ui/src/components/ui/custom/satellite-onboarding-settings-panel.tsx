'use client';
import { MessageSquareText, Play, RotateCcw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from './settings-item-tab';
import { SettingsSection } from './settings-section';

export function SatelliteOnboardingSettingsPanel({
  t,
  pending,
  replayApp,
  restartJourney,
  shareFeedback,
}: {
  t: (
    key:
      | 'feedback'
      | 'feedback_description'
      | 'replay_app'
      | 'replay_app_description'
      | 'restart_journey'
      | 'restart_journey_description'
  ) => string;
  pending: 'replay' | 'restart' | null;
  replayApp: () => void;
  restartJourney: () => void;
  shareFeedback: () => void;
}) {
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
    <SettingsSection>
      {actions.map((action) => (
        <SettingItemTab
          key={action.label}
          description={action.description}
          icon={<action.icon className="size-4" />}
          title={action.label}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={action.pending}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        </SettingItemTab>
      ))}
    </SettingsSection>
  );
}
