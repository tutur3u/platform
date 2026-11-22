'use client';

import { Label } from '@tuturuuu/ui/label';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import type { RoomToolsMode } from './call-room-tools';
import {
  MeetSettingsCard,
  MeetSettingsHeading,
  MeetSettingsStack,
  MeetSettingsToggle,
} from './meet-settings-card';

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
    <MeetSettingsStack>
      <MeetSettingsCard>
        <MeetSettingsHeading
          id={id}
          title={t('visibility')}
          description={t('visibility_hint')}
        />
        <RadioGroup
          aria-labelledby={id}
          value={mode}
          onValueChange={(value) => {
            const next = modes.find((entry) => entry === value);
            if (next) onMode(next);
          }}
          className="gap-3"
        >
          {modes.map((entry) => (
            <Label
              key={entry}
              htmlFor={`${id}-${entry}`}
              className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-4 font-normal has-[[data-state=checked]]:border-foreground hover:bg-accent"
            >
              <RadioGroupItem
                id={`${id}-${entry}`}
                value={entry}
                className="mt-0.5 shrink-0"
              />
              <span className="grid gap-1 text-sm">
                <span className="font-medium">{t(entry)}</span>
                <span className="text-muted-foreground">
                  {t(`${entry}_hint`)}
                </span>
              </span>
            </Label>
          ))}
        </RadioGroup>
      </MeetSettingsCard>
      {onParticipantNavigation && (
        <MeetSettingsCard>
          <MeetSettingsToggle
            id={`${id}-navigation`}
            label={settingsT('participant_navigation')}
            hint={settingsT('participant_navigation_hint')}
            checked={participantNavigation !== false}
            onCheckedChange={onParticipantNavigation}
          />
        </MeetSettingsCard>
      )}
    </MeetSettingsStack>
  );
}
