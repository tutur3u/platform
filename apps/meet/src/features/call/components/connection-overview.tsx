'use client';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Cloud,
  Laptop,
  Mic,
  Users,
  Video,
  Wifi,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { MediaDiagnostics } from '../lib/media-diagnostics';

export function ConnectionOverview({
  data,
}: {
  data?: MediaDiagnostics | null;
}) {
  const t = useTranslations('meet.call');
  const [samples, setSamples] = useState<number[]>([]);
  useEffect(() => {
    const latency = data?.publisher.roundTripMs ?? data?.subscriber.roundTripMs;
    if (latency != null)
      setSamples((previous) => [...previous.slice(-29), latency]);
  }, [data]);
  const status = (value: string) =>
    t(
      value === 'connected'
        ? 'connection_connected'
        : value === 'not_started'
          ? 'connection_not_started'
          : value === 'connecting' || value === 'new'
            ? 'connection_connecting'
            : 'connection_disconnected'
    );
  const max = Math.max(100, ...samples);
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/20 p-4">
        <fieldset
          className="flex items-center justify-between gap-2"
          aria-label={t('connection_path')}
        >
          {[
            { Icon: Laptop, label: t('you') },
            { Icon: Cloud, label: t('meeting_cloud') },
            { Icon: Users, label: t('in_call') },
          ].map(({ Icon, label }, index) => (
            <div key={label} className="contents">
              {index > 0 && (
                <div
                  aria-hidden
                  className={cn(
                    'h-px flex-1',
                    data?.signaling === 'open'
                      ? 'bg-dynamic-green/50'
                      : 'bg-border'
                  )}
                />
              )}
              <div className="flex min-w-16 flex-col items-center gap-2">
                <span className="grid size-10 place-items-center rounded-xl border bg-background">
                  <Icon className="size-5 text-muted-foreground" />
                </span>
                <span className="text-muted-foreground text-xs">{label}</span>
              </div>
            </div>
          ))}
        </fieldset>
        <div className="mt-4 flex justify-center">
          <Badge variant="outline" className="gap-1.5">
            <Wifi className="size-3" />
            {data?.signaling === 'open'
              ? t('connection_connected')
              : status(data?.signaling ?? 'connecting')}
          </Badge>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['publisher', 'subscriber'] as const).map((direction) => {
          const peer = data?.[direction];
          const Icon = direction === 'publisher' ? ArrowUp : ArrowDown;
          return (
            <section key={direction} className="min-w-0 rounded-xl border p-3">
              <div className="mb-3 flex items-center gap-2">
                <Icon className="size-4" />
                <h3 className="flex-1 font-medium text-sm">
                  {t(direction === 'publisher' ? 'sending' : 'receiving')}
                </h3>
              </div>
              <Badge
                variant="secondary"
                className={cn(
                  peer?.state === 'connected' &&
                    'bg-dynamic-green/10 text-dynamic-green'
                )}
              >
                {status(peer?.state ?? 'not_started')}
              </Badge>
              <div className="mt-3 flex flex-wrap gap-2">
                {(['audio', 'video'] as const).map((kind) => {
                  const streams =
                    peer?.streams.filter((s) => s.kind === kind) ?? [];
                  const MediaIcon = kind === 'audio' ? Mic : Video;
                  return (
                    <span
                      key={kind}
                      className="flex items-center gap-1 text-muted-foreground text-xs tabular-nums"
                      title={t('connection_packets', {
                        count: streams.reduce((sum, s) => sum + s.packets, 0),
                      })}
                    >
                      <MediaIcon className="size-3.5" />
                      {streams
                        .reduce((sum, s) => sum + s.packets, 0)
                        .toLocaleString()}
                    </span>
                  );
                })}
              </div>
              {peer?.statsUnavailable && (
                <p className="mt-2 text-muted-foreground text-xs">
                  {t('connection_stats_unavailable')}
                </p>
              )}
            </section>
          );
        })}
      </div>
      <section className="rounded-xl border p-3">
        <div className="flex items-center gap-2 text-sm">
          <Activity className="size-4" />
          <h3 className="flex-1 font-medium">{t('latency_history')}</h3>
          <span className="font-mono tabular-nums">
            {samples.at(-1) ?? '—'} ms
          </span>
        </div>
        {samples.length > 1 ? (
          <svg
            viewBox="0 0 300 64"
            className="mt-3 h-20 w-full overflow-visible text-primary"
            role="img"
            aria-label={t('latency_history')}
            preserveAspectRatio="none"
          >
            <path
              d="M0 60H300 M0 30H300"
              stroke="currentColor"
              opacity="0.1"
              fill="none"
            />
            <polyline
              points={samples
                .map(
                  (sample, i) =>
                    `${(i * 300) / (samples.length - 1)},${60 - (sample / max) * 56}`
                )
                .join(' ')}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : (
          <p className="py-6 text-muted-foreground text-xs">
            {t('collecting_samples')}
          </p>
        )}
        <p className="text-muted-foreground text-xs">{t('latency_hint')}</p>
      </section>
    </div>
  );
}
