'use client';

import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { AudioProcessing } from '../lib/audio-processing';
import type { MeetRoomController } from '../lib/room-controller';

export function AudioProcessingSettings({
  room,
}: {
  room: MeetRoomController;
}) {
  const t = useTranslations('meet.call');
  const [settings, setSettings] = useState(room.getAudioProcessing);
  const [busy, setBusy] = useState(false);
  const actual = room.getAudioProcessingSettings();
  const supported =
    typeof navigator === 'undefined'
      ? {}
      : (navigator.mediaDevices?.getSupportedConstraints?.() ?? {});
  const options = [
    ['echoCancellation', 'audio_echo_cancellation'],
    ['noiseSuppression', 'audio_noise_suppression'],
    ['autoGainControl', 'audio_auto_gain'],
  ] as const;
  const update = async (key: keyof AudioProcessing, value: boolean) => {
    setBusy(true);
    try {
      const next = { ...settings, [key]: value };
      await room.setAudioProcessing(next);
      setSettings(next);
    } catch {
      toast.error(t('audio_processing_failed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 rounded-lg border p-3">
      <h3 className="font-medium text-sm">{t('audio_processing')}</h3>
      <p className="text-muted-foreground text-xs">
        {t('audio_processing_hint')}
      </p>
      {options.map(([key, label]) => (
        <div key={key} className="flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <Label htmlFor={`meet-${key}`}>{t(label)}</Label>
            <p className="text-muted-foreground text-xs">
              {t(
                !supported[key]
                  ? 'audio_processing_unsupported'
                  : actual?.[key] === true ||
                      (key === 'echoCancellation' &&
                        ['all', 'remote-only'].includes(String(actual?.[key])))
                    ? 'audio_processing_active'
                    : actual?.[key] === false
                      ? 'audio_processing_inactive'
                      : 'audio_processing_unverified'
              )}
            </p>
          </div>
          <Switch
            id={`meet-${key}`}
            checked={settings[key]}
            disabled={busy || !supported[key]}
            onCheckedChange={(value) => void update(key, value)}
          />
        </div>
      ))}
      <p className="text-muted-foreground text-xs">{t('audio_echo_help')}</p>
    </section>
  );
}
