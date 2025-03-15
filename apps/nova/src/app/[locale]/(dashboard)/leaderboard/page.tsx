'use client';

import {
  Leaderboard,
  LeaderboardEntry,
} from '@/components/leaderboard/leaderboard';
import { LeaderboardFilters } from '@/components/leaderboard/leaderboard-filters';
import { TopThreeCards } from '@/components/leaderboard/top-three-cards';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { Star, Trophy, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function LeaderboardPage() {
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [filteredData, setFilteredData] = useState<LeaderboardEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(
    undefined
  );

  const supabase = createClient();

  useEffect(() => {
    const getUserId = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id);
    };

    getUserId();
  }, [supabase]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const { data: leaderboardData, error } = await supabase.from(
          'nova_sessions'
        ).select(`
          user_id,
          total_score,
          users!inner(
            display_name,
            avatar_url
          )
        `);

        if (error) throw error;

        const groupedData = leaderboardData.reduce(
          (acc, curr) => {
            const existingUser = acc.find(
              (item) => item.user_id === curr.user_id
            );
            if (existingUser) {
              existingUser.total_score =
                (existingUser.total_score ?? 0) + (curr.total_score ?? 0);
            } else {
              acc.push({
                user_id: curr.user_id,
                total_score: curr.total_score ?? 0,
                users: curr.users,
              });
            }
            return acc;
          },
          [] as typeof leaderboardData
        );

        groupedData.sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0));

        const formattedData: LeaderboardEntry[] = groupedData.map(
          (entry, index) => ({
            id: entry.user_id,
            rank: index + 1,
            name: entry.users.display_name ?? '',
            avatar: entry.users.avatar_url ?? '',
            score: entry.total_score ?? 0,
          })
        );

        setData(formattedData);
      } catch (error) {
        console.error('Error fetching leaderboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [supabase]);

  // Filter by search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredData(data);
      return;
    }

    const filtered = data.filter((entry) =>
      entry.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredData(filtered);
  }, [searchQuery, data]);

  // Calculate stats
  const yourRank = data.findIndex((entry) => entry.id === currentUserId) + 1;
  const topScore = data.length > 0 ? data[0]?.score : 0;
  const totalParticipants = data.length;

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

      <TopThreeCards data={data} isLoading={isLoading} />

      <div className="mb-6">
        <Card className="p-4">
          <div>
            <p className="text-muted-foreground">Qualification</p>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs',
                  'bg-green-500 text-white'
                )}
              ></span>
              <p className="text-sm font-bold">Qualified to the next round</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs',
                  'bg-muted text-muted-foreground'
                )}
              ></span>
              <p className="text-sm font-bold">Eliminated</p>
            </div>
          </div>
        </Card>
      </div>

      <LeaderboardFilters
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />
      <Leaderboard
        data={filteredData}
        isLoading={isLoading}
        currentUserId={currentUserId}
      />
    </div>
  );
}
