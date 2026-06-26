'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import AccountStatusSection from './account/account-status-section';
import UserAvatar from './settings-avatar';
import DisplayNameInput from './settings-display-name-input';
import EmailInput from './settings-email-input';
import FullNameInput from './settings-full-name-input';
import UserIdInput from './settings-user-id-input';

export function ProfileSettingsPanel({ user }: { user: WorkspaceUser }) {
  const t = useTranslations();

  return (
    <div className="space-y-8">
      <div className="grid gap-6">
        <SettingItemTab
          title={t('settings-account.avatar')}
          description={t('settings-account.avatar-description')}
        >
          <UserAvatar user={user} />
        </SettingItemTab>
        <AccountStatusSection user={user} />
        <Separator />
        <SettingItemTab
          title={t('settings-account.user-id')}
          description={t('settings-account.user-id-description')}
        >
          <UserIdInput userId={user.id} />
        </SettingItemTab>
        <SettingItemTab
          title={t('settings-account.display-name')}
          description={t('settings-account.display-name-description')}
        >
          <DisplayNameInput defaultValue={user.display_name} />
        </SettingItemTab>
        <SettingItemTab
          title={t('settings-account.full-name')}
          description={t('settings-account.full-name-description')}
        >
          <FullNameInput defaultValue={user.full_name} />
        </SettingItemTab>
        <SettingItemTab
          title="Email"
          description={t('settings-account.email-description')}
        >
          <EmailInput oldEmail={user.email} newEmail={user.new_email} />
        </SettingItemTab>
      </div>
    </div>
  );
}
