'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { AccountProfilePanel } from '@tuturuuu/ui/custom/account-profile-panel';
import { resolveProfileNamePlaceholders } from '@tuturuuu/utils/name-helper';
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
  const namePlaceholders = resolveProfileNamePlaceholders(user);

  return (
    <AccountProfilePanel
      controlWidth="xl"
      avatar={{
        title: t('settings-account.avatar'),
        description: t('settings-account.avatar-description'),
        control: <UserAvatar user={user} />,
      }}
      banner={{
        title: t('settings-account.banner'),
        description: t('settings-account.banner-description'),
        control: <UserBanner key={user.id} userId={user.id} />,
      }}
      displayName={{
        title: t('settings-account.display-name'),
        description: t('settings-account.display-name-description'),
        control: (
          <DisplayNameInput
            defaultValue={user.display_name}
            placeholder={namePlaceholders.displayName}
          />
        ),
      }}
      fullName={{
        title: t('settings-account.full-name'),
        description: t('settings-account.full-name-description'),
        control: (
          <FullNameInput
            defaultValue={user.full_name}
            placeholder={namePlaceholders.fullName}
          />
        ),
      }}
      email={{
        title: t('settings-account.email-address'),
        description: t('settings-account.email-description'),
        control: <EmailInput oldEmail={user.email} newEmail={user.new_email} />,
      }}
      accountSection={
        <AccountStatusSection user={user}>
          <SettingItemTab
            controlWidth="2xl"
            title={t('settings-account.user-id')}
            description={t('settings-account.user-id-description')}
          >
            <UserIdInput userId={user.id} />
          </SettingItemTab>
        </AccountStatusSection>
      }
    />
  );
}
