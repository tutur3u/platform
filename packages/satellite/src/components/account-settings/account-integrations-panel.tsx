'use client';

import { CalendarDays, ExternalLink, Mail } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import {
  type IntegrationDestination,
  resolveIntegrationDestinationUrl,
  UPSKII_LOGO_PATH,
} from '@tuturuuu/utils/integrations-catalog';
import { useLocale, useTranslations } from 'next-intl';
import { UpskiiLinkAction, useUpskiiLinkedEmail } from './upskii-link-row';

function webOrigin(centralUrl?: string) {
  if (!centralUrl) return '';
  try {
    return new URL(centralUrl).origin;
  } catch {
    return '';
  }
}

function ManageLink({
  destination,
  label,
}: {
  destination: Exclude<IntegrationDestination, 'account_integrations'>;
  label: string;
}) {
  const t = useTranslations('account-integrations');
  const locale = useLocale();
  const href = resolveIntegrationDestinationUrl(destination, { locale });
  if (!href) return null;

  return (
    <Button asChild size="sm" variant="outline">
      <a
        aria-label={t('manage_label', { name: label })}
        href={href}
        rel="noopener noreferrer"
        target="_blank"
      >
        {t('manage')}
        <ExternalLink aria-hidden="true" className="size-3.5" />
      </a>
    </Button>
  );
}

/**
 * Account-level integrations. Each row hands off to the panel that already
 * owns the connection (Calendar's integrations tab, Mail settings) instead of
 * duplicating its connect flow.
 */
export function AccountIntegrationsPanel({
  centralUrl,
}: {
  /** Web origin serving the catalog and the official marks; relative if unset. */
  centralUrl?: string;
}) {
  const t = useTranslations('account-integrations');
  const upskiiEmail = useUpskiiLinkedEmail();
  const origin = webOrigin(centralUrl);
  const calendar = t('calendar');
  const mail = t('mail');

  return (
    <div className="space-y-4">
      <SettingsSection>
        <SettingItemTab
          description={
            upskiiEmail
              ? t('upskii_linked_as', { email: upskiiEmail })
              : t('upskii_description')
          }
          icon={
            <img
              alt=""
              className="size-4 rounded-sm"
              height={16}
              src={`${origin}${UPSKII_LOGO_PATH}`}
              width={16}
            />
          }
          layout="compact"
          title={t('upskii')}
        >
          <UpskiiLinkAction />
        </SettingItemTab>
        <SettingItemTab
          description={t('calendar_description')}
          icon={<CalendarDays aria-hidden="true" className="size-4" />}
          layout="compact"
          title={calendar}
        >
          <ManageLink destination="calendar" label={calendar} />
        </SettingItemTab>
        <SettingItemTab
          description={t('mail_description')}
          icon={<Mail aria-hidden="true" className="size-4" />}
          layout="compact"
          title={mail}
        >
          <ManageLink destination="mail" label={mail} />
        </SettingItemTab>
      </SettingsSection>
      <Button asChild className="px-0" variant="link">
        <a
          href={`${origin}/integrations`}
          rel="noopener noreferrer"
          target="_blank"
        >
          {t('browse_all')}
          <ExternalLink aria-hidden="true" className="size-3.5" />
        </a>
      </Button>
    </div>
  );
}
