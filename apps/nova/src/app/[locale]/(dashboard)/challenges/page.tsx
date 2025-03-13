import ChallengeCard from './challengeCard';
import CreateChallengeDialog from './createChallengeDialog';
import LoadingChallenges from './loading';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { NovaChallenge } from '@tuturuuu/types/db';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

export default async function ChallengesPage() {
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();
  const t = await getTranslations('nova');

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) redirect('/login');

  const { data: whitelisted } = await sbAdmin
    .from('nova_roles')
    .select('enabled, is_admin')
    .eq('email', user?.email as string)
    .maybeSingle();

  const isAdmin = whitelisted?.enabled && whitelisted?.is_admin;

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          {t('prompt-engineering-challenges')}
        </h1>
        {isAdmin && <CreateChallengeDialog />}
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Suspense fallback={<LoadingChallenges />}>
          <ChallengesList isAdmin={isAdmin || false} />
        </Suspense>
      </div>
    </div>
  );
}

async function ChallengesList({ isAdmin }: { isAdmin: boolean }) {
  const challenges = await fetchChallenges();

  return challenges.length > 0 ? (
    challenges.map((challenge) => (
      <ChallengeCard
        isAdmin={isAdmin}
        key={challenge.id}
        challenge={challenge}
      />
    ))
  ) : (
    <div className="col-span-full text-center">
      <p className="text-gray-500">No challenges available.</p>
    </div>
  );
}

async function fetchChallenges(): Promise<NovaChallenge[]> {
  const supabase = await createClient();

  try {
    const { data: challenges, error } = await supabase
      .from('nova_challenges')
      .select('*')
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
