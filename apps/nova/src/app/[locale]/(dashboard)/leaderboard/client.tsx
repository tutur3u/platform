'use client';

import BasicInformationComponent from './basic-information-component';
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
  Award,
  Clock,
  Medal,
  Share,
  Sparkles,
  Target,
  Trophy,
} from '@tuturuuu/ui/icons';
import { Switch } from '@tuturuuu/ui/switch';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export default function LeaderboardPage({
  data,
  challenges,
  onTeamModeChange,
  isChecked,
  onLoadMore,
  hasMore,
}: {
  data: LeaderboardEntry[];
  challenges: { id: string; title: string }[];
  onTeamModeChange?: (isTeamMode: boolean) => void;
  isChecked: boolean;
  onLoadMore: () => void;
  hasMore: boolean;
}) {
  const [filteredData, setFilteredData] = useState<LeaderboardEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedChallenge, setSelectedChallenge] = useState<string>('all');
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(
    undefined
  );
  const [_isCheck, setChecked] = useState(false);
  const t = useTranslations('nova.leaderboard-page');

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
    let filtered = [...data];

    if (selectedChallenge !== 'all') {
      filtered = filtered
        .map((entry) => {
          const challengeScore =
            entry.challenge_scores?.[selectedChallenge] || 0;
          return {
            ...entry,
            score: challengeScore,
          };
        })
        .filter((entry) => entry.score > 0);

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

  let yourRank = 0;
  if (isChecked) {
    const userTeam = filteredData.find((team) =>
      team.member?.some((member) => member.id === currentUserId)
    );

    if (userTeam) {
      yourRank = filteredData.findIndex((team) => team.id === userTeam.id) + 1;
    }
  } else {
    yourRank =
      filteredData.findIndex((entry) => entry.id === currentUserId) + 1;
  }
  const topScore = filteredData.length > 0 ? filteredData[0]?.score : 0;
  const totalParticipants = filteredData.length;

  const selectedChallengeTitle =
    selectedChallenge !== 'all'
      ? challenges.find((c) => c.id === selectedChallenge)?.title ||
        t('selected-challenges')
      : t('filters.all-challenges');

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <BasicInformationComponent
          selectedChallenge={selectedChallenge}
          selectedChallengeTitle={selectedChallengeTitle}
          yourRank={yourRank}
          totalParticipants={totalParticipants}
          topScore={topScore || 0}
          isChecked={isChecked}
          filteredData={filteredData}
        />
        <div className="mb-8">
          <div className="mb-6 flex items-center justify-end gap-2">
            <span className="text-md font-medium text-slate-600 dark:text-slate-300">
              {t('individual')}
            </span>
            <Switch
              className="h-8 w-14 p-3 data-[state=checked]:bg-purple-600"
              onCheckedChange={(checked) => {
                setChecked(checked);
                onTeamModeChange?.(checked);
              }}
            />
            <span className="text-md font-medium text-slate-600 dark:text-slate-300">
              {t('team')}
            </span>
          </div>
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
                {t('top-performers.title')}
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
              <Share className="h-3.5 w-3.5" /> {t('share')}
            </Button>
          </div>
          <TopThreeCards
            data={filteredData}
            isLoading={false}
            isTeam={isChecked}
          />

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
                        {t('filter-challenges.specific-challenge-title')}
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
                      {t('filter-challenges.view-all-challenges')}
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-lg bg-purple-50 p-4 transition-all duration-200 hover:bg-purple-100/50 hover:shadow-md dark:bg-purple-900/10 dark:hover:bg-purple-900/20">
                    <h4 className="text-sm font-medium text-purple-700 dark:text-purple-400">
                      {t('filter-challenges.total-participants')}
                    </h4>
                    <p className="text-2xl font-bold text-purple-800 dark:text-purple-300">
                      {totalParticipants}
                    </p>
                  </div>

                  <div className="rounded-lg bg-blue-50 p-4 transition-all duration-200 hover:bg-blue-100/50 hover:shadow-md dark:bg-blue-900/10 dark:hover:bg-blue-900/20">
                    <h4 className="text-sm font-medium text-blue-700 dark:text-blue-400">
                      {t('filter-challenges.highest-score')}
                    </h4>
                    <p className="text-2xl font-bold text-blue-800 dark:text-blue-300">
                      {(topScore || 0).toLocaleString()}
                    </p>
                  </div>

                  {yourRank > 0 && (
                    <div className="rounded-lg bg-green-50 p-4 transition-all duration-200 hover:bg-green-100/50 hover:shadow-md dark:bg-green-900/10 dark:hover:bg-green-900/20">
                      <h4 className="text-sm font-medium text-green-700 dark:text-green-400">
                        {t('filter-challenges.your-rank')}
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
                isChecked={isChecked}
                isLoading={false}
                currentUserId={currentUserId}
                challenges={challenges}
                selectedChallenge={selectedChallenge}
              />

              {hasMore && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={onLoadMore}
                    className="gap-2"
                  >
                    {/* Load More */}
                    {t('load-more')}
                  </Button>
                </div>
              )}
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
                      {t('tutorials.title')}
                    </h3>
                    <ul className="space-y-3 text-sm text-gray-600 dark:text-slate-400">
                      <li className="flex items-start gap-2">
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                          1
                        </span>
                        <span>{t('tutorials.step-1')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                          2
                        </span>
                        <span>{t('tutorials.step-2')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                          3
                        </span>
                        <span>{t('tutorials.step-3')}</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                <Card className="overflow-hidden border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900/80">
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-yellow-400 to-yellow-600" />
                  <CardContent className="p-6">
                    <h3 className="mb-3 text-lg font-bold text-gray-900 dark:text-slate-200">
                      {t('rewards.current-rewards')}
                    </h3>
                    <ul className="space-y-3">
                      <li className="flex items-center gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/30">
                          <Trophy className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-slate-200">
                            {t('rewards.1st-place')}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-slate-400">
                            {t('rewards.1st-place-reward')}
                          </p>
                        </div>
                      </li>
                      <li className="flex items-center gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                          <Medal className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-slate-200">
                            {t('rewards.2nd-place')}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-slate-400">
                            {t('rewards.2nd-place-reward')}
                          </p>
                        </div>
                      </li>
                      <li className="flex items-center gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                          <Medal className="h-4 w-4 text-amber-700 dark:text-amber-500" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-slate-200">
                            {t('rewards.3rd-place')}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-slate-400">
                            {t('rewards.3rd-place-reward')}
                          </p>
                        </div>
                      </li>
                      <li className="flex items-center gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
                          <Award className="h-4 w-4 text-purple-700 dark:text-purple-400" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-slate-200">
                            {t('rewards.top-5')}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-slate-400">
                            {t('rewards.top-5-reward')}
                          </p>
                        </div>
                      </li>
                      <li className="flex items-center gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-pink-100 dark:bg-pink-900/30">
                          <Target className="h-4 w-4 text-pink-700 dark:text-pink-400" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-slate-200">
                            {t('rewards.top-16')}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-slate-400">
                            {t('rewards.top-16-reward')}
                          </p>
                        </div>
                      </li>
                      <li className="flex items-center gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                          <Clock className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-slate-200">
                            {t('rewards.first-45-teams')}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-slate-400">
                            {t('rewards.first-45-teams-reward')}
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
                      <Share className="h-4 w-4" />
                      {t('share-leaderboard')}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          </div>
        </div>

        <div className="mt-8 text-center text-sm text-slate-500">
          <p>
            {t('last-updated')} {new Date().toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}
