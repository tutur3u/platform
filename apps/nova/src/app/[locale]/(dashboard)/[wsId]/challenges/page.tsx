import ChallengeCard from './challengeCard';
import { createClient } from '@tuturuuu/supabase/next/client';
import { redirect } from 'next/navigation';

interface Props {
  params: {
    wsId: string;
  };
}

interface Challenge {
  id: string;
  title: string;
  topic: string;
  description: string;
  created_at: string;
}

export default async function ChallengesPage({ params }: Props) {
  const challenges = await fetchChallenges();
  const { wsId } = await params;
  // If the user is unauthorized, redirect them to login
  if (!challenges) {
    redirect('/login');
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="mb-6 text-3xl font-bold">Prompt Engineering Challenges</h1>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {challenges?.length > 0 ? (
          challenges.map((challenge: Challenge) => (
            <ChallengeCard
              key={challenge.id}
              wsId={wsId}
              challenge={challenge}
            />
          ))
        ) : (
          <p className="text-gray-500">No challenges available.</p>
        )}
      </div>
    </div>
  );
}

async function fetchChallenges(): Promise<Challenge[] | null> {
  const supabase = createClient();

  try {
    // Fetch challenges from nova_challenges table
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
