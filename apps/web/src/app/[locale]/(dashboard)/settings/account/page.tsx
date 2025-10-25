import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import type { Metadata } from 'next';
import ContactInformationCard from './contact-information-card';
import PreferencesCard from './preferences-card';
import ProfileInformationCard from './profile-information-card';

export const metadata: Metadata = {
  title: 'Account',
  description:
    'Manage Account in the Settings area of your Tuturuuu workspace.',
};

export default async function AccountSettingsPage() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-6">
      <ProfileInformationCard user={user} />
      <ContactInformationCard user={user} />
      <PreferencesCard user={user} />
    </div>
  );
}
