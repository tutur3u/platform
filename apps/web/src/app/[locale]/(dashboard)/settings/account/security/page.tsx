import LinkedIdentitiesCard from './linked-identities-card';
import SecuritySettingsCard from './security-settings-card';
import { createClient } from '@tuturuuu/supabase/next/server';

export default async function SecurityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-6">
      <SecuritySettingsCard user={user} />
      <LinkedIdentitiesCard />
    </div>
  );
}
