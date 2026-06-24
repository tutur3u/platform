'use client';

import { AlertCircle, Bell, CheckCircle2, XCircle } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';

type PermissionState = 'default' | 'denied' | 'granted' | 'unsupported';

function getInitialPermissionState(): PermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  return Notification.permission as PermissionState;
}

export function BrowserNotificationPermission() {
  const t = useTranslations('notifications.settings.browser');
  const [permissionState, setPermissionState] = useState<PermissionState>(() =>
    getInitialPermissionState()
  );
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermissionState('unsupported');
      return;
    }

    const interval = setInterval(() => {
      setPermissionState(Notification.permission as PermissionState);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const requestPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.error(t('unsupported'));
      return;
    }

    setIsRequesting(true);

    try {
      const permission = await Notification.requestPermission();
      setPermissionState(permission as PermissionState);

      if (permission === 'granted') {
        toast.success(t('permission-granted'));
        new Notification(t('test-notification-title'), {
          body: t('test-notification-body'),
          icon: '/icon-192.png',
        });
      } else if (permission === 'denied') {
        toast.error(t('permission-denied'));
      }
    } catch {
      toast.error(t('permission-request-failed'));
    } finally {
      setIsRequesting(false);
    }
  };

  const statusIcon =
    permissionState === 'granted' ? (
      <CheckCircle2 className="h-5 w-5 text-dynamic-green" />
    ) : permissionState === 'denied' ? (
      <XCircle className="h-5 w-5 text-dynamic-red" />
    ) : permissionState === 'unsupported' ? (
      <AlertCircle className="h-5 w-5 text-dynamic-orange" />
    ) : (
      <Bell className="h-5 w-5 text-dynamic-blue" />
    );

  const statusColor =
    permissionState === 'granted'
      ? 'bg-dynamic-green/20'
      : permissionState === 'denied'
        ? 'bg-dynamic-red/20'
        : permissionState === 'unsupported'
          ? 'bg-dynamic-orange/20'
          : 'bg-dynamic-blue/20';

  const statusText = t(
    permissionState === 'granted'
      ? 'status-granted'
      : permissionState === 'denied'
        ? 'status-denied'
        : permissionState === 'unsupported'
          ? 'status-unsupported'
          : 'status-default'
  );

  const helpText = t(
    permissionState === 'granted'
      ? 'help-granted'
      : permissionState === 'denied'
        ? 'help-denied'
        : permissionState === 'unsupported'
          ? 'help-unsupported'
          : 'help-default'
  );

  if (permissionState === 'unsupported') {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4">
        <div className={`rounded-full ${statusColor} p-2`}>{statusIcon}</div>
        <div>
          <h3 className="font-medium text-sm">{t('browser-notifications')}</h3>
          <p className="text-muted-foreground text-xs">{statusText}</p>
          <p className="mt-1 text-muted-foreground text-xs">{helpText}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className={`rounded-full ${statusColor} p-2`}>{statusIcon}</div>
        <div className="flex-1">
          <h3 className="font-medium text-sm">{t('browser-notifications')}</h3>
          <p className="text-muted-foreground text-xs">{statusText}</p>
        </div>
      </div>

      <div className="pl-11">
        <p className="mb-4 text-muted-foreground text-sm">{helpText}</p>
        {permissionState === 'default' ? (
          <Button
            className="w-full sm:w-auto"
            disabled={isRequesting}
            onClick={requestPermission}
          >
            {isRequesting ? t('requesting') : t('enable')}
          </Button>
        ) : null}
        {permissionState === 'denied' ? (
          <div className="rounded-lg bg-destructive/10 p-4">
            <p className="text-destructive text-sm">
              {t('denied-instructions')}
            </p>
          </div>
        ) : null}
        {permissionState === 'granted' ? (
          <div className="rounded-lg bg-dynamic-green/10 p-4">
            <p className="text-dynamic-green text-sm">{t('granted-info')}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
