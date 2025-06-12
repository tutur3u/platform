import { LinkedIdentitiesCard, SecuritySettingsCard } from '../components';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';

export default async function SecurityPage() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-6">
      <SecuritySettingsCard user={user} />
      <LinkedIdentitiesCard />
    </div>
  );
}
