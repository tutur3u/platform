import { LeaderboardEntry } from './page';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { CardContent } from '@tuturuuu/ui/card';
import {
  Crown,
  Rocket,
  Sparkles,
  Star,
  Trophy,
  Users,
  Zap,
} from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { motion } from 'framer-motion';
import React from 'react';

interface Props {
  selectedChallenge: string;
  selectedChallengeTitle: string;
  yourRank: number;
  totalParticipants: number;
  topScore: Number;
  filteredData: LeaderboardEntry[];
}
export default function BasicInformationComponent({
  selectedChallenge,
  selectedChallengeTitle,
  yourRank,
  totalParticipants,
  topScore,
  filteredData,
}: Props) {
  return (
    <div>
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
              Compete against the best players around the world. Climb the ranks
              and claim your spot at the top of the leaderboard!
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

      <Separator className="mb-8 mt-2 border-slate-800" />
    </div>
  );
}
