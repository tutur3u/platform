'use client';
import { MessageSquareText, Play, RotateCcw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
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
