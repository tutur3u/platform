'use client';

import { Bell } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

const STATUS_BADGE_CLASS: Record<PermissionState, string> = {
  granted: 'border-dynamic-green/30 text-dynamic-green',
  denied: 'border-dynamic-red/30 text-dynamic-red',
  unsupported: 'border-dynamic-yellow/30 text-dynamic-yellow',
  default: '',
};

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

  return (
    <SettingsSection>
      <SettingItemTab
        title={t('browser-notifications')}
        description={getHelpText()}
        icon={<Bell className="h-4 w-4" />}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Badge
            variant="outline"
            className={STATUS_BADGE_CLASS[permissionState]}
          >
            {getStatusText()}
          </Badge>
          {permissionState === 'default' && (
            <Button onClick={requestPermission} disabled={isRequesting}>
              {isRequesting ? t('requesting') : t('enable')}
            </Button>
          )}
        </div>
      </SettingItemTab>

      {permissionState === 'denied' && (
        <SettingsSectionMessage className="py-3">
          {t('denied-instructions')}
        </SettingsSectionMessage>
      )}

      {permissionState === 'granted' && (
        <SettingsSectionMessage className="py-3">
          {t('granted-info')}
        </SettingsSectionMessage>
      )}
    </SettingsSection>
  );
}
