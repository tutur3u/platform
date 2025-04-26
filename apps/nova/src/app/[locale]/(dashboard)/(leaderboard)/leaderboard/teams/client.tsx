'use client';

import BasicInformationComponent, {
  BasicInformation,
} from '../components/basic-information-component';
import { Leaderboard, LeaderboardEntry } from '../components/leaderboard';
import { LeaderboardFilters } from '../components/leaderboard-filters';
import { TopThreeCards } from '../components/top-three-cards';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import {
  ArrowLeftToLine,
  Award,
  ChevronLeft,
  ChevronRight,
  Clock,
  Medal,
  Sparkles,
  Target,
  Trophy,
} from '@tuturuuu/ui/icons';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function LeaderboardClient({
  data,
  topThree,
  basicInfo,
  challenges,
  problems = [],
  hasMore,
  initialPage = 1,
  calculationDate,
}: {
  data: LeaderboardEntry[];
  topThree: LeaderboardEntry[];
  basicInfo: BasicInformation;
  challenges: { id: string; title: string }[];
  problems?: { id: string; title: string; challenge_id: string }[];
  hasMore: boolean;
  initialPage?: number;
  calculationDate: Date;
  totalPages?: number;
}) {
  const [filteredData, setFilteredData] = useState<LeaderboardEntry[]>(data);
  const [filteredInfo, setFilteredInfo] = useState<BasicInformation>(basicInfo);
  const [filteredTopThree, setFilteredTopThree] =
    useState<LeaderboardEntry[]>(topThree);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedChallenge, setSelectedChallenge] = useState<string>('all');
  const [currentTeamId, setCurrentTeamId] = useState<string | undefined>(
    undefined
  );
  const [page, setPage] = useState(initialPage);
  const t = useTranslations('nova.leaderboard-page');
  const router = useRouter();
  const searchParams = useSearchParams();

  const supabase = createClient();

  useEffect(() => {
    const getUserTeam = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.id) {
        const { data: teamMember } = await supabase
          .from('nova_team_members')
          .select('team_id')
          .eq('user_id', user.id)
          .maybeSingle();

        setCurrentTeamId(teamMember?.team_id);
      }
    };

    getUserTeam();
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

      const topThree = filtered.slice(0, 3);
      setFilteredTopThree(topThree);

      // Update basic info based on filtered data
      const currentTeam = filtered.find((entry) => entry.id === currentTeamId);
      const newBasicInfo = {
        currentRank: currentTeam?.rank || 0,
        topScore: filtered.length > 0 ? filtered[0]?.score || 0 : 0,
        archiverName: filtered.length > 0 ? filtered[0]?.name || '' : '',
        totalParticipants: filtered.length,
      };
      setFilteredInfo(newBasicInfo);
    } else {
      setFilteredTopThree(topThree);
      setFilteredInfo(basicInfo);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      filtered = filtered.filter((entry) =>
        entry.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredData(filtered);
  }, [
    searchQuery,
    selectedChallenge,
    data,
    basicInfo,
    currentTeamId,
    topThree,
  ]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1) return;

    setPage(newPage);

    // Update URL to reflect page change
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', newPage.toString());

    // Use router.push to navigate to the new page
    router.push(`?${params.toString()}`);
  };

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
          basicInfo={filteredInfo}
          teamMode={true}
        />
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

            <Link href="/leaderboard">
              <Button variant="outline" size="sm">
                {t('individual')}
              </Button>
            </Link>
          </div>
          <TopThreeCards topThree={filteredTopThree} teamMode={true} />

          <div className="relative my-8 h-px w-full overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-400 to-transparent opacity-20 dark:via-slate-600"></div>
            <motion.div
              className="absolute inset-0 h-px w-1/3 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"
              animate={{ x: ['-100%', '400%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
        </div>

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
                teamMode={true}
                currentEntryId={currentTeamId}
                challenges={challenges}
                selectedChallenge={selectedChallenge}
                problems={problems}
              />

              <div className="mt-6">
                <div className="bg-foreground/[0.025] dark:bg-foreground/5 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2 text-center backdrop-blur-xl">
                  <div className="text-muted-foreground flex-none text-sm"></div>

                  <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        className="hidden h-8 w-8 p-0 lg:flex"
                        onClick={() => handlePageChange(1)}
                        disabled={page <= 1}
                      >
                        <span className="sr-only">Go to first page</span>
                        <ArrowLeftToLine className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        className="h-8 w-8 p-0"
                        onClick={() => handlePageChange(page - 1)}
                        disabled={page <= 1}
                      >
                        <span className="sr-only">Go to previous page</span>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        className="h-8 w-8 p-0"
                        onClick={() => handlePageChange(page + 1)}
                        disabled={!hasMore}
                      >
                        <span className="sr-only">Go to next page</span>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
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
              </div>
            </motion.div>
          </div>
        </div>

        <div className="mt-8 text-center text-sm text-slate-500">
          <p>
            {t('last-updated')}{' '}
            {new Date(calculationDate).toLocaleString('vi-VN', {
              timeZone: 'Asia/Ho_Chi_Minh',
              year: 'numeric',
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
