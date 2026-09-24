'use client';

import { Volume2 } from '@tuturuuu/icons';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { useTranslations } from 'next-intl';
import { createContext, type ReactNode, useContext, useState } from 'react';

export const MIRA_VOLUME_ID = 'mira';
const PlaybackVolumeContext = createContext({
  master: 100,
  levels: {} as Record<string, number>,
  setMaster: (_value: number) => {},
  setLevel: (_id: string, _value: number) => {},
});
export function clampVolume(value: number) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 100;
}
export function PlaybackVolumeProvider({ children }: { children: ReactNode }) {
  const [master, setMaster] = useState(100);
  const [levels, setLevels] = useState<Record<string, number>>({});
  return (
    <PlaybackVolumeContext
      value={{
        master,
        levels,
        setMaster: (value) => setMaster(clampVolume(value)),
        setLevel: (id, value) =>
          setLevels((previous) => ({ ...previous, [id]: clampVolume(value) })),
      }}
    >
      {children}
    </PlaybackVolumeContext>
  );
}
export function usePlaybackVolume(id?: string) {
  const { master, levels } = useContext(PlaybackVolumeContext);
  return (master / 100) * (id ? (levels[id] ?? 100) / 100 : 1);
}
function VolumeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{label}</span>
        <span className="text-muted-foreground tabular-nums">{value}%</span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={0}
        max={100}
        step={1}
        value={value}
        className="h-6 w-full cursor-pointer accent-primary"
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
export function PlaybackVolumeControl({
  participants,
  selfUserId,
}: {
  participants: MeetRealtimePresence[];
  selfUserId: string | null;
}) {
  const t = useTranslations('meet.call');
  const volume = useContext(PlaybackVolumeContext);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 rounded-full"
          aria-label={t('playback_volume')}
        >
          <Volume2 className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 max-w-[calc(100vw-2rem)] space-y-4"
      >
        <div>
          <h2 className="font-semibold text-sm">{t('playback_volume')}</h2>
          <p className="mt-1 text-muted-foreground text-xs">
            {t('playback_volume_hint')}
          </p>
        </div>
        <VolumeSlider
          label={t('master_volume')}
          value={volume.master}
          onChange={volume.setMaster}
        />
        <div className="max-h-64 space-y-4 overflow-y-auto border-t pt-4 pb-1">
          <VolumeSlider
            label={t('mira_volume')}
            value={volume.levels[MIRA_VOLUME_ID] ?? 100}
            onChange={(next) => volume.setLevel(MIRA_VOLUME_ID, next)}
          />
          {participants
            .filter((person) => person.userId !== selfUserId)
            .map((person) => (
              <VolumeSlider
                key={person.userId}
                label={t('participant_volume', { name: person.displayName })}
                value={volume.levels[person.userId] ?? 100}
                onChange={(next) => volume.setLevel(person.userId, next)}
              />
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
