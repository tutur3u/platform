import ChallengeCard from './challengeCard';
import CreateChallengeDialog from './createChallengeDialog';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { NovaChallenge } from '@tuturuuu/types/db';

export default async function ChallengesPage() {
  const challenges = await fetchChallenges();

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Prompt Engineering Challenges</h1>
        <CreateChallengeDialog />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {challenges.length > 0 ? (
          challenges.map((challenge) => (
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
