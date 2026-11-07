'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Badge } from '@tuturuuu/ui/badge';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import { useTranslations } from 'next-intl';

interface AccountStatusSectionProps {
  children?: React.ReactNode;
  user: WorkspaceUser | null;
}

export default function AccountStatusSection({
  children,
  user,
}: AccountStatusSectionProps) {
  const t = useTranslations('settings-account');

  return (
    <SettingsSection title={t('account-status')}>
      {children}
      <SettingItemTab title={t('status')}>
        <Badge
          variant="outline"
          className="border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green"
        >
          {t('active')}
        </Badge>
      </SettingItemTab>
      <SettingItemTab title={t('email-verified')}>
        <Badge variant="secondary">{t('verified')}</Badge>
      </SettingItemTab>
      {user?.created_at && (
        <SettingItemTab title={t('member-since')}>
          <span className="text-sm">
            {new Date(user.created_at).toLocaleDateString()}
          </span>
        </SettingItemTab>
      )}
    </SettingsSection>
  );
}
