'use client';

import { Check, ExternalLink, ShieldCheck } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionBlock,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
import { useTranslations } from 'next-intl';
import { buildWebAccountSettingsUrl } from './account-settings-links';
import type { WebManagedAccountTabId } from './account-settings-navigation';

type AccountSettingsTranslator = ReturnType<
  typeof useTranslations<'satellite-account-settings'>
>;

// Literal keys keep every rendered string visible to the i18n key inventory.
function tabLabel(t: AccountSettingsTranslator, tab: WebManagedAccountTabId) {
  switch (tab) {
    case 'accounts':
      return t('accounts');
    case 'security':
      return t('security');
    case 'sessions':
      return t('sessions');
  }
}

function tabFeatures(
  t: AccountSettingsTranslator,
  tab: WebManagedAccountTabId
): readonly string[] {
  switch (tab) {
    case 'accounts':
      return [t('accounts_switch'), t('accounts_add'), t('accounts_remove')];
    case 'security':
      return [
        t('security_password'),
        t('security_two_factor'),
        t('security_passkeys'),
        t('security_linked_identities'),
      ];
    case 'sessions':
      return [t('sessions_devices'), t('sessions_revoke')];
  }
}

/**
 * Sensitive account changes (password, 2FA, passkeys, identity linking,
 * session revocation) stay in apps/web, which owns re-authentication and the
 * WebAuthn relying party. Satellites open that same tab instead of proxying.
 */
export function AccountSettingsLinkOut({
  centralUrl,
  signedInEmail,
  tab,
}: {
  centralUrl: string;
  signedInEmail?: string | null;
  tab: WebManagedAccountTabId;
}) {
  const t = useTranslations('satellite-account-settings');
  const href = buildWebAccountSettingsUrl(centralUrl, tab);

  return (
    <div className="space-y-8">
      <SettingsSection>
        <SettingItemTab
          description={t('managed_centrally_description', {
            section: tabLabel(t, tab),
          })}
          icon={<ShieldCheck className="size-4" />}
          title={t('managed_centrally_title')}
        >
          <Button asChild>
            <a href={href} rel="noopener noreferrer" target="_blank">
              {t('open_in_tuturuuu')}
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </SettingItemTab>
        <SettingsSectionBlock>
          <ul className="grid gap-2 text-sm">
            {tabFeatures(t, tab).map((feature) => (
              <li className="flex items-center gap-2" key={feature}>
                <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </SettingsSectionBlock>
        {signedInEmail && (
          <SettingsSectionMessage className="py-4">
            {t('signed_in_as', { email: signedInEmail })}
          </SettingsSectionMessage>
        )}
      </SettingsSection>
    </div>
  );
}
