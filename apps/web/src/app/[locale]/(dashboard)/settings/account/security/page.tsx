import SecuritySettingsCard from './security-settings-card';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';

export default async function SecurityPage() {
  const user = await getCurrentUser();

  return <SecuritySettingsCard user={user} />;
}
