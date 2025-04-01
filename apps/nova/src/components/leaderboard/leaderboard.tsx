'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  ArrowDownUp,
  Crown,
  Medal,
  Sparkles,
  Star,
  TrendingUp,
} from '@tuturuuu/ui/icons';
import { Skeleton } from '@tuturuuu/ui/skeleton';
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
import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { useState } from 'react';

export type LeaderboardEntry = {
  id: string;
  rank: number;
  name: string;
  avatar: string;
  score: number;
  challenge_scores?: Record<string, number>;
};

interface LeaderboardProps {
  data: LeaderboardEntry[];
  isLoading?: boolean;
  currentUserId?: string;
  challenges?: { id: string; title: string }[];
  selectedChallenge?: string;
}

export function Leaderboard({
  data,
  isLoading = false,
  currentUserId,
  challenges = [],
  selectedChallenge = 'all',
}: LeaderboardProps) {
  const prefersReducedMotion = useReducedMotion();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="h-4 w-4 text-yellow-500" />;
    if (rank === 2)
      return <Medal className="h-4 w-4 text-gray-400 dark:text-gray-300" />;
    if (rank === 3)
      return <Medal className="h-4 w-4 text-amber-700 dark:text-amber-500" />;
    if (rank <= 10)
      return <Star className="h-4 w-4 text-green-600 dark:text-green-500" />;
    return <TrendingUp className="h-4 w-4 text-gray-500 dark:text-gray-400" />;
  };

  const toggleSortOrder = () => {
    setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
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
            background: 'linear-gradient(45deg, #3B82F6, #8B5CF6, #EC4899)',
            backgroundSize: '200% 200%',
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
          Leaderboard Rankings
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
                {sortOrder === 'desc' ? 'Highest First' : 'Lowest First'}
              </Button>
            </TooltipTrigger>
            <TooltipContent
              side="left"
              className="border-gray-200 bg-white text-xs dark:border-slate-700 dark:bg-slate-800"
            >
              <p>Click to change sort order</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="scrollbar-thin max-h-[600px] overflow-auto scrollbar-thumb-gray-300 scrollbar-track-transparent dark:scrollbar-thumb-slate-700">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-gray-50 dark:bg-slate-800/30">
            <TableRow className="border-b border-gray-200 hover:bg-transparent dark:border-slate-700/50 dark:hover:bg-transparent">
              <TableHead className="w-[100px] bg-gray-50 font-semibold text-gray-700 dark:bg-slate-800/30 dark:text-slate-300">
                Rank
              </TableHead>
              <TableHead className="bg-gray-50 font-semibold text-gray-700 dark:bg-slate-800/30 dark:text-slate-300">
                User
              </TableHead>
              <TableHead className="bg-gray-50 text-right font-semibold text-gray-700 dark:bg-slate-800/30 dark:text-slate-300">
                Score
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow
                  key={i}
                  className="border-b border-gray-200 hover:bg-gray-50 dark:border-slate-800/30 dark:hover:bg-slate-800/20"
                >
                  <TableCell>
                    <Skeleton className="h-6 w-10 bg-gray-200 dark:bg-slate-700/30" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full bg-gray-200 dark:bg-slate-700/30" />
                      <Skeleton className="h-4 w-32 bg-gray-200 dark:bg-slate-700/30" />
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="ml-auto h-4 w-16 bg-gray-200 dark:bg-slate-700/30" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading &&
              sortedData.map((entry, index) => (
                <motion.tr
                  key={entry.id}
                  initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
                  animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  className={cn(
                    'group border-b border-gray-200 transition-all hover:bg-gray-50 dark:border-slate-800/30 dark:hover:bg-slate-800/30',
                    currentUserId === entry.id &&
                      'bg-blue-50/50 hover:bg-blue-50/80 dark:bg-blue-900/20 dark:hover:bg-blue-900/30',
                    hoveredRow === entry.id && 'bg-gray-50 dark:bg-slate-800/40'
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
                                : entry.rank <= 10
                                  ? 'text-white dark:text-white'
                                  : 'text-gray-500 dark:text-slate-400'
                        )}
                      >
                        {/* Hexagon background with animated glow for top ranks */}
                        <div
                          className={cn(
                            'absolute top-0 left-0 h-full w-full',
                            entry.rank <= 3 && 'hex-shape'
                          )}
                          style={{
                            filter:
                              entry.rank <= 3
                                ? 'drop-shadow(0 0 6px rgba(249, 115, 22, 0.3))'
                                : 'none',
                            background:
                              entry.rank === 1
                                ? 'linear-gradient(180deg, #FFD700, #FFA500)'
                                : entry.rank === 2
                                  ? 'linear-gradient(180deg, #E0E0E0, #A0A0A0)'
                                  : entry.rank === 3
                                    ? 'linear-gradient(180deg, #CD7F32, #8B4513)'
                                    : entry.rank <= 10
                                      ? 'linear-gradient(180deg, #4ADE80, #16A34A)'
                                      : '#f1f5f9 dark:#334155',
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
                        {(entry.rank <= 3 || currentUserId === entry.id) &&
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
                          href={`/profile/${entry.id.replace(/-/g, '')}`}
                          className="relative block h-10 w-10 overflow-hidden transition-transform duration-300 group-hover:scale-110"
                        >
                          <Avatar className="h-10 w-10 ring-offset-white dark:ring-offset-slate-900">
                            <AvatarImage
                              src={entry.avatar}
                              alt={entry.name}
                              className="scale-110"
                            />
                            <AvatarFallback className="bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-blue-400">
                              {entry.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                        </Link>
                      </div>

                      <div>
                        <Link
                          href={`/profile/${entry.id.replace(/-/g, '')}`}
                          className={cn(
                            'font-medium text-gray-800 transition-all duration-300 group-hover:translate-x-1 dark:text-slate-200',
                            currentUserId === entry.id &&
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
                          {entry.name}
                        </Link>
                        {currentUserId === entry.id && (
                          <Badge
                            variant="outline"
                            className="mt-1 w-fit border-blue-200 bg-blue-50 text-xs text-blue-600 dark:border-blue-500/30 dark:bg-blue-950/60 dark:text-blue-400"
                          >
                            You
                          </Badge>
                        )}
                        {selectedChallenge === 'all' &&
                          getBestChallengeForUser(entry) && (
                            <div className="mt-1 flex items-center gap-1">
                              <Badge
                                variant="outline"
                                className="h-5 border-purple-200 bg-purple-50 px-1.5 py-0 text-[10px] font-normal text-purple-700 transition-all duration-300 group-hover:bg-purple-100 dark:border-purple-900/30 dark:bg-purple-900/20 dark:text-purple-400 dark:group-hover:bg-purple-900/30"
                              >
                                <Sparkles className="mr-1 h-2.5 w-2.5" />
                                Best in: {getBestChallengeForUser(entry)?.title}
                              </Badge>
                            </div>
                          )}
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
                            : currentUserId === entry.id
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
                                : currentUserId === entry.id
                                  ? 'bg-blue-50 dark:bg-blue-500/10'
                                  : 'bg-gray-50 dark:bg-slate-700/20'
                        )}
                      >
                        {entry.score.toLocaleString()}
                      </div>
                    </div>
                  </TableCell>
                </motion.tr>
              ))}

            {!isLoading && data.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="h-32 text-center text-gray-500 dark:text-slate-400"
                >
                  <p>No entries found</p>
                  <p className="mt-2 text-sm">
                    Be the first to join the competition!
                  </p>
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
