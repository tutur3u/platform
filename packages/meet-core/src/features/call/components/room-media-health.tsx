'use client';
import { useQuery } from '@tanstack/react-query';
import { Activity } from '@tuturuuu/icons';
import type { MeetRoomMediaQualitySummary } from '@tuturuuu/realtime/meet';
import { useTranslations } from 'next-intl';
import { MeetSettingsCard } from './meet-settings-card';

type Range = MeetRoomMediaQualitySummary['sendKbps'];

const kbps = (range: Range) =>
  range ? `${range.p50} / ${range.p95} kbps` : '—';
const ms = (range: Range) => (range ? `${Math.round(range.p95)} ms` : '—');
const percent = (range: Range) =>
  range ? `${(range.p95 * 100).toFixed(1)}%` : '—';

/** Anonymous room-wide media health for hosts: rates and counts only. */
export function RoomMediaHealth({
  meetingId,
  read,
}: {
  meetingId: string;
  read: () => Promise<MeetRoomMediaQualitySummary>;
}) {
  const t = useTranslations('meet.call');
  const query = useQuery({
    queryKey: ['meet-room-media-health', meetingId],
    queryFn: read,
    refetchInterval: 15000,
    retry: false,
  });
  const data = query.data;
  return (
    <MeetSettingsCard>
      <div className="flex items-center gap-2">
        <Activity className="size-4" />
        <h3 className="flex-1 font-medium text-sm">{t('room_media_health')}</h3>
      </div>
      {query.isError ? (
        <p role="status" className="text-muted-foreground text-xs">
          {t('room_media_health_unavailable')}
        </p>
      ) : !data ? (
        <p role="status" className="text-muted-foreground text-xs">
          {t('room_media_health_loading')}
        </p>
      ) : !data.reporters ? (
        <p role="status" className="text-muted-foreground text-xs">
          {t('room_media_health_empty')}
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <dt>{t('reporting_devices')}</dt>
          <dd className="text-right tabular-nums">{data.reporters}</dd>
          <dt>{t('media_camera_reporters')}</dt>
          <dd className="text-right tabular-nums">{data.cameraReporters}</dd>
          <dt>{t('media_freeze_reporters')}</dt>
          <dd className="text-right tabular-nums">{data.freezeReporters}</dd>
          <dt>{t('media_send_rate')}</dt>
          <dd className="text-right tabular-nums">{kbps(data.sendKbps)}</dd>
          <dt>{t('media_receive_rate')}</dt>
          <dd className="text-right tabular-nums">
            {kbps(data.recvVideoKbps)}
          </dd>
          <dt>{t('media_loss_p95')}</dt>
          <dd className="text-right tabular-nums">{percent(data.recvLoss)}</dd>
          <dt>{t('media_rtt_p95')}</dt>
          <dd className="text-right tabular-nums">{ms(data.rttMs)}</dd>
          <dt>{t('media_freezes_per_minute')}</dt>
          <dd className="text-right tabular-nums">
            {data.freezesPerMinute === null
              ? '—'
              : data.freezesPerMinute.toFixed(2)}
          </dd>
          <dt>{t('media_layers')}</dt>
          <dd className="text-right tabular-nums">
            {data.layers.high} / {data.layers.mid} / {data.layers.low}
          </dd>
          <dt>{t('media_over_entitlement')}</dt>
          <dd className="text-right tabular-nums">{data.overEntitlement}</dd>
          <dt>{t('media_limited_devices')}</dt>
          <dd className="text-right tabular-nums">
            {t('media_limited_counts', {
              cpu: data.cpuLimited,
              audioOnly: data.audioOnly,
              hidden: data.hidden,
              thumbnails: data.smallMode,
            })}
          </dd>
        </dl>
      )}
    </MeetSettingsCard>
  );
}
