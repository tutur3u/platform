'use client';
import { useQuery } from '@tanstack/react-query';
import { Headphones, Mic, RefreshCw, Video } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { MeetRoomController } from '../lib/room-controller';

export function DeviceSettings({
  room,
  outputDeviceId,
  onOutput,
}: {
  room: MeetRoomController;
  outputDeviceId: string;
  onOutput: (id: string) => void;
}) {
  const t = useTranslations('meet.call');
  const [selected, setSelected] = useState(() => {
    const devices = room.getSelectedDevices();
    return {
      audio: devices.audio || 'default',
      video: devices.video || 'default',
    };
  });
  const [busy, setBusy] = useState(false);
  const [bandwidth, setBandwidth] = useState(room.getBandwidthMode);
  const devices = useQuery({
    queryKey: ['meet-devices'],
    queryFn: () => navigator.mediaDevices.enumerateDevices(),
    retry: false,
    gcTime: 0,
  });
  useEffect(() => {
    const refresh = () => void devices.refetch();
    navigator.mediaDevices?.addEventListener('devicechange', refresh);
    return () =>
      navigator.mediaDevices?.removeEventListener('devicechange', refresh);
  }, [devices.refetch]);
  return (
    <div className="space-y-5">
      {[
        {
          kind: 'audioinput',
          key: 'audio',
          Icon: Mic,
          label: t('audio_input'),
        },
        {
          kind: 'videoinput',
          key: 'video',
          Icon: Video,
          label: t('video_input'),
        },
        {
          kind: 'audiooutput',
          key: 'output',
          Icon: Headphones,
          label: t('audio_output'),
        },
      ].map(({ kind, key, Icon, label }) => {
        const supported =
          key !== 'output' ||
          (typeof HTMLMediaElement !== 'undefined' &&
            'setSinkId' in HTMLMediaElement.prototype);
        return (
          <div key={kind} className="space-y-2">
            <Label htmlFor={`meet-${kind}`} className="flex items-center gap-2">
              <Icon className="size-4" />
              {label}
            </Label>
            <Select
              value={
                key === 'output'
                  ? outputDeviceId || 'default'
                  : selected[key as 'audio' | 'video']
              }
              disabled={busy || !supported}
              onValueChange={async (value) => {
                setBusy(true);
                try {
                  if (key === 'output')
                    onOutput(value === 'default' ? '' : value);
                  else {
                    await room.selectDevice(
                      key as 'audio' | 'video',
                      value === 'default' ? '' : value
                    );
                    setSelected((previous) => ({ ...previous, [key]: value }));
                  }
                } catch {
                  toast.error(t('device_change_failed'));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <SelectTrigger id={`meet-${kind}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">{t('system_default')}</SelectItem>
                {devices.data
                  ?.filter(
                    (d) =>
                      d.kind === kind && d.deviceId && d.deviceId !== 'default'
                  )
                  .map((d, index) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label || `${label} ${index + 1}`}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {!supported && (
              <p className="text-muted-foreground text-xs">
                {t('output_unsupported')}
              </p>
            )}
          </div>
        );
      })}
      <div className="space-y-2">
        <Label htmlFor="meet-bandwidth">{t('bandwidth')}</Label>
        <Select
          value={bandwidth}
          onValueChange={(value) => {
            if (value !== 'auto' && value !== 'saver' && value !== 'quality')
              return;
            setBandwidth(value);
            room.setBandwidthMode(value as 'auto' | 'saver' | 'quality');
          }}
        >
          <SelectTrigger id="meet-bandwidth" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{t('bandwidth_auto')}</SelectItem>
            <SelectItem value="saver">{t('bandwidth_saver')}</SelectItem>
            <SelectItem value="quality">{t('bandwidth_quality')}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">{t('bandwidth_hint')}</p>
      </div>
      <p className="text-muted-foreground text-xs">
        {t('device_settings_hint')}
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={devices.isFetching}
        onClick={() => void devices.refetch()}
      >
        <RefreshCw className="size-4" />
        {t('refresh_devices')}
      </Button>
    </div>
  );
}
