import { Leaderboard } from '@/components/leaderboard/leaderboard';
import { getLeaderboardData } from '@/lib/leaderboard';
import { createClient } from '@tutur3u/supabase/next/server';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/ui/card';
import { Trophy } from 'lucide-react';
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
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        {leaderboardData.slice(0, 3).map((entry, index) => (
          <Card
            key={entry.userId}
            className={index === 0 ? 'bg-yellow-100 dark:bg-yellow-900' : ''}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy
                  className={`h-5 w-5 ${index === 0 ? 'text-yellow-500' : index === 1 ? 'text-gray-400' : 'text-orange-600'}`}
                />
                {index === 0
                  ? 'Champion'
                  : index === 1
                    ? 'Runner-up'
                    : 'Third Place'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{entry.username}</p>
              <p className="text-muted-foreground">
                Total Score: {entry.totalScore}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Leaderboard data={leaderboardData} />
    </div>
  );
}
