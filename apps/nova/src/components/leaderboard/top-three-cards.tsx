'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { LeaderboardEntry } from './leaderboard';
import { motion } from 'framer-motion';
import { TrophyIcon, Medal } from 'lucide-react';

interface TopThreeCardsProps {
  data: LeaderboardEntry[];
  isLoading?: boolean;
}

export function TopThreeCards({ data, isLoading = false }: TopThreeCardsProps) {
  const topThree = data.slice(0, 3);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex justify-center">
            <Skeleton className={cn(
              "h-72 w-64",
              i === 1 ? "h-80" : ""
            )} />
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
        staggerChildren: 0.3
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <motion.div 
      className="grid grid-cols-1 gap-6 sm:grid-cols-3"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {topThree.map((entry, index) => {
        const position = index === 1 ? 0 : index === 0 ? 1 : 2;
        const iconColor = position === 0 ? "text-yellow-500" : 
                          position === 1 ? "text-gray-300" : "text-amber-700";

        return (
          <motion.div 
            key={entry.id} 
            className="flex justify-center"
            variants={itemVariants}
          >
            <Card className={cn(
              "w-64 overflow-hidden border shadow-md transition-all hover:shadow-lg",
              position === 0 ? "h-80 bg-gradient-to-b from-yellow-500/10 to-transparent" : 
              position === 1 ? "h-72 bg-gradient-to-b from-gray-400/10 to-transparent" : 
                              "h-72 bg-gradient-to-b from-amber-700/10 to-transparent"
            )}>
              <CardContent className="flex flex-col items-center justify-center p-6">
                {position === 0 ? (
                  <TrophyIcon className={cn("h-12 w-12 mb-4", iconColor)} />
                ) : (
                  <Medal className={cn("h-10 w-10 mb-4", iconColor)} />
                )}

                <div className="relative mb-4">
                  <motion.div
                    className="absolute -inset-1 rounded-full bg-gradient-to-r from-primary/50 to-blue-500/50 opacity-75 blur-sm"
                    animate={{ 
                      rotate: 360,
                      scale: [1, 1.05, 1]
                    }}
                    transition={{ 
                      rotate: { duration: 10, repeat: Infinity, ease: "linear" },
                      scale: { duration: 3, repeat: Infinity, ease: "easeInOut" }
                    }}
                  />
                  <Avatar className={cn(
                    "relative h-20 w-20 border-2",
                    position === 0 ? "border-yellow-500" : 
                    position === 1 ? "border-gray-300" : "border-amber-700"
                  )}>
                    <AvatarImage src={entry.avatar} alt={entry.name} />
                    <AvatarFallback className="text-2xl">{entry.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                </div>
                <h3 className="mb-2 text-xl font-bold">{entry.name}</h3>
                <p className="mb-1 text-sm text-muted-foreground">{entry.country}</p>
                <p className="text-2xl font-bold text-primary">{entry.score.toLocaleString()}</p>
                <div className="mt-4 text-sm text-muted-foreground">
                  {entry.change > 0 ? `↑ +${entry.change}` : entry.change < 0 ? `↓ ${entry.change}` : '―'}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
