'use client';

import { Leaderboard } from '@/components/leaderboard/leaderboard';
import { LeaderboardFilters } from '@/components/leaderboard/leaderboard-filters';
import { TopThreeCards } from '@/components/leaderboard/top-three-cards';
import { useLeaderboard } from '@/hooks/use-leaderboard';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { motion } from 'framer-motion';
import { Star, Trophy, Users } from 'lucide-react';

export default function LeaderboardPage() {
  // We'll simulate initial data since we're not using server components in this example
  const initialData = Array.from({ length: 50 }).map((_, i) => ({
    id: `user-${i + 1}`,
    rank: i + 1,
    name: `User ${i + 1}`,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${i + 1}`,
    score: Math.floor(10000 / (i + 1)) * 10,
    country: [
      'USA',
      'UK',
      'Canada',
      'Germany',
      'Japan',
      'Vietnam',
      'Australia',
      'France',
    ][i % 8],
    change: i % 3 === 0 ? 2 : i % 3 === 1 ? -1 : 0,
  }));

  // Mock current user ID - in a real app, get this from your auth system
  const currentUserId = 'user-5';

  const {
    data,
    searchQuery,
    setSearchQuery,
    timeRange,
    changeTimeRange,
    isLoading,
  } = useLeaderboard(initialData);

  // Calculate stats
  const totalParticipants = data.length;
  const topScore = data.length > 0 ? data[0]?.score : 0;
  const yourRank = data.findIndex((entry) => entry.id === currentUserId) + 1;

  return (
    <div className="container mx-auto p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <div className="mb-2 flex items-center gap-2">
          <Badge variant="outline" className="bg-muted/50">
            <Trophy className="mr-2 h-4 w-4 text-yellow-500" />
            Competition
          </Badge>
        </div>
        <h1 className="mb-3 text-4xl font-bold">
          Prompt Engineering Leaderboard
        </h1>
        <p className="text-muted-foreground">
          Track your ranking and see how you compare to other prompt engineers
          in the competition
        </p>
      </motion.div>

      {/* Stats cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Your Rank
              </p>
              <h3 className="text-2xl font-bold"># {yourRank}</h3>
            </div>
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <Trophy className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Top Score
              </p>
              <h3 className="text-2xl font-bold">
                {topScore?.toLocaleString()}
              </h3>
            </div>
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <Star className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Participants
              </p>
              <h3 className="text-2xl font-bold">{totalParticipants}</h3>
            </div>
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <Users className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      <LeaderboardFilters
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        timeRange={timeRange}
        changeTimeRange={changeTimeRange}
        isLoading={isLoading}
      />

      <TopThreeCards data={data} isLoading={isLoading} />
      <Leaderboard
        data={data}
        isLoading={isLoading}
        currentUserId={currentUserId} // Pass the current user ID as a prop
      />
    </div>
  );
}
