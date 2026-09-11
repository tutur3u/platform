'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, Laptop, Loader2, RefreshCw } from '@tuturuuu/icons';
import { createMeetCallRealtimeToken } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ComponentProps, useEffect, useState } from 'react';
import { retryStartup, startupErrorKey } from '../lib/startup-error';
import { CallPreparation } from './call-preparation';
import type { ConnectedCallShell as ConnectedCallShellType } from './call-shell';

const loadCallShell = () =>
  import('./call-shell').then((module) => module.ConnectedCallShell);
const ConnectedCallShell = dynamic(loadCallShell, {
  loading: () => <CallPreparation />,
});

export function CallShell(
  props: Omit<
    ComponentProps<typeof ConnectedCallShellType>,
    'token' | 'realtimeUrl'
  >
) {
  const t = useTranslations('meet.call');
  const pathname = usePathname();
  const [deviceId] = useState(() => crypto.randomUUID());
  const [mode, setMode] = useState<'switch' | 'additional' | undefined>();
  // Download media controls alongside the device check, not before first paint.
  useEffect(() => {
    void loadCallShell().catch(() => {});
  }, []);
  const session = useQuery({
    queryKey: ['meet-device-session', props.meetingId, deviceId, mode],
    queryFn: ({ signal }) =>
      createMeetCallRealtimeToken(
        props.meetingId,
        undefined,
        { deviceId, joinMode: mode },
        AbortSignal.any([signal, AbortSignal.timeout(12_000)])
      ),
    retry: (failures, error) =>
      retryStartup(failures, error, mode === 'switch'),
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 2000),
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
  const choice = session.data?.requiresDeviceChoice;
  const errorKey = session.error ? startupErrorKey(session.error) : null;
  return (
    <CallPreparation
      meetingName={props.meetingName}
      leaveHref={props.leaveHref}
      busy={session.isFetching}
      title={t(
        choice
          ? 'device_already_joined'
          : errorKey
            ? 'startup_failed'
            : 'preparing_call'
      )}
      description={t(
        choice ? 'device_choice_hint' : (errorKey ?? 'preparing_call_hint')
      )}
    >
      {choice ? (
        <>
          <Button className="w-full" onClick={() => setMode('switch')}>
            <ArrowRightLeft className="size-4" />
            {t('switch_device')}
          </Button>
          <Button
            className="w-full"
            variant="outline"
            onClick={() => setMode('additional')}
          >
            <Laptop className="size-4" />
            {t('join_another_device')}
          </Button>
          <p className="text-muted-foreground text-xs">
            {t('device_echo_hint')}
          </p>
        </>
      ) : errorKey === 'startup_sign_in' ? (
        <Button asChild className="w-full">
          <Link href={`/login?next=${encodeURIComponent(pathname)}`}>
            {t('startup_sign_in_action')}
          </Link>
        </Button>
      ) : errorKey && errorKey !== 'startup_missing' ? (
        <Button
          className="w-full"
          disabled={session.isFetching}
          onClick={() => void session.refetch()}
        >
          {session.isFetching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {t('connection_refresh')}
        </Button>
      ) : null}
    </CallPreparation>
  );
}
