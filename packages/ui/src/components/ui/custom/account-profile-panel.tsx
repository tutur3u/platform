import type { ReactNode } from 'react';
import { SettingItemTab } from './settings-item-tab';
import { SettingsSection } from './settings-section';

export interface AccountProfileField {
  title: ReactNode;
  description?: ReactNode;
  control: ReactNode;
}

interface AccountProfilePanelProps {
  avatar: AccountProfileField;
  banner?: AccountProfileField;
  displayName: AccountProfileField;
  fullName: AccountProfileField;
  email: AccountProfileField;
  accountSection: ReactNode;
  controlWidth?: 'xl' | '2xl';
}

export function AccountProfilePanel({
  avatar,
  banner,
  displayName,
  fullName,
  email,
  accountSection,
  controlWidth = '2xl',
}: AccountProfilePanelProps) {
  return (
    <div className="space-y-8">
      <SettingsSection>
        <SettingItemTab title={avatar.title} description={avatar.description}>
          {avatar.control}
        </SettingItemTab>
        {banner && (
          <SettingItemTab
            layout="stacked"
            title={banner.title}
            description={banner.description}
          >
            {banner.control}
          </SettingItemTab>
        )}
      </SettingsSection>
      <SettingsSection>
        <SettingItemTab
          controlWidth={controlWidth}
          title={displayName.title}
          description={displayName.description}
        >
          {displayName.control}
        </SettingItemTab>
        <SettingItemTab
          controlWidth={controlWidth}
          title={fullName.title}
          description={fullName.description}
        >
          {fullName.control}
        </SettingItemTab>
        <SettingItemTab
          controlWidth={controlWidth}
          title={email.title}
          description={email.description}
        >
          {email.control}
        </SettingItemTab>
      </SettingsSection>
      {accountSection}
    </div>
  );
}
