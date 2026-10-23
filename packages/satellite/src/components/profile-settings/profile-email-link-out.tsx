'use client';

import { ExternalLink } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { buildWebAccountSettingsUrl } from '../account-settings/account-settings-links';

/**
 * Satellite app sessions cannot change the auth email (the app-session client
 * has no provider session), so the email is read-only here and changes happen
 * in the web settings dialog, which owns verification. Never PATCH the email
 * from a satellite.
 */
export function ProfileEmailLinkOut({
  centralUrl,
  email,
}: {
  centralUrl: string;
  email: string | null;
}) {
  const t = useTranslations('satellite-account-settings');
  const settingsT = useTranslations('settings-account');

  return (
    <div className="grid w-full gap-2">
      <div className="flex w-full items-center gap-2">
        <Input
          aria-label={settingsT('email-address')}
          readOnly
          type="email"
          value={email ?? ''}
        />
        <Button asChild className="shrink-0" variant="outline">
          <a
            href={buildWebAccountSettingsUrl(centralUrl, 'profile')}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t('open_in_tuturuuu')}
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {t('email_managed_centrally')}
      </p>
    </div>
  );
}
