'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import { useTranslations } from 'next-intl';
import AccountStatusSection from './account/account-status-section';
import UserAvatar from './settings-avatar';
import { UserBanner } from './settings-banner';
import DisplayNameInput from './settings-display-name-input';
import EmailInput from './settings-email-input';
import FullNameInput from './settings-full-name-input';
import UserIdInput from './settings-user-id-input';

export function ProfileSettingsPanel({ user }: { user: WorkspaceUser }) {
  const t = useTranslations();

  return (
    <div className="space-y-8">
      <SettingsSection>
        <SettingItemTab
          title={t('settings-account.avatar')}
          description={t('settings-account.avatar-description')}
        >
          <UserAvatar user={user} />
        </SettingItemTab>
        <SettingItemTab
          layout="stacked"
          title={t('settings-account.banner')}
          description={t('settings-account.banner-description')}
        >
          <UserBanner key={user.id} userId={user.id} />
        </SettingItemTab>
      </SettingsSection>

      <SettingsSection>
        <SettingItemTab
          controlWidth="xl"
          title={t('settings-account.display-name')}
          description={t('settings-account.display-name-description')}
        >
          <DisplayNameInput defaultValue={user.display_name} />
        </SettingItemTab>
        <SettingItemTab
          controlWidth="xl"
          title={t('settings-account.full-name')}
          description={t('settings-account.full-name-description')}
        >
          <FullNameInput defaultValue={user.full_name} />
        </SettingItemTab>
        <SettingItemTab
          controlWidth="xl"
          title="Email"
          description={t('settings-account.email-description')}
        >
          <EmailInput oldEmail={user.email} newEmail={user.new_email} />
        </SettingItemTab>
      </SettingsSection>

      <AccountStatusSection user={user}>
        <SettingItemTab
          controlWidth="2xl"
          title={t('settings-account.user-id')}
          description={t('settings-account.user-id-description')}
        >
          <UserIdInput userId={user.id} />
        </SettingItemTab>
      </AccountStatusSection>
    </div>
  );
}
