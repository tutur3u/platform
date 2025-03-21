import ChallengesList from './ChallengesList';
import CreateChallengeDialog from './createChallengeDialog';
import LoadingChallenges from './loading';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

async function fetchChallenges() {
  const supabase = await createClient();

  try {
    const { data: challenges, error } = await supabase
      .from('nova_challenges')
      .select('*, criteria:nova_challenge_criteria(*)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching challenges:', error.message);
      return [];
    }

    return challenges;
  } catch (error) {
    console.error('Unexpected error fetching challenges:', error);
    return [];
  }
}

export default async function Page() {
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();
  const t = await getTranslations('nova');

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) redirect('/login');

  const { data: whitelisted } = await sbAdmin
    .from('nova_roles')
    .select('enabled, allow_challenge_management')
    .eq('email', user?.email as string)
    .maybeSingle();

  const isAdmin = Boolean(
    whitelisted?.enabled && whitelisted?.allow_challenge_management
  );

  // Fetch initial challenges for SSR (will be replaced by client fetch later)
  const initialChallenges = await fetchChallenges();

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <h1 className="text-3xl font-bold">
          {t('prompt-engineering-challenges')}
        </h1>
        {isAdmin && (
          <CreateChallengeDialog
            trigger={
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                {t('create-challenge')}
              </Button>
            }
          />
        )}
      </div>

      <Suspense fallback={<LoadingChallenges />}>
        <ChallengesList
          initialChallenges={initialChallenges}
          isAdmin={isAdmin}
        />
      </Suspense>
    </div>
  );
}
