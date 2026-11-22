'use client';

import { Label } from '@tuturuuu/ui/label';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import type { RoomToolsMode } from './call-room-tools';

const modes = ['hosts', 'showcase', 'everyone'] as const;

/** Settings section: who may open Co-Programming, documents and tools. */
export function CallActivitySettings({
  mode = 'hosts',
  onMode,
  participantNavigation,
  onParticipantNavigation,
}: {
  mode?: RoomToolsMode;
  onMode: (mode: RoomToolsMode) => void;
  /** Whether participants may send Follow and Summon (hosts always may). */
  participantNavigation?: boolean;
  onParticipantNavigation?: (enabled: boolean) => void;
}) {
  const t = useTranslations('meet.call.room_tools');
  const settingsT = useTranslations('meet.call.activities_settings');
  const id = useId();
  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <p id={id} className="font-semibold">
          {t('visibility')}
        </p>
        <p className="text-muted-foreground text-sm">{t('visibility_hint')}</p>
      </div>
      <RadioGroup
        aria-labelledby={id}
        value={mode}
        onValueChange={(value) => {
          const next = modes.find((entry) => entry === value);
          if (next) onMode(next);
        }}
        className="gap-2"
      >
        {modes.map((entry) => (
          <Label
            key={entry}
            htmlFor={`${id}-${entry}`}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 font-normal has-[[data-state=checked]]:border-foreground hover:bg-accent"
          >
            <RadioGroupItem
              id={`${id}-${entry}`}
              value={entry}
              className="mt-0.5 shrink-0"
            />
            <span className="grid gap-0.5 text-sm">
              <span className="font-semibold">{t(entry)}</span>
              <span className="text-muted-foreground text-xs">
                {t(`${entry}_hint`)}
              </span>
            </span>
          </Label>
        ))}
      </RadioGroup>
      {onParticipantNavigation && (
        <Label
          htmlFor={`${id}-navigation`}
          className="flex min-h-11 cursor-pointer items-center justify-between gap-4 border-t pt-4 font-normal"
        >
          <span className="grid gap-0.5 text-sm">
            <span className="font-semibold">
              {settingsT('participant_navigation')}
            </span>
            <span className="text-muted-foreground text-xs">
              {settingsT('participant_navigation_hint')}
            </span>
          </span>
          <Switch
            id={`${id}-navigation`}
            checked={participantNavigation !== false}
            onCheckedChange={onParticipantNavigation}
          />
        </Label>
      )}
    </div>
  );
}
