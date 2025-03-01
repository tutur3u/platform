import ChallengeCard from './challengeCard';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { NovaChallenge } from '@tuturuuu/types/db';
import { redirect } from 'next/navigation';

export default async function ChallengesPage() {
  const database = await createClient();
  const {
    data: { user },
  } = await database.auth.getUser();

  if (!user?.id) {
    redirect('/login');
  }

  const challenges = await fetchChallenges();

  return (
    <div className="container mx-auto p-6">
      <h1 className="mb-6 text-3xl font-bold">Prompt Engineering Challenges</h1>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {challenges.length > 0 ? (
          challenges.map((challenge: NovaChallenge) => (
            <ChallengeCard key={challenge.id} challenge={challenge} />
          ))
        ) : (
          <p className="text-gray-500">No challenges available.</p>
        )}
      </div>
    </div>
  );
}

async function fetchChallenges(): Promise<NovaChallenge[]> {
  const supabase = await createClient();

  try {
    const { data: challenges, error } = await supabase
      .from('nova_challenges')
      .select('*');

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
