'use client';

import { Headphones, Mic, MicOff, Users, Video } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import {
  filterDevicesByKind,
  isAudioOutputSelectionSupported,
} from '../lib/lobby-media';

export interface LobbyParticipant {
  userId: string;
  displayName: string;
  avatarUrl?: string;
}

const METER_BARS = [
  { threshold: 0.06, height: 'h-2' },
  { threshold: 0.2, height: 'h-2.5' },
  { threshold: 0.38, height: 'h-3' },
  { threshold: 0.6, height: 'h-3.5' },
  { threshold: 0.8, height: 'h-4' },
] as const;

const MAX_VISIBLE_AVATARS = 4;

export function LobbyMicMeter({
  audioEnabled,
  level,
}: {
  audioEnabled: boolean;
  level: number;
}) {
  const t = useTranslations('meet.call');
  const clamped = audioEnabled ? Math.min(1, Math.max(0, level)) : 0;
  const percent = Math.round(clamped * 100);

  return (
    <div className="inline-flex h-9 items-center gap-2 rounded-full border border-border/60 bg-background/85 px-3 backdrop-blur-sm">
      <meter
        aria-label={t('lobby_mic_level')}
        className="sr-only"
        max={100}
        min={0}
        value={percent}
      >
        {audioEnabled ? `${percent}%` : t('microphone_muted')}
      </meter>
      {audioEnabled ? (
        <Mic aria-hidden="true" className="size-3.5 text-foreground" />
      ) : (
        <MicOff aria-hidden="true" className="size-3.5 text-dynamic-red" />
      )}
      <div className="flex items-end gap-0.5">
        {METER_BARS.map(({ threshold, height }) => (
          <span
            aria-hidden="true"
            className={cn(
              'w-1 rounded-full motion-safe:transition-colors',
              height,
              audioEnabled && clamped >= threshold
                ? 'bg-dynamic-green'
                : 'bg-foreground/20'
            )}
            key={threshold}
          />
        ))}
      </div>
    </div>
  );
}

export function LobbyDevicePickers({
  devices,
  audioDeviceId,
  videoDeviceId,
  outputDeviceId,
  onAudioDeviceChange,
  onVideoDeviceChange,
  onOutputDeviceChange,
  disabled = false,
}: {
  devices: readonly MediaDeviceInfo[];
  audioDeviceId: string;
  videoDeviceId: string;
  outputDeviceId: string;
  onAudioDeviceChange: (deviceId: string) => void;
  onVideoDeviceChange: (deviceId: string) => void;
  onOutputDeviceChange: (deviceId: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('meet.call');
  const idPrefix = useId();
  const outputSupported = isAudioOutputSelectionSupported();

  const pickers = [
    {
      kind: 'audioinput' as const,
      id: `${idPrefix}-audioinput`,
      Icon: Mic,
      label: t('audio_input'),
      value: audioDeviceId,
      onChange: onAudioDeviceChange,
      supported: true,
    },
    {
      kind: 'videoinput' as const,
      id: `${idPrefix}-videoinput`,
      Icon: Video,
      label: t('video_input'),
      value: videoDeviceId,
      onChange: onVideoDeviceChange,
      supported: true,
    },
    {
      kind: 'audiooutput' as const,
      id: `${idPrefix}-audiooutput`,
      Icon: Headphones,
      label: t('audio_output'),
      value: outputDeviceId,
      onChange: onOutputDeviceChange,
      supported: outputSupported,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {pickers.map(({ kind, id, Icon, label, value, onChange, supported }) => {
        const options = filterDevicesByKind(devices, kind);
        // A selected id missing from the list (unplugged, or not enumerated
        // yet) stays the Select value so choosing "System default" is a real
        // change Radix reports; the trigger still reads "System default".
        const unlisted =
          !!value && !options.some((device) => device.deviceId === value);
        const selectedValue = value || 'default';

        return (
          <div className="min-w-0 space-y-1.5" key={kind}>
            <Label
              className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs"
              htmlFor={id}
            >
              <Icon aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </Label>
            <Select
              disabled={disabled || !supported}
              onValueChange={(next) => onChange(next === 'default' ? '' : next)}
              value={selectedValue}
            >
              <SelectTrigger className="h-9 w-full text-xs" id={id}>
                <SelectValue>
                  {unlisted ? t('system_default') : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">{t('system_default')}</SelectItem>
                {options.map((device, index) => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label || `${label} ${index + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!supported ? (
              <p className="text-[11px] text-muted-foreground leading-snug">
                {t('output_unsupported')}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function LobbyParticipantSummary({
  participants,
  waiting,
  connected,
}: {
  participants: readonly LobbyParticipant[];
  waiting: boolean;
  connected: boolean;
}) {
  const t = useTranslations('meet.call');
  if (waiting) return null;

  if (participants.length === 0) {
    if (!connected) return null;
    return (
      <div className="mt-3 inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1.5 text-muted-foreground text-xs">
        <Users aria-hidden="true" className="size-3.5 shrink-0" />
        <span>{t('lobby_nobody_here')}</span>
      </div>
    );
  }

  const visible = participants.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = participants.length - visible.length;
  const names = visible.map((person) => person.displayName).join(', ');

  return (
    <div className="mt-3 flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
      <div className="flex shrink-0 -space-x-2">
        {visible.map((person) => (
          <Avatar
            className="size-8 ring-2 ring-background"
            key={person.userId}
            title={person.displayName}
          >
            <AvatarImage alt="" src={person.avatarUrl} />
            <AvatarFallback className="font-medium text-xs">
              {person.displayName.trim().slice(0, 1).toUpperCase() || '?'}
            </AvatarFallback>
          </Avatar>
        ))}
        {overflow > 0 ? (
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-full bg-muted font-medium text-muted-foreground text-xs ring-2 ring-background"
          >
            +{overflow}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm">
          {t('lobby_people_inside', { count: participants.length })}
        </p>
        <p className="truncate text-muted-foreground text-xs">
          {overflow > 0
            ? t('lobby_people_names_overflow', { names, count: overflow })
            : names}
        </p>
      </div>
    </div>
  );
}
