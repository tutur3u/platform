'use client';

import { AlertTriangle, ExternalLink, Settings } from '@tuturuuu/icons';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAccountNotificationPreferences } from '@/hooks/useAccountNotificationPreferences';

export default function AccountNotificationStatus() {
  const { data: accountPreferences, isLoading } =
    useAccountNotificationPreferences();
  const t = useTranslations('notifications.settings.account-status');

  // Check if any account-level notifications are enabled
  const hasEnabledNotifications =
    accountPreferences?.some((pref) => pref.enabled) ?? false;

  // Count disabled channels
  const disabledChannels =
    accountPreferences
      ?.filter((pref) => !pref.enabled)
      .map((pref) => pref.channel) ?? [];

  const uniqueDisabledChannels = [...new Set(disabledChannels)];

  if (isLoading) {
    return null; // Don't show anything while loading
  }

  // If all notifications are disabled, show warning
  if (!hasEnabledNotifications) {
    return (
      <Alert
        variant="destructive"
        className="border-dynamic-red/50 bg-dynamic-red/10"
      >
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <div className="flex-1">
            <p className="font-semibold">{t('all-disabled-title')}</p>
            <p className="text-sm">{t('all-disabled-description')}</p>
          </div>
          <Button asChild variant="outline" size="sm" className="ml-4">
            <Link href="/settings/account/notifications">
              <Settings className="mr-2 h-4 w-4" />
              {t('configure-account')}
              <ExternalLink className="ml-2 h-3 w-3" />
            </Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // If some channels are disabled, show info
  if (uniqueDisabledChannels.length > 0) {
    return (
      <Card className="border-dynamic-yellow/50 bg-dynamic-yellow/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-dynamic-yellow/20 p-2">
              <AlertTriangle className="h-4 w-4 text-dynamic-yellow" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-base">
                {t('partial-disabled-title')}
              </CardTitle>
              <CardDescription className="text-sm">
                {t('partial-disabled-description', {
                  channels: uniqueDisabledChannels.join(', '),
                })}
              </CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/settings/account/notifications">
                <Settings className="mr-2 h-4 w-4" />
                {t('view-account')}
                <ExternalLink className="ml-2 h-3 w-3" />
              </Link>
            </Button>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return null; // All enabled, no need to show anything
}
