import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import ContactInformationCard from './contact-information-card';
import ProfileInformationCard from './profile-information-card';

export default async function AccountSettingsPage() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-6">
      <ProfileInformationCard user={user} />
      <ContactInformationCard user={user} />
    </div>
  );
}
