import ChallengeCard from './challengeCard';
import { getChallenges } from './challenges';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function ChallengesPage({ params }: Props) {
  const database = await createClient();
  const {
    data: { user },
  } = await database.auth.getUser();
  const { wsId } = await params;
  if (!user?.id) {
    redirect('/login');
  }

  const challenges = getChallenges();

  return (
    <div className="container mx-auto p-6">
      <h1 className="mb-6 text-3xl font-bold">Prompt Engineering Challenges</h1>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {challenges.map((challenge) => (
          <ChallengeCard
            key={challenge.id}
            wsId={wsId}
            challenge={challenge}
          ></ChallengeCard>
        ))}
      </div>
    </div>
  );
}
