'use client';

import { Check, ExternalLink, ShieldCheck } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { buildWebAccountSettingsUrl } from './account-settings-links';
import type { WebManagedAccountTabId } from './account-settings-navigation';

const TAB_FEATURE_KEYS: Record<WebManagedAccountTabId, readonly string[]> = {
  accounts: ['accounts_switch', 'accounts_add', 'accounts_remove'],
  security: [
    'security_password',
    'security_two_factor',
    'security_passkeys',
    'security_linked_identities',
  ],
  sessions: ['sessions_devices', 'sessions_revoke'],
};

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
    <div className="grid gap-4 rounded-xl border bg-card/40 p-4 md:p-6">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-dynamic-green" />
        <div className="space-y-1">
          <p className="font-medium">{t('managed_centrally_title')}</p>
          <p className="text-muted-foreground text-sm">
            {t('managed_centrally_description', { section: t(tab) })}
          </p>
          {signedInEmail && (
            <p className="text-muted-foreground text-sm">
              {t('signed_in_as', { email: signedInEmail })}
            </p>
          )}
        </div>
      </div>
      <ul className="grid gap-2 text-sm">
        {TAB_FEATURE_KEYS[tab].map((key) => (
          <li className="flex items-center gap-2" key={key}>
            <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>{t(key)}</span>
          </li>
        ))}
      </ul>
      <div>
        <Button asChild>
          <a href={href} rel="noopener noreferrer" target="_blank">
            {t('open_in_tuturuuu')}
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </div>
    </div>
  );
}
