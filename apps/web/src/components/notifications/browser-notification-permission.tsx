'use client';

import { AlertCircle, Bell, CheckCircle2, XCircle } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export default function BrowserNotificationPermission() {
  const t = useTranslations('notifications.settings.browser');
  const [permissionState, setPermissionState] =
    useState<PermissionState>('default');
  const [isRequesting, setIsRequesting] = useState(false);

  // Check current permission state
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermissionState('unsupported');
      return;
    }

    const checkPermission = () => {
      setPermissionState(
        Notification.permission as 'granted' | 'denied' | 'default'
      );
    };

    checkPermission();

    // Listen for permission changes
    const interval = setInterval(checkPermission, 1000);
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
      setPermissionState(permission as 'granted' | 'denied' | 'default');

      if (permission === 'granted') {
        toast.success(t('permission-granted'));
        // Send a test notification
        new Notification(t('test-notification-title'), {
          body: t('test-notification-body'),
          icon: '/icon-192.png', // Update with your app icon
        });
      } else if (permission === 'denied') {
        toast.error(t('permission-denied'));
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      toast.error(t('permission-request-failed'));
    } finally {
      setIsRequesting(false);
    }
  };

  const getStatusIcon = () => {
    switch (permissionState) {
      case 'granted':
        return <CheckCircle2 className="h-5 w-5 text-dynamic-green" />;
      case 'denied':
        return <XCircle className="h-5 w-5 text-dynamic-red" />;
      case 'unsupported':
        return <AlertCircle className="h-5 w-5 text-dynamic-orange" />;
      default:
        return <Bell className="h-5 w-5 text-dynamic-blue" />;
    }
  };

  const getStatusColor = () => {
    switch (permissionState) {
      case 'granted':
        return 'bg-dynamic-green/20';
      case 'denied':
        return 'bg-dynamic-red/20';
      case 'unsupported':
        return 'bg-dynamic-orange/20';
      default:
        return 'bg-dynamic-blue/20';
    }
  };

  const getStatusText = () => {
    switch (permissionState) {
      case 'granted':
        return t('status-granted');
      case 'denied':
        return t('status-denied');
      case 'unsupported':
        return t('status-unsupported');
      default:
        return t('status-default');
    }
  };

  const getHelpText = () => {
    switch (permissionState) {
      case 'granted':
        return t('help-granted');
      case 'denied':
        return t('help-denied');
      case 'unsupported':
        return t('help-unsupported');
      default:
        return t('help-default');
    }
  };

  if (permissionState === 'unsupported') {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4">
        <div className={`rounded-full ${getStatusColor()} p-2`}>
          {getStatusIcon()}
        </div>
        <div>
          <h3 className="font-medium text-sm">{t('browser-notifications')}</h3>
          <p className="text-muted-foreground text-xs">{getStatusText()}</p>
          <p className="mt-1 text-muted-foreground text-xs">{getHelpText()}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className={`rounded-full ${getStatusColor()} p-2`}>
          {getStatusIcon()}
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-sm">{t('browser-notifications')}</h3>
          <p className="text-muted-foreground text-xs">{getStatusText()}</p>
        </div>
      </div>

      <div className="pl-11">
        <p className="mb-4 text-muted-foreground text-sm">{getHelpText()}</p>

        {permissionState === 'default' && (
          <Button
            onClick={requestPermission}
            disabled={isRequesting}
            className="w-full sm:w-auto"
          >
            {isRequesting ? t('requesting') : t('enable')}
          </Button>
        )}

        {permissionState === 'denied' && (
          <div className="rounded-lg bg-destructive/10 p-4">
            <p className="text-destructive text-sm">
              {t('denied-instructions')}
            </p>
          </div>
        )}

        {permissionState === 'granted' && (
          <div className="rounded-lg bg-dynamic-green/10 p-4">
            <p className="text-dynamic-green text-sm">{t('granted-info')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
