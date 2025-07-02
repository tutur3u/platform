'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  Check,
  ChevronLeft,
  ChevronRight,
  Medal,
  Sparkles,
} from '@tuturuuu/ui/icons';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import BasicInformationComponent, {
  type BasicInformation,
} from '../components/basic-information-component';
import { CurrentChallengeCard } from '../components/current-challenge-card';
import Guider from '../components/guider';
import { Leaderboard, type LeaderboardEntry } from '../components/leaderboard';
import { LeaderboardFilters } from '../components/leaderboard-filters';
import Rewards from '../components/rewards';
import { TopThreeCards } from '../components/top-three-cards';

export default function TeamsLeaderboardClient({
  locale,
  data,
  topThree,
  basicInfo,
  challenges,
  hasMore,
  initialPage = 1,
  totalPages = 1,
  calculationDate,
}: {
  locale: string;
  data: LeaderboardEntry[];
  topThree: LeaderboardEntry[];
  basicInfo: BasicInformation;
  challenges: { id: string; title: string }[];
  hasMore: boolean;
  initialPage?: number;
  calculationDate: Date;
  totalPages?: number;
}) {
  const [filteredData, setFilteredData] = useState<LeaderboardEntry[]>(data);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentTeamId, setCurrentTeamId] = useState<string | undefined>(
    undefined
  );
  const [page, setPage] = useState(initialPage);
  const t = useTranslations('nova.leaderboard-page');
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get the selected challenge from URL params
  const selectedChallenge = searchParams.get('challenge') || 'all';

  const supabase = createClient();

  useEffect(() => {
    const getTeam = async () => {
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

    getTeam();
  }, [supabase]);

  useEffect(() => {
    let filtered = [...data];

    // Filter by search query
    if (searchQuery.trim()) {
      filtered = filtered.filter((entry) =>
        entry.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredData(filtered);
  }, [searchQuery, data, currentTeamId]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1) return;

    setPage(newPage);

    // Update URL to reflect page change while preserving challenge
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', newPage.toString());

    // Keep the challenge parameter if it exists
    if (selectedChallenge !== 'all') {
      params.set('challenge', selectedChallenge);
    }

    // Use router.push to navigate to the new page
    router.push(`?${params.toString()}`);
  };

  const handleChallengeChange = (challengeId: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (challengeId === 'all') {
      params.delete('challenge');
    } else {
      params.set('challenge', challengeId);
    }

    // Reset to page 1 when changing challenge
    params.set('page', '1');

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
          basicInfo={basicInfo}
          teamMode={true}
        />
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Medal className="h-5 w-5 text-yellow-400" />
                <motion.div
                  className="-inset-1 -z-10 absolute rounded-full opacity-0 blur-sm"
                  style={{
                    background: 'linear-gradient(to right, #F59E0B, #EF4444)',
                  }}
                  animate={{ opacity: [0.2, 0.5, 0.2] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
              <h2 className="bg-linear-to-r from-yellow-500 via-amber-500 to-orange-500 bg-clip-text font-bold text-transparent text-xl dark:from-yellow-400 dark:via-amber-400 dark:to-orange-400">
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

            <div className="flex items-center gap-2">
              <Link href="/leaderboard">
                <Button variant="outline" size="sm">
                  {t('individual')}
                </Button>
              </Link>
              <Link href="/leaderboard/teams">
                <Button size="sm">
                  <Check className="h-4 w-4" />
                  {t('teams')}
                </Button>
              </Link>
            </div>
          </div>
          <TopThreeCards topThree={topThree} teamMode={true} />

          <div className="mt-8 mb-6">
            <CurrentChallengeCard />
          </div>

          <div className="relative my-8 h-px w-full overflow-hidden">
            <div className="absolute inset-0 bg-linear-to-r from-transparent via-slate-400 to-transparent opacity-20 dark:via-slate-600"></div>
            <motion.div
              className="absolute inset-0 h-px w-1/3 bg-linear-to-r from-blue-500 via-purple-500 to-pink-500"
              animate={{ x: ['-100%', '400%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <div className="flex w-full grow flex-col gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <LeaderboardFilters
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                selectedChallenge={selectedChallenge}
                setSelectedChallenge={handleChallengeChange}
                challenges={challenges}
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Leaderboard
                locale={locale}
                data={filteredData}
                teamMode={true}
                currentEntryId={currentTeamId}
                challenges={challenges}
                selectedChallenge={selectedChallenge}
              />

              <div className="mt-6">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-foreground/[0.025] px-4 py-2 text-center backdrop-blur-xl dark:bg-foreground/5">
                  <div className="flex-none text-muted-foreground text-sm">
                    <span className="font-semibold text-primary">
                      {basicInfo.totalParticipants}
                    </span>{' '}
                    participant(s)
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4">
                    <div className="w-fit text-muted-foreground text-sm">
                      Page{' '}
                      <span className="font-semibold text-primary">{page}</span>{' '}
                      of{' '}
                      <span className="font-semibold text-primary">
                        {totalPages ||
                          Math.ceil(basicInfo.totalParticipants / 20)}
                      </span>
                    </div>

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
                      <Button
                        variant="outline"
                        className="hidden h-8 w-8 p-0 lg:flex"
                        onClick={() =>
                          handlePageChange(
                            totalPages ||
                              Math.ceil(basicInfo.totalParticipants / 20)
                          )
                        }
                        disabled={!hasMore}
                      >
                        <span className="sr-only">Go to last page</span>
                        <ArrowRightToLine className="h-4 w-4" />
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
                <Guider />
                <Rewards />
              </div>
            </motion.div>
          </div>
        </div>

        <div className="mt-8 text-center text-slate-500 text-sm">
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
