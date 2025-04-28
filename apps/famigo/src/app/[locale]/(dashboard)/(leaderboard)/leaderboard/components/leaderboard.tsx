'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { ArrowDownUp, Crown, Medal, Sparkles } from '@tuturuuu/ui/icons';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { generateFunName } from '@tuturuuu/utils/name-helper';
import { formatScore } from '@tuturuuu/utils/nova/scores/calculate';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import React, { useState } from 'react';

export interface UserInterface {
  id: string;
  name: string;
  avatar: string;
  role: string;
}

export type LeaderboardEntry = {
  id: string;
  rank: number;
  name: string;
  avatar: string;
  member?: UserInterface[];
  score: number;
  challenge_scores?: Record<string, number>;
  problem_scores?: Record<
    string,
    {
      id: string;
      title: string;
      score: number;
    }[]
  >;
};

interface LeaderboardProps {
  locale: string;
  data: LeaderboardEntry[];
  currentEntryId?: string;
  teamMode?: boolean;
  challenges?: { id: string; title: string }[];
  selectedChallenge?: string;
}

export function Leaderboard({
  locale,
  data,
  teamMode,
  currentEntryId,
  challenges = [],
  selectedChallenge = 'all',
}: LeaderboardProps) {
  const prefersReducedMotion = useReducedMotion();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const t = useTranslations('nova.leaderboard-page.rankings');

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="h-4 w-4 text-yellow-500" />;
    if (rank === 2)
      return <Medal className="h-4 w-4 text-gray-400 dark:text-gray-300" />;
    if (rank === 3)
      return <Medal className="h-4 w-4 text-amber-700 dark:text-amber-500" />;
  };

  const toggleSortOrder = () => {
    setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
  };

  const toggleRowExpand = (entryId: string) => {
    const newExpanded = new Set(expandedRows);
    if (expandedRows.has(entryId)) {
      newExpanded.delete(entryId);
    } else {
      newExpanded.add(entryId);
    }
    setExpandedRows(newExpanded);
  };

  // Sort data based on sortOrder
  const sortedData = [...data].sort((a, b) => {
    return sortOrder === 'desc' ? b.score - a.score : a.score - b.score;
  });

  // Find the best challenge for each user (when viewing all challenges)
  const getBestChallengeForUser = (entry: LeaderboardEntry) => {
    if (!entry.challenge_scores || selectedChallenge !== 'all') return null;

    let bestChallengeId = '';
    let bestScore = 0;

    Object.entries(entry.challenge_scores).forEach(([challengeId, score]) => {
      if (score > bestScore) {
        bestScore = score;
        bestChallengeId = challengeId;
      }
    });

    if (!bestChallengeId) return null;

    const challenge = challenges.find((c) => c.id === bestChallengeId);
    return challenge
      ? { id: challenge.id, title: challenge.title, score: bestScore }
      : null;
  };

  return (
    <motion.div
      initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
      animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:shadow-[0_0_25px_rgba(0,0,0,0.3)]"
    >
      {/* Enhanced gradient border effect */}
      <div className="absolute -inset-[1px] -z-10 rounded-xl bg-gradient-to-r from-transparent via-transparent to-transparent dark:from-blue-500/10 dark:via-violet-500/10 dark:to-blue-500/10 dark:p-px">
        <motion.div
          className="absolute inset-0 rounded-xl opacity-0 dark:opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(45deg, #3B82F6, #8B5CF6, #EC4899)',
            backgroundSize: '200% 200%',
            backgroundPosition: '0% 0%',
          }}
          animate={{
            backgroundPosition: ['0% 0%', '100% 100%'],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            repeatType: 'reverse',
            ease: 'easeInOut',
          }}
        />
      </div>

      <div className="flex items-center justify-between bg-gray-50 px-4 py-2 dark:bg-slate-800/30">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-200">
          {t('title')}
        </h3>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleSortOrder}
                className="h-8 gap-1 text-xs text-gray-600 transition-all duration-200 hover:bg-gray-100 hover:text-gray-800 dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-slate-100"
              >
                <ArrowDownUp className="h-3.5 w-3.5" />
                {sortOrder === 'desc' ? t('highest-first') : t('lowest-first')}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="border-gray-200 bg-white text-xs text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <p>{t('hover-info')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent dark:scrollbar-thumb-slate-700 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-gray-50 dark:bg-slate-800/30">
            <TableRow className="border-b border-gray-200 hover:bg-transparent dark:border-slate-700/50 dark:hover:bg-transparent">
              <TableHead className="w-[100px] bg-gray-50 font-semibold text-gray-700 dark:bg-slate-800/30 dark:text-slate-300">
                {t('rank')}
              </TableHead>
              <TableHead className="bg-gray-50 font-semibold text-gray-700 dark:bg-slate-800/30 dark:text-slate-300">
                {t('user')}
              </TableHead>
              <TableHead className="bg-gray-50 text-right font-semibold text-gray-700 dark:bg-slate-800/30 dark:text-slate-300">
                {t('score')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((entry, index) => (
              <React.Fragment key={entry.id}>
                <motion.tr
                  initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
                  animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  className={cn(
                    'group border-b border-gray-200 transition-all hover:bg-gray-50 dark:border-slate-800/30 dark:hover:bg-slate-800/30',
                    currentEntryId === entry.id &&
                      'bg-blue-50/50 hover:bg-blue-50/80 dark:bg-blue-900/20 dark:hover:bg-blue-900/30',
                    hoveredRow === entry.id &&
                      'bg-gray-50 dark:bg-slate-800/40',
                    expandedRows.has(entry.id) && 'border-b-0'
                  )}
                  onMouseEnter={() => setHoveredRow(entry.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  <TableCell className="relative font-medium text-gray-700 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          'relative flex h-10 w-10 items-center justify-center transition-transform duration-300 group-hover:scale-110',
                          entry.rank === 1
                            ? 'text-black dark:text-black'
                            : entry.rank === 2
                              ? 'text-black dark:text-black'
                              : entry.rank === 3
                                ? 'text-white dark:text-white'
                                : currentEntryId === entry.id
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : 'text-gray-500 dark:text-slate-400'
                        )}
                      >
                        {/* Hexagon background with animated glow for top ranks */}
                        <div
                          className={cn(
                            'absolute left-0 top-0 h-full w-full',
                            entry.rank <= 3 && 'hex-shape'
                          )}
                          style={{
                            filter:
                              entry.rank <= 3
                                ? 'drop-shadow(0 0 6px rgba(249, 115, 22, 0.3))'
                                : 'none',
                            backgroundImage:
                              entry.rank === 1
                                ? 'linear-gradient(180deg, #FFD700, #FFA500)'
                                : entry.rank === 2
                                  ? 'linear-gradient(180deg, #E0E0E0, #A0A0A0)'
                                  : entry.rank === 3
                                    ? 'linear-gradient(180deg, #CD7F32, #8B4513)'
                                    : 'none',
                          }}
                        />

                        <span className="relative z-10 text-sm font-bold">
                          {entry.rank}
                        </span>
                      </div>

                      {entry.rank <= 3 && !prefersReducedMotion && (
                        <motion.div
                          initial={{ scale: 1 }}
                          animate={{ scale: [1, 1.15, 1] }}
                          transition={{
                            repeat: Infinity,
                            duration: 2,
                            repeatType: 'loop',
                            ease: 'easeInOut',
                            delay: index * 0.2,
                          }}
                          className={cn(
                            'transition-all duration-300 group-hover:scale-125',
                            entry.rank === 1
                              ? 'text-yellow-500'
                              : entry.rank === 2
                                ? 'text-gray-400 dark:text-gray-300'
                                : 'text-amber-700 dark:text-amber-500'
                          )}
                        >
                          {getRankIcon(entry.rank)}
                        </motion.div>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        {/* Glowing effect behind avatar for top ranks */}
                        {(entry.rank <= 3 || currentEntryId === entry.id) &&
                          !prefersReducedMotion && (
                            <motion.div
                              className={cn(
                                'absolute -inset-1 rounded-full blur-md',
                                entry.rank === 1
                                  ? 'bg-yellow-400/30 dark:bg-yellow-400/40'
                                  : entry.rank === 2
                                    ? 'bg-gray-300/30 dark:bg-gray-300/40'
                                    : entry.rank === 3
                                      ? 'bg-amber-600/30 dark:bg-amber-600/40'
                                      : 'bg-blue-500/20 dark:bg-blue-500/40'
                              )}
                              animate={{
                                scale: [1, 1.1, 1],
                                opacity: [0.3, 0.6, 0.3],
                              }}
                              transition={{
                                duration: 3,
                                repeat: Infinity,
                                repeatType: 'reverse',
                                ease: 'easeInOut',
                              }}
                            />
                          )}

                        {/* Hexagonal avatar for all players */}
                        <Link
                          href={`/${teamMode ? 'profile/teams' : 'profile'}/${entry.id.replace(/-/g, '')}`}
                          className="relative block h-10 w-10 overflow-hidden transition-transform duration-300 group-hover:scale-110"
                        >
                          <Avatar className="h-10 w-10 ring-offset-white dark:ring-offset-slate-900">
                            <AvatarImage
                              src={entry.avatar}
                              alt={entry.name}
                              className="scale-110"
                            />
                            <AvatarFallback className="bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-blue-400">
                              {(
                                entry.name ||
                                generateFunName({
                                  id: entry.id,
                                  locale,
                                })
                              ).charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                        </Link>
                      </div>

                      <div>
                        <Link
                          href={`/${teamMode ? 'profile/teams' : 'profile'}/${entry.id.replace(/-/g, '')}`}
                          className={cn(
                            'font-medium text-gray-800 transition-all duration-300 group-hover:translate-x-1 dark:text-slate-200',
                            currentEntryId === entry.id &&
                              'font-bold text-blue-600 dark:text-blue-400',
                            entry.rank <= 3 && 'font-bold',
                            entry.rank === 1 &&
                              'text-yellow-600 dark:text-yellow-400',
                            entry.rank === 2 &&
                              'text-gray-600 dark:text-gray-300',
                            entry.rank === 3 &&
                              'text-amber-700 dark:text-amber-400'
                          )}
                        >
                          {entry.name ||
                            generateFunName({
                              id: entry.id,
                              locale,
                            })}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {currentEntryId === entry.id && (
                            <Badge
                              variant="outline"
                              className="w-fit border-blue-200 bg-blue-50 text-xs text-blue-600 dark:border-blue-500/30 dark:bg-blue-950/60 dark:text-blue-400"
                            >
                              {t('you')}
                            </Badge>
                          )}
                          {selectedChallenge === 'all' &&
                            getBestChallengeForUser(entry) && (
                              <Badge
                                variant="outline"
                                className="h-5 border-purple-200 bg-purple-50 px-1.5 py-0 text-[10px] font-normal text-purple-700 transition-all duration-300 group-hover:bg-purple-100 dark:border-purple-900/30 dark:bg-purple-900/20 dark:text-purple-400 dark:group-hover:bg-purple-900/30"
                              >
                                <Sparkles className="mr-1 h-2.5 w-2.5" />
                                {t('best-in')}{' '}
                                {getBestChallengeForUser(entry)?.title}
                              </Badge>
                            )}
                          {entry.challenge_scores &&
                            Object.keys(entry.challenge_scores).length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleRowExpand(entry.id)}
                                className="ml-1 h-5 p-0 text-[10px] font-normal text-gray-500 hover:bg-transparent hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                              >
                                <Sparkles className="mr-1 h-2.5 w-2.5" />
                                {expandedRows.has(entry.id)
                                  ? t('hide-breakdown')
                                  : t('show-breakdown')}
                              </Button>
                            )}
                          {entry.problem_scores &&
                            Object.keys(entry.problem_scores).length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleRowExpand(entry.id)}
                                className="ml-1 h-5 p-0 text-[10px] font-normal text-gray-500 hover:bg-transparent hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                              >
                                <Sparkles className="mr-1 h-2.5 w-2.5" />
                                {expandedRows.has(entry.id)
                                  ? t('hide-breakdown')
                                  : t('show-breakdown')}
                              </Button>
                            )}
                        </div>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell
                    className={cn(
                      'text-right font-bold',
                      entry.rank === 1
                        ? 'text-yellow-600 dark:text-yellow-400'
                        : entry.rank === 2
                          ? 'text-gray-600 dark:text-gray-300'
                          : entry.rank === 3
                            ? 'text-amber-700 dark:text-amber-400'
                            : currentEntryId === entry.id
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-gray-700 dark:text-slate-200'
                    )}
                  >
                    <div className="flex items-center justify-end">
                      <div
                        className={cn(
                          'rounded px-3 py-0.5 transition-all duration-300 group-hover:scale-110',
                          entry.rank === 1
                            ? 'bg-yellow-50 dark:bg-yellow-500/10'
                            : entry.rank === 2
                              ? 'bg-gray-50 dark:bg-gray-500/10'
                              : entry.rank === 3
                                ? 'bg-amber-50 dark:bg-amber-500/10'
                                : currentEntryId === entry.id
                                  ? 'bg-blue-50 dark:bg-blue-500/10'
                                  : 'bg-gray-50 dark:bg-slate-700/20'
                        )}
                      >
                        {formatScore(entry.score, 2)}
                      </div>
                    </div>
                  </TableCell>
                </motion.tr>

                {/* Challenge Breakdown */}
                {expandedRows.has(entry.id) &&
                  (entry.challenge_scores || entry.problem_scores) && (
                    <motion.tr
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                      className="border-b border-gray-200 bg-gray-50/80 dark:border-slate-800/30 dark:bg-slate-800/20"
                    >
                      <TableCell colSpan={3} className="px-4 py-3">
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.3, delay: 0.1 }}
                          className="space-y-3"
                        >
                          <h4 className="text-xs font-medium text-gray-500 dark:text-slate-400">
                            {selectedChallenge !== 'all'
                              ? t('problem-breakdown')
                              : t('challenge-breakdown')}
                          </h4>

                          {selectedChallenge === 'all' ? (
                            // Original code for challenge breakdown
                            <>
                              {/* Challenge Score Distribution */}
                              <div className="mb-2 flex h-4 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800/50">
                                {challenges
                                  .filter(
                                    (challenge) =>
                                      entry.challenge_scores?.[challenge.id] !==
                                        undefined &&
                                      (entry.challenge_scores?.[challenge.id] ||
                                        0) > 0
                                  )
                                  .sort(
                                    (a, b) =>
                                      (entry.challenge_scores?.[b.id] || 0) -
                                      (entry.challenge_scores?.[a.id] || 0)
                                  )
                                  .map((challenge, i) => {
                                    const score =
                                      entry.challenge_scores?.[challenge.id] ||
                                      0;
                                    const percentage =
                                      (score / entry.score) * 100;

                                    // Generate colors for segments
                                    const colors = [
                                      'from-blue-500 to-blue-600',
                                      'from-purple-500 to-purple-600',
                                      'from-indigo-500 to-indigo-600',
                                      'from-sky-500 to-sky-600',
                                      'from-emerald-500 to-emerald-600',
                                    ];

                                    const colorClass =
                                      colors[i % colors.length];

                                    return (
                                      <motion.div
                                        key={challenge.id}
                                        className={`relative h-full bg-gradient-to-r ${colorClass}`}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${percentage}%` }}
                                        transition={{
                                          duration: 0.5,
                                          delay: 0.2 + i * 0.1,
                                        }}
                                        title={`${challenge.title}: ${score.toFixed(2)} ${t(
                                          'pts'
                                        )} (${percentage.toFixed(1)}%)`}
                                      />
                                    );
                                  })}
                              </div>

                              {/* Challenge Score Legend */}
                              <div className="flex flex-wrap gap-4">
                                {challenges
                                  .filter(
                                    (challenge) =>
                                      entry.challenge_scores?.[challenge.id] !==
                                        undefined &&
                                      (entry.challenge_scores?.[challenge.id] ||
                                        0) > 0
                                  )
                                  .sort(
                                    (a, b) =>
                                      (entry.challenge_scores?.[b.id] || 0) -
                                      (entry.challenge_scores?.[a.id] || 0)
                                  )
                                  .map((challenge, i) => {
                                    const score =
                                      entry.challenge_scores?.[challenge.id] ||
                                      0;
                                    const percentage =
                                      (score / entry.score) * 100;

                                    // Generate colors for legend
                                    const colors = [
                                      'bg-blue-500',
                                      'bg-purple-500',
                                      'bg-indigo-500',
                                      'bg-sky-500',
                                      'bg-emerald-500',
                                    ];

                                    const bgColorClass =
                                      colors[i % colors.length];

                                    return (
                                      <div
                                        key={challenge.id}
                                        className="flex items-center gap-2"
                                      >
                                        <div
                                          className={`h-2.5 w-2.5 rounded-full ${bgColorClass}`}
                                        />
                                        <span className="text-xs font-medium text-gray-700 dark:text-slate-300">
                                          {challenge.title}
                                        </span>
                                        <span className="text-xs text-gray-500 dark:text-slate-400">
                                          {score.toFixed(2)} {t('pts')}
                                        </span>
                                        <span className="text-xs text-gray-400 dark:text-slate-500">
                                          ({percentage.toFixed(1)}%)
                                        </span>
                                      </div>
                                    );
                                  })}
                              </div>
                            </>
                          ) : (
                            // New code for problem breakdown when a specific challenge is selected
                            <>
                              {/* Problem Score Distribution */}
                              <div className="mb-2 flex h-4 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800/50">
                                {entry.problem_scores &&
                                entry.problem_scores[selectedChallenge]
                                  ? // Make sure to generate unique keys based on both problem ID and index
                                    (() => {
                                      // Calculate total score for all problems in this challenge
                                      const totalProblemScore =
                                        entry.problem_scores[
                                          selectedChallenge
                                        ].reduce(
                                          (sum, problem) =>
                                            sum + (problem.score || 0),
                                          0
                                        );

                                      return entry.problem_scores[
                                        selectedChallenge
                                      ]
                                        .sort((a, b) => b.score - a.score)
                                        .map((problem, i) => {
                                          const problemScore =
                                            problem.score || 0;
                                          const percentage =
                                            totalProblemScore > 0
                                              ? (problemScore /
                                                  totalProblemScore) *
                                                100
                                              : 0;

                                          // Generate colors for segments
                                          const colors = [
                                            'from-blue-500 to-blue-600',
                                            'from-purple-500 to-purple-600',
                                            'from-indigo-500 to-indigo-600',
                                            'from-sky-500 to-sky-600',
                                            'from-emerald-500 to-emerald-600',
                                          ];

                                          const colorClass =
                                            colors[i % colors.length];

                                          return (
                                            <motion.div
                                              key={`${problem.id}-${i}`}
                                              className={`relative h-full bg-gradient-to-r ${colorClass}`}
                                              initial={{ width: 0 }}
                                              animate={{
                                                width: `${percentage}%`,
                                              }}
                                              transition={{
                                                duration: 0.5,
                                                delay: 0.2 + i * 0.1,
                                              }}
                                              title={`${problem.title}: ${problemScore.toFixed(1)} ${t(
                                                'pts'
                                              )} (${percentage.toFixed(1)}%)`}
                                            />
                                          );
                                        });
                                    })()
                                  : undefined}
                              </div>

                              {/* Problem Score Legend */}
                              <div className="flex flex-wrap gap-4">
                                {entry.problem_scores &&
                                entry.problem_scores[selectedChallenge]
                                  ? (() => {
                                      // Calculate total score for all problems in this challenge
                                      const totalProblemScore =
                                        entry.problem_scores[
                                          selectedChallenge
                                        ].reduce(
                                          (sum, problem) =>
                                            sum + (problem.score || 0),
                                          0
                                        );

                                      return entry.problem_scores[
                                        selectedChallenge
                                      ]
                                        .sort((a, b) => b.score - a.score)
                                        .map((problem, i) => {
                                          const problemScore =
                                            problem.score || 0;
                                          const percentage =
                                            totalProblemScore > 0
                                              ? (problemScore /
                                                  totalProblemScore) *
                                                100
                                              : 0;

                                          // Generate colors for legend
                                          const colors = [
                                            'bg-blue-500',
                                            'bg-purple-500',
                                            'bg-indigo-500',
                                            'bg-sky-500',
                                            'bg-emerald-500',
                                          ];

                                          const bgColorClass =
                                            colors[i % colors.length];

                                          return (
                                            <div
                                              key={`legend-${problem.id}-${i}`}
                                              className="flex items-center gap-2"
                                            >
                                              <div
                                                className={`h-2.5 w-2.5 rounded-full ${bgColorClass}`}
                                              />
                                              <span className="text-xs font-medium text-gray-700 dark:text-slate-300">
                                                {problem.title}
                                              </span>
                                              <span className="text-xs text-gray-500 dark:text-slate-400">
                                                {problemScore.toFixed(2)}{' '}
                                                {t('pts')}
                                              </span>
                                              <span className="text-xs text-gray-400 dark:text-slate-500">
                                                ({percentage.toFixed(1)}%)
                                              </span>
                                            </div>
                                          );
                                        });
                                    })()
                                  : undefined}
                              </div>
                            </>
                          )}
                        </motion.div>
                      </TableCell>
                    </motion.tr>
                  )}
              </React.Fragment>
            ))}

            {data.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="h-32 text-center text-gray-500 dark:text-slate-400"
                >
                  <p>{t('no-entries-found')}</p>
                  <p className="mt-2 text-sm">{t('first-join')}</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add custom CSS for hexagonal shapes */}
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
        .scrollbar-thin::-webkit-scrollbar {
          width: 5px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 5px;
        }
        .dark .scrollbar-thin::-webkit-scrollbar-thumb {
          background: #475569;
        }
      `}</style>
    </motion.div>
  );
}
