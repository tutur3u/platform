'use client';

import { LeaderboardEntry } from './leaderboard';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { Medal, TrophyIcon } from 'lucide-react';

interface TopThreeCardsProps {
  data: LeaderboardEntry[];
  isLoading?: boolean;
}

export function TopThreeCards({ data, isLoading = false }: TopThreeCardsProps) {
  const topThree = data.slice(0, 3);

  if (isLoading) {
    return (
      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex justify-center">
            <Skeleton className={cn('h-72 w-64', i === 1 ? 'h-80' : '')} />
          </div>
        ))}
      </div>
    );
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.3,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-3"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {topThree.map((entry, index) => {
        const iconColor =
          index === 0
            ? 'text-yellow-500'
            : index === 1
              ? 'text-gray-300'
              : 'text-amber-700';

        return (
          <motion.div
            key={entry.id}
            className={cn(
              'flex justify-center',
              index === 0
                ? 'sm:order-2'
                : index === 1
                  ? 'sm:order-1'
                  : 'sm:order-3'
            )}
            variants={itemVariants}
          >
            <Card
              className={cn(
                'w-64 overflow-hidden border bg-gradient-to-b to-transparent shadow-md transition-all hover:shadow-lg',
                index === 0
                  ? 'from-yellow-500/10'
                  : index === 1
                    ? 'from-gray-400/10'
                    : 'from-amber-700/10'
              )}
            >
              <CardContent className="flex flex-col items-center justify-center p-6">
                {index === 0 ? (
                  <TrophyIcon className={cn('mb-4 h-12 w-12', iconColor)} />
                ) : (
                  <Medal className={cn('mb-4 h-10 w-10', iconColor)} />
                )}

                <div className="relative mb-4">
                  <motion.div
                    className="from-primary/50 absolute -inset-1 rounded-full bg-gradient-to-r to-blue-500/50 opacity-75 blur-sm"
                    animate={{
                      rotate: 360,
                      scale: [1, 1.05, 1],
                    }}
                    transition={{
                      rotate: {
                        duration: 10,
                        repeat: Infinity,
                        ease: 'linear',
                      },
                      scale: {
                        duration: 3,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      },
                    }}
                  />
                  <Avatar
                    className={cn(
                      'relative h-20 w-20 border-2',
                      index === 0
                        ? 'border-yellow-500'
                        : index === 1
                          ? 'border-gray-300'
                          : 'border-amber-700'
                    )}
                  >
                    <AvatarImage src={entry.avatar} alt={entry.name} />
                    <AvatarFallback className="text-2xl">
                      {entry.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <h3 className="mb-2 text-xl font-bold">{entry.name}</h3>
                <p className="text-primary text-2xl font-bold">
                  {entry.score.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
