import MFACard from './mfa-card';
import SecuritySettingsCard from './security-settings-card';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';

export default async function SecurityPage() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-6">
      <MFACard user={user} />
      <SecuritySettingsCard user={user} />
    </div>
  );
}
