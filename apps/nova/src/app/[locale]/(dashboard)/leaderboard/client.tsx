'use client';

import {
  Leaderboard,
  LeaderboardEntry,
} from '@/components/leaderboard/leaderboard';
import { LeaderboardFilters } from '@/components/leaderboard/leaderboard-filters';
import { TopThreeCards } from '@/components/leaderboard/top-three-cards';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Separator } from '@tuturuuu/ui/separator';
import { motion } from 'framer-motion';
import {
  Crown,
  Medal,
  Rocket,
  Share,
  Star,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';

export default function LeaderboardPage({
  data,
}: {
  data: LeaderboardEntry[];
}) {
  const [filteredData, setFilteredData] = useState<LeaderboardEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
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
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-200">
      {/* Decorative background elements */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <motion.div
          className="absolute -top-[30%] -right-[10%] h-[500px] w-[500px] rounded-full bg-blue-500/5 blur-3xl"
          animate={{
            y: [0, 50, 0],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute top-[50%] -left-[10%] h-[300px] w-[300px] rounded-full bg-indigo-500/5 blur-3xl"
          animate={{
            y: [0, -30, 0],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <div className="bg-grid-slate-900/[0.03] absolute inset-0 bg-[size:30px_30px]"></div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="mb-2 flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-yellow-500/30 bg-yellow-500/10"
            >
              <Trophy className="mr-2 h-4 w-4 text-yellow-500" />
              Competition
            </Badge>

            <Badge
              variant="outline"
              className="border-blue-500/30 bg-blue-500/10 text-blue-400"
            >
              <Rocket className="mr-2 h-4 w-4" />
              Active
            </Badge>

            <Badge
              variant="outline"
              className="border-green-500/30 bg-green-500/10 text-green-400"
            >
              <Zap className="mr-2 h-4 w-4" />
              Live
            </Badge>
          </div>

          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="relative">
              <motion.span
                className="absolute top-3 -left-4 -z-10 h-10 w-1 rounded bg-blue-500"
                animate={{
                  height: [40, 60, 40],
                  opacity: [0.6, 1, 0.6],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
              <h1 className="mb-2 bg-gradient-to-r from-blue-400 via-blue-500 to-indigo-600 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
                Leaderboard
              </h1>
              <p className="max-w-2xl text-slate-400">
                Compete against the best players around the world. Climb the
                ranks and claim your spot at the top of the leaderboard!
              </p>
            </div>

            {yourRank > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="flex-shrink-0"
              >
                <Card className="border-blue-500/20 bg-slate-900/80 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="relative flex h-14 w-14 items-center justify-center">
                      <div className="hex-shape absolute inset-0 h-full w-full bg-blue-500/10" />
                      <Crown className="relative z-10 h-6 w-6 text-blue-400" />
                      <motion.div
                        className="hex-shape-outline absolute -inset-1 z-0 border-blue-500/30"
                        animate={{
                          opacity: [0.5, 1, 0.5],
                          scale: [1, 1.05, 1],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-400">
                        Your Current Rank
                      </p>
                      <p className="text-2xl font-bold text-blue-400">
                        #{yourRank}{' '}
                        <span className="text-sm font-normal text-slate-500">
                          of {totalParticipants}
                        </span>
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </motion.div>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="relative overflow-hidden border-slate-800 bg-slate-900/80">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-400 to-blue-600" />
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm font-medium text-slate-400">
                  Your Position
                </p>
                <h3 className="text-2xl font-bold text-slate-100">
                  #{yourRank}
                </h3>
                <p className="text-xs text-slate-500">
                  {yourRank <= 10
                    ? 'Top tier competitor!'
                    : yourRank <= 30
                      ? 'Rising through the ranks!'
                      : 'Keep improving!'}
                </p>
              </div>
              <div className="relative">
                <div className="absolute inset-0 -z-10 rounded-full bg-blue-500/10 blur-sm" />
                <div className="rounded-full bg-slate-800 p-3 text-blue-400">
                  <Trophy className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-slate-800 bg-slate-900/80">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-yellow-400 to-yellow-600" />
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm font-medium text-slate-400">
                  Highest Score
                </p>
                <h3 className="text-2xl font-bold text-yellow-400">
                  {topScore?.toLocaleString()}
                </h3>
                <p className="text-xs text-slate-500">
                  {data.length > 0
                    ? `Achieved by ${data[0]?.name}`
                    : 'No participants yet'}
                </p>
              </div>
              <div className="relative">
                <div className="absolute inset-0 -z-10 rounded-full bg-yellow-500/10 blur-sm" />
                <div className="rounded-full bg-slate-800 p-3 text-yellow-400">
                  <Star className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-slate-800 bg-slate-900/80">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-400 to-indigo-600" />
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm font-medium text-slate-400">
                  Total Players
                </p>
                <h3 className="text-2xl font-bold text-indigo-400">
                  {totalParticipants}
                </h3>
                <p className="text-xs text-slate-500">
                  {totalParticipants > 50
                    ? 'Competition is heating up!'
                    : 'Join the competition!'}
                </p>
              </div>
              <div className="relative">
                <div className="absolute inset-0 -z-10 rounded-full bg-indigo-500/10 blur-sm" />
                <div className="rounded-full bg-slate-800 p-3 text-indigo-400">
                  <Users className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator className="mt-2 mb-8 border-slate-800" />

        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Medal className="h-5 w-5 text-yellow-400" />
              <h2 className="text-xl font-bold text-slate-200">
                Top Performers
              </h2>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="flex gap-1.5 border-slate-700 bg-slate-800/60 text-xs text-slate-300 hover:bg-slate-700 hover:text-slate-100"
            >
              <Share className="h-3.5 w-3.5" /> Share
            </Button>
          </div>
          <TopThreeCards data={data} />
        </div>

        <div className="mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-400" />
          <h2 className="text-xl font-bold text-slate-200">All Players</h2>
        </div>

        <LeaderboardFilters
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />
        <Leaderboard data={filteredData} currentUserId={currentUserId} />

        <div className="mt-8 text-center text-sm text-slate-500">
          <p>Last updated: {new Date().toLocaleDateString()}</p>
        </div>
      </div>

      {/* Add custom CSS for hexagonal shapes if not already added in leaderboard component */}
      <style jsx global>{`
        .hex-shape {
          -webkit-clip-path: polygon(
            50% 0%,
            95% 25%,
            95% 75%,
            50% 100%,
            5% 75%,
            5% 25%
          );
          clip-path: polygon(
            50% 0%,
            95% 25%,
            95% 75%,
            50% 100%,
            5% 75%,
            5% 25%
          );
        }
        .hex-shape-outline {
          border: 2px solid;
          -webkit-clip-path: polygon(
            50% 0%,
            95% 25%,
            95% 75%,
            50% 100%,
            5% 75%,
            5% 25%
          );
          clip-path: polygon(
            50% 0%,
            95% 25%,
            95% 75%,
            50% 100%,
            5% 75%,
            5% 25%
          );
        }
        .bg-grid-slate-900 {
          background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32' fill='none' stroke='rgb(15 23 42 / 0.04)'%3e%3cpath d='M0 .5H31.5V32'/%3e%3c/svg%3e");
        }
      `}</style>
    </div>
  );
}
