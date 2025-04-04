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
import {
  Crown,
  Medal,
  Rocket,
  Share,
  Sparkles,
  Star,
  Trophy,
  Users,
  Zap,
} from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export default function LeaderboardPage({
  data,
  challenges,
}: {
  data: LeaderboardEntry[];
  challenges: { id: string; title: string }[];
}) {
  const [filteredData, setFilteredData] = useState<LeaderboardEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedChallenge, setSelectedChallenge] = useState<string>('all');
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

  // Filter by search query and challenge
  useEffect(() => {
    let filtered = [...data];

    // Filter by challenge
    if (selectedChallenge !== 'all') {
      filtered = filtered
        .map((entry) => {
          // Create a copy with updated score based on the selected challenge
          const challengeScore =
            entry.challenge_scores?.[selectedChallenge] || 0;
          return {
            ...entry,
            score: challengeScore,
          };
        })
        .filter((entry) => entry.score > 0); // Only show users who participated in this challenge

      // Re-rank the filtered entries
      filtered.sort((a, b) => b.score - a.score);
      filtered = filtered.map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));
    }

    // Filter by search query
    if (searchQuery.trim()) {
      filtered = filtered.filter((entry) =>
        entry.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredData(filtered);
  }, [searchQuery, selectedChallenge, data]);

  // Calculate stats
  const yourRank =
    filteredData.findIndex((entry) => entry.id === currentUserId) + 1;
  const topScore = filteredData.length > 0 ? filteredData[0]?.score : 0;
  const totalParticipants = filteredData.length;

  // Get the selected challenge title
  const selectedChallengeTitle =
    selectedChallenge !== 'all'
      ? challenges.find((c) => c.id === selectedChallenge)?.title ||
        'Selected Challenge'
      : 'All Challenges';

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="mb-2 flex items-center gap-2">
              <Badge
                variant="outline"
                className="border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
              >
                <Trophy className="mr-2 h-4 w-4 text-yellow-500" />
                Competition
              </Badge>

              {selectedChallenge !== 'all' && (
                <Badge
                  variant="outline"
                  className="border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {selectedChallengeTitle}
                </Badge>
              )}

              <Badge
                variant="outline"
                className="border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
              >
                <Rocket className="mr-2 h-4 w-4" />
                Active
              </Badge>

              <Badge
                variant="outline"
                className="border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
              >
                <Zap className="mr-2 h-4 w-4" />
                Live
              </Badge>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="relative">
              <h1 className="mb-2 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent dark:from-blue-400 dark:via-blue-500 dark:to-indigo-600">
                Leaderboard
              </h1>
              <p className="max-w-2xl text-gray-600 dark:text-slate-400">
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
                <Card className="overflow-hidden border-blue-200 bg-white shadow-md dark:border-blue-500/20 dark:bg-slate-900/80 dark:shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="relative flex h-14 w-14 items-center justify-center">
                        <div className="hex-shape absolute inset-0 h-full w-full bg-blue-100 dark:bg-blue-500/10" />
                        <Crown className="relative z-10 h-6 w-6 text-blue-600 dark:text-blue-400" />
                        <motion.div
                          className="hex-shape-outline absolute -inset-1 z-0 border-blue-300 dark:border-blue-500/30"
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
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">
                            Your Current Rank
                          </p>
                        </div>
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                          #{yourRank}{' '}
                          <span className="text-sm font-normal text-gray-400 dark:text-slate-500">
                            of {totalParticipants}
                          </span>
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </motion.div>

        <div className="mb-8 grid grid-cols-1 gap-8 sm:grid-cols-3">
          <Card className="relative overflow-hidden border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900/80">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-400 to-blue-600" />
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-slate-400">
                  Your Position
                </p>
                <h3 className="text-2xl font-bold text-gray-800 dark:text-slate-100">
                  #{yourRank}
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-500">
                  {yourRank <= 10
                    ? 'Top tier competitor!'
                    : yourRank <= 30
                      ? 'Rising through the ranks!'
                      : 'Keep improving!'}
                </p>
              </div>
              <div className="relative">
                <div className="absolute inset-0 -z-10 rounded-full bg-blue-100 blur-sm dark:bg-blue-500/10" />
                <div className="rounded-full bg-gray-100 p-3 text-blue-600 dark:bg-slate-800 dark:text-blue-400">
                  <Trophy className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900/80">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-yellow-400 to-yellow-600" />
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-slate-400">
                  Highest Score
                </p>
                <h3 className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {topScore?.toLocaleString()}
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-500">
                  {filteredData.length > 0
                    ? `Achieved by ${filteredData[0]?.name}`
                    : 'No participants yet'}
                </p>
              </div>
              <div className="relative">
                <div className="absolute inset-0 -z-10 rounded-full bg-yellow-100 blur-sm dark:bg-yellow-500/10" />
                <div className="rounded-full bg-gray-100 p-3 text-yellow-600 dark:bg-slate-800 dark:text-yellow-400">
                  <Star className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900/80">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-400 to-indigo-600" />
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-slate-400">
                  Total Players
                </p>
                <h3 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                  {totalParticipants}
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-500">
                  {totalParticipants > 50
                    ? 'Competition is heating up!'
                    : 'Join the competition!'}
                </p>
              </div>
              <div className="relative">
                <div className="absolute inset-0 -z-10 rounded-full bg-indigo-100 blur-sm dark:bg-indigo-500/10" />
                <div className="rounded-full bg-gray-100 p-3 text-indigo-600 dark:bg-slate-800 dark:text-indigo-400">
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
              <div className="relative">
                <Medal className="h-5 w-5 text-yellow-400" />
                <motion.div
                  className="absolute -inset-1 -z-10 rounded-full opacity-0 blur-sm"
                  style={{
                    background: 'linear-gradient(to right, #F59E0B, #EF4444)',
                  }}
                  animate={{ opacity: [0.2, 0.5, 0.2] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
              <h2 className="bg-gradient-to-r from-yellow-500 via-amber-500 to-orange-500 bg-clip-text text-xl font-bold text-transparent dark:from-yellow-400 dark:via-amber-400 dark:to-orange-400">
                Top Performers
              </h2>
              {selectedChallenge !== 'all' && (
                <Badge
                  variant="outline"
                  className="ml-2 border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400"
                >
                  <Sparkles className="mr-1 h-3 w-3" />
                  {selectedChallengeTitle}
                </Badge>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="flex gap-1.5 border-slate-700 bg-slate-800/60 text-xs text-slate-300 transition-all duration-200 hover:scale-105 hover:bg-slate-700 hover:text-slate-100"
            >
              <Share className="h-3.5 w-3.5" /> Share
            </Button>
          </div>
          <TopThreeCards data={filteredData} isLoading={false} />

          {/* Add animated divider */}
          <div className="relative my-8 h-px w-full overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-400 to-transparent opacity-20 dark:via-slate-600"></div>
            <motion.div
              className="absolute inset-0 h-px w-1/3 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"
              animate={{ x: ['-100%', '400%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
        </div>

        {selectedChallenge !== 'all' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="my-6"
          >
            <Card className="overflow-hidden border-purple-200 bg-white shadow-md dark:border-purple-500/20 dark:bg-slate-900/80">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
                      <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      <motion.div
                        className="absolute -inset-1 rounded-full opacity-0 blur-sm"
                        style={{
                          background:
                            'linear-gradient(to right, #8B5CF6, #6366F1)',
                        }}
                        animate={{ opacity: [0.2, 0.4, 0.2] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-800 dark:text-slate-100">
                        {selectedChallengeTitle}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-slate-400">
                        Showing leaderboard rankings for this specific challenge
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-gray-200 bg-white text-xs text-gray-700 transition-all duration-200 hover:scale-105 hover:bg-gray-50 hover:text-gray-900 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                      onClick={() => setSelectedChallenge('all')}
                    >
                      View All Challenges
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-lg bg-purple-50 p-4 transition-all duration-200 hover:bg-purple-100/50 hover:shadow-md dark:bg-purple-900/10 dark:hover:bg-purple-900/20">
                    <h4 className="text-sm font-medium text-purple-700 dark:text-purple-400">
                      Total Participants
                    </h4>
                    <p className="text-2xl font-bold text-purple-800 dark:text-purple-300">
                      {totalParticipants}
                    </p>
                  </div>

                  <div className="rounded-lg bg-blue-50 p-4 transition-all duration-200 hover:bg-blue-100/50 hover:shadow-md dark:bg-blue-900/10 dark:hover:bg-blue-900/20">
                    <h4 className="text-sm font-medium text-blue-700 dark:text-blue-400">
                      Highest Score
                    </h4>
                    <p className="text-2xl font-bold text-blue-800 dark:text-blue-300">
                      {(topScore || 0).toLocaleString()}
                    </p>
                  </div>

                  {yourRank > 0 && (
                    <div className="rounded-lg bg-green-50 p-4 transition-all duration-200 hover:bg-green-100/50 hover:shadow-md dark:bg-green-900/10 dark:hover:bg-green-900/20">
                      <h4 className="text-sm font-medium text-green-700 dark:text-green-400">
                        Your Rank
                      </h4>
                      <p className="text-2xl font-bold text-green-800 dark:text-green-300">
                        #{yourRank}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <div className="flex w-full flex-grow flex-col gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <LeaderboardFilters
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                selectedChallenge={selectedChallenge}
                setSelectedChallenge={setSelectedChallenge}
                challenges={challenges}
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Leaderboard
                data={filteredData}
                isLoading={false}
                currentUserId={currentUserId}
                challenges={challenges}
                selectedChallenge={selectedChallenge}
              />
            </motion.div>
          </div>

          <div className="top-8 w-full md:sticky md:w-80">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <div className="relative space-y-6">
                <Card className="overflow-hidden border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900/80">
                  <CardContent className="p-6">
                    <h3 className="mb-3 text-lg font-bold text-gray-900 dark:text-slate-200">
                      How to Play
                    </h3>
                    <ul className="space-y-3 text-sm text-gray-600 dark:text-slate-400">
                      <li className="flex items-start gap-2">
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                          1
                        </span>
                        <span>
                          Complete challenges and quests to earn points
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                          2
                        </span>
                        <span>
                          Your total points determine your rank on the
                          leaderboard
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                          3
                        </span>
                        <span>
                          Compete with others for the top spot and win exclusive
                          rewards
                        </span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                <Card className="overflow-hidden border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900/80">
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-yellow-400 to-yellow-600" />
                  <CardContent className="p-6">
                    <h3 className="mb-3 text-lg font-bold text-gray-900 dark:text-slate-200">
                      Current Rewards
                    </h3>
                    <ul className="space-y-3">
                      <li className="flex items-center gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/30">
                          <Trophy className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-slate-200">
                            1st Place
                          </p>
                          <p className="text-sm text-gray-500 dark:text-slate-400">
                            $250 + Exclusive Badge
                          </p>
                        </div>
                      </li>
                      <li className="flex items-center gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                          <Medal className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-slate-200">
                            2nd Place
                          </p>
                          <p className="text-sm text-gray-500 dark:text-slate-400">
                            $125 + Special Profile Frame
                          </p>
                        </div>
                      </li>
                      <li className="flex items-center gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                          <Medal className="h-4 w-4 text-amber-700 dark:text-amber-500" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-slate-200">
                            3rd Place
                          </p>
                          <p className="text-sm text-gray-500 dark:text-slate-400">
                            $75 + Unique Avatar Item
                          </p>
                        </div>
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                <Card className="overflow-hidden border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900/80">
                  <CardContent className="p-6">
                    <Button
                      className="w-full gap-2 bg-gradient-to-r from-blue-600 to-indigo-700 text-white hover:from-blue-700 hover:to-indigo-800 dark:from-blue-500 dark:to-indigo-600 dark:hover:from-blue-600 dark:hover:to-indigo-700"
                      size="lg"
                    >
                      <Share className="h-4 w-4" /> Share Leaderboard
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          </div>
        </div>

        <div className="mt-8 text-center text-sm text-slate-500">
          <p>Last updated: {new Date().toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  );
}
