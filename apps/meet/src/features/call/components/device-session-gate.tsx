'use client';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  Laptop,
  Loader2,
  MonitorSmartphone,
} from '@tuturuuu/icons';
import { createMeetCallRealtimeToken } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { type ComponentProps, useState } from 'react';
import { ConnectedCallShell } from './call-shell';

export function CallShell(
  props: Omit<
    ComponentProps<typeof ConnectedCallShell>,
    'token' | 'realtimeUrl'
  >
) {
  const t = useTranslations('meet.call');
  const [deviceId] = useState(() => crypto.randomUUID());
  const [mode, setMode] = useState<'switch' | 'additional' | undefined>();
  const session = useQuery({
    queryKey: ['meet-device-session', props.meetingId, deviceId, mode],
    queryFn: () =>
      createMeetCallRealtimeToken(props.meetingId, undefined, {
        deviceId,
        joinMode: mode,
      }),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    gcTime: 0,
  });
  if (session.data?.token && !session.data.requiresDeviceChoice)
    return (
      <ConnectedCallShell
        {...props}
        token={session.data.token}
        realtimeUrl={session.data.realtimeUrl}
        deviceId={deviceId}
      />
    );
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-5">
      <section className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-6 shadow-lg">
        <div className="grid size-12 place-items-center rounded-xl bg-muted">
          <MonitorSmartphone className="size-6" />
        </div>
        <h1 className="font-semibold text-xl">
          {t(
            session.data?.requiresDeviceChoice
              ? 'device_already_joined'
              : 'preparing_call'
          )}
        </h1>
        {session.data?.requiresDeviceChoice ? (
          <>
            <p className="text-muted-foreground text-sm">
              {t('device_choice_hint')}
            </p>
            <div className="grid gap-3">
              <Button onClick={() => setMode('switch')}>
                <ArrowRightLeft className="size-4" />
                {t('switch_device')}
              </Button>
              <Button variant="outline" onClick={() => setMode('additional')}>
                <Laptop className="size-4" />
                {t('join_another_device')}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              {t('device_echo_hint')}
            </p>
          </>
        ) : session.error ? (
          <>
            <p role="alert" className="text-destructive text-sm">
              {t('signaling_unreachable')}
            </p>
            <Button onClick={() => void session.refetch()}>
              {t('connection_refresh')}
            </Button>
          </>
        ) : (
          <Loader2
            aria-label={t('preparing_call')}
            className="size-5 animate-spin text-muted-foreground"
          />
        )}
        <Button variant="ghost" asChild>
          <a href={props.leaveHref}>{t('leave')}</a>
        </Button>
      </section>
    </main>
  );
}
