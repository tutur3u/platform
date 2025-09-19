import { createClient } from '@tuturuuu/supabase/next/server';
import type { Metadata } from 'next';
import LinkedIdentitiesCard from './linked-identities-card';
import SecuritySettingsCard from './security-settings-card';

export const metadata: Metadata = {
  title: 'Security',
  description:
    'Manage Security in the Account area of your Tuturuuu workspace.',
};

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
