import { ContactInformationCard, ProfileInformationCard } from './components';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';

export default async function AccountSettingsPage() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-6">
      <ProfileInformationCard user={user} />
      <ContactInformationCard user={user} />
    </div>
  );
}
