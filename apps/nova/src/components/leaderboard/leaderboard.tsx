'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { Crown, Medal, Star, TrendingUp } from 'lucide-react';

export type LeaderboardEntry = {
  id: string;
  rank: number;
  name: string;
  avatar: string;
  score: number;
};

interface LeaderboardProps {
  data: LeaderboardEntry[];
  isLoading?: boolean;
  currentUserId?: string;
}

export function Leaderboard({
  data,
  isLoading = false,
  currentUserId,
}: LeaderboardProps) {
  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="h-4 w-4 text-yellow-500" />;
    if (rank === 2) return <Medal className="h-4 w-4 text-gray-400" />;
    if (rank === 3) return <Medal className="h-4 w-4 text-amber-700" />;
    if (rank <= 10) return <Star className="h-4 w-4 text-green-500" />;
    return <TrendingUp className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative rounded-xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 shadow-[0_0_25px_rgba(0,0,0,0.3)] before:absolute before:inset-0 before:-z-10 before:rounded-xl before:bg-gradient-to-r before:from-blue-600/20 before:via-violet-600/20 before:to-blue-600/20 before:blur-xl"
    >
      <div className="absolute -inset-[1px] -z-10 rounded-xl bg-gradient-to-r from-blue-500/10 via-violet-500/10 to-blue-500/10 p-px"></div>
      <Table>
        <TableHeader className="bg-slate-800/30">
          <TableRow className="border-b border-slate-700/50 hover:bg-transparent">
            <TableHead className="w-[100px] font-semibold text-slate-300">
              Rank
            </TableHead>
            <TableHead className="font-semibold text-slate-300">User</TableHead>
            <TableHead className="text-right font-semibold text-slate-300">
              Score
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading &&
            Array.from({ length: 10 }).map((_, i) => (
              <TableRow
                key={i}
                className="border-b border-slate-800/30 hover:bg-slate-800/20"
              >
                <TableCell>
                  <Skeleton className="h-6 w-10 bg-slate-700/30" />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full bg-slate-700/30" />
                    <Skeleton className="h-4 w-32 bg-slate-700/30" />
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Skeleton className="ml-auto h-4 w-16 bg-slate-700/30" />
                </TableCell>
              </TableRow>
            ))}

          {!isLoading &&
            data.map((entry, index) => (
              <motion.tr
                key={entry.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
                className={cn(
                  'group border-b border-slate-800/30 transition-all hover:bg-slate-800/30',
                  currentUserId === entry.id &&
                    'bg-blue-900/20 hover:bg-blue-900/30'
                )}
              >
                <TableCell className="relative font-medium text-slate-300">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'relative flex h-10 w-10 items-center justify-center',
                        entry.rank === 1
                          ? 'text-black'
                          : entry.rank === 2
                            ? 'text-black'
                            : entry.rank === 3
                              ? 'text-white'
                              : entry.rank <= 10
                                ? 'text-white'
                                : 'text-slate-400'
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
                              ? 'drop-shadow(0 0 6px rgba(249, 115, 22, 0.5))'
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
                                    : '#334155',
                        }}
                      ></div>

                      <span className="relative z-10 text-sm font-bold">
                        {entry.rank}
                      </span>

                      {/* Animated pulsing outline for top 3 */}
                      {entry.rank <= 3 && (
                        <motion.div
                          className={cn(
                            'hex-shape-outline absolute -inset-1 z-0',
                            entry.rank === 1
                              ? 'border-yellow-500/70'
                              : entry.rank === 2
                                ? 'border-gray-400/70'
                                : 'border-amber-700/70'
                          )}
                          animate={{
                            opacity: [0.7, 1, 0.7],
                            scale: [1, 1.05, 1],
                          }}
                          transition={{
                            duration: 2,
                            ease: 'easeInOut',
                            repeat: Infinity,
                          }}
                        />
                      )}
                    </div>

                    {entry.rank <= 3 && (
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
                          entry.rank === 1
                            ? 'text-yellow-500'
                            : entry.rank === 2
                              ? 'text-gray-400'
                              : 'text-amber-700'
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
                      {(entry.rank <= 3 || currentUserId === entry.id) && (
                        <motion.div
                          className={cn(
                            'absolute -inset-1 rounded-full blur-md',
                            entry.rank === 1
                              ? 'bg-yellow-400/40'
                              : entry.rank === 2
                                ? 'bg-gray-300/40'
                                : entry.rank === 3
                                  ? 'bg-amber-600/40'
                                  : 'bg-blue-500/40'
                          )}
                          animate={{
                            scale: [1, 1.1, 1],
                            opacity: [0.5, 0.8, 0.5],
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
                      <div className="relative h-10 w-10 overflow-hidden">
                        <div
                          className="hex-shape absolute inset-0 z-10 border-2"
                          style={{
                            borderColor:
                              entry.rank === 1
                                ? '#FFD700'
                                : entry.rank === 2
                                  ? '#C0C0C0'
                                  : entry.rank === 3
                                    ? '#CD7F32'
                                    : currentUserId === entry.id
                                      ? '#3B82F6'
                                      : 'transparent',
                          }}
                        ></div>
                        <Avatar className="h-10 w-10 ring-offset-slate-900">
                          <AvatarImage
                            src={entry.avatar}
                            alt={entry.name}
                            className="scale-110"
                          />
                          <AvatarFallback className="bg-slate-800 text-blue-400">
                            {entry.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    </div>

                    <div className="flex flex-col">
                      <span
                        className={cn(
                          'font-medium text-slate-200',
                          currentUserId === entry.id &&
                            'font-bold text-blue-400',
                          entry.rank <= 3 && 'font-bold',
                          entry.rank === 1 && 'text-yellow-400',
                          entry.rank === 2 && 'text-gray-300',
                          entry.rank === 3 && 'text-amber-400'
                        )}
                      >
                        {entry.name}
                      </span>
                      {currentUserId === entry.id && (
                        <Badge
                          variant="outline"
                          className="mt-1 w-fit border-blue-500/30 bg-blue-950/60 text-xs text-blue-400"
                        >
                          You
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>

                <TableCell
                  className={cn(
                    'text-right font-bold',
                    entry.rank === 1
                      ? 'text-yellow-400'
                      : entry.rank === 2
                        ? 'text-gray-300'
                        : entry.rank === 3
                          ? 'text-amber-400'
                          : currentUserId === entry.id
                            ? 'text-blue-400'
                            : 'text-slate-200'
                  )}
                >
                  <div className="flex items-center justify-end">
                    <div
                      className={cn(
                        'rounded px-3 py-0.5',
                        entry.rank === 1
                          ? 'bg-yellow-500/10'
                          : entry.rank === 2
                            ? 'bg-gray-500/10'
                            : entry.rank === 3
                              ? 'bg-amber-500/10'
                              : currentUserId === entry.id
                                ? 'bg-blue-500/10'
                                : 'bg-slate-700/20'
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
                className="h-24 text-center text-slate-400"
              >
                <p>No entries found</p>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

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
      `}</style>
    </motion.div>
  );
}
