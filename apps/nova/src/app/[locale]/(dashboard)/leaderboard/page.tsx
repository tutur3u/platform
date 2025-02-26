import { Leaderboard } from '@/components/leaderboard/leaderboard';
import { TopThreeCards } from '@/components/leaderboard/top-three-cards';
import { getLeaderboardData } from '@/lib/leaderboard';
import { createClient } from '@tuturuuu/supabase/next/server';
import { redirect } from 'next/navigation';

export default async function LeaderboardPage() {
  const database = await createClient();
  const {
    data: { user },
  } = await database.auth.getUser();

  if (!user?.id) {
    redirect('/login');
  }
  const leaderboardData = await getLeaderboardData();

  return (
    <div className="container mx-auto p-6">
      <h1 className="mb-6 text-3xl font-bold">
        Prompt Engineering Leaderboard
      </h1>
      <TopThreeCards data={leaderboardData} />
      <Leaderboard data={leaderboardData} />
    </div>
  );
}
