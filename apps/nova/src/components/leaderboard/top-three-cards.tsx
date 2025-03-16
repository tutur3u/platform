'use client';

import { LeaderboardEntry } from './leaderboard';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { Medal, Sparkles, Trophy } from 'lucide-react';
import { useState } from 'react';

interface TopThreeCardsProps {
  data: LeaderboardEntry[];
  isLoading?: boolean;
}

export function TopThreeCards({ data, isLoading = false }: TopThreeCardsProps) {
  const topThree = data.slice(0, 3);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="mb-8 grid grid-cols-3 gap-4 sm:gap-8">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className={cn(
              'flex justify-center',
              i === 1
                ? 'col-span-3 sm:order-1 sm:col-span-1'
                : i === 0
                  ? 'col-span-3 sm:order-2 sm:col-span-1'
                  : 'col-span-3 sm:order-3 sm:col-span-1'
            )}
          >
            <Skeleton
              className={cn(
                'h-72 w-full rounded-xl bg-slate-800/50',
                i === 0 ? 'sm:h-80' : ''
              )}
            />
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
        staggerChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  const getCardStyles = (index: number) => {
    if (index === 0) {
      return {
        background: '#111827',
        glow: '#F59E0B',
        textColor: '#FCD34D',
        iconColor: 'text-yellow-500',
        prize: '$250',
        prizeColor: '#FBBF24',
        rank: '1',
      };
    } else if (index === 1) {
      return {
        background: '#111827',
        glow: '#9CA3AF',
        textColor: '#D1D5DB',
        iconColor: 'text-gray-400',
        prize: '$125',
        prizeColor: '#9CA3AF',
        rank: '2',
      };
    } else {
      return {
        background: '#111827',
        glow: '#B45309',
        textColor: '#FDBA74',
        iconColor: 'text-amber-600',
        prize: '$75',
        prizeColor: '#D97706',
        rank: '3',
      };
    }
  };

  return (
    <motion.div
      className="mb-12 grid grid-cols-3 gap-4 sm:gap-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {topThree.map((entry, index) => {
        const styles = getCardStyles(index);

        return (
          <motion.div
            key={entry.id}
            className={cn(
              'col-span-3 flex justify-center sm:col-span-1',
              index === 0
                ? 'sm:order-2'
                : index === 1
                  ? 'sm:order-1'
                  : 'sm:order-3'
            )}
            variants={itemVariants}
            onHoverStart={() => setHoveredCard(index)}
            onHoverEnd={() => setHoveredCard(null)}
          >
            <div
              className={cn(
                'relative flex w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-slate-700 p-6 pt-9 pt-32',
                hoveredCard === index
                  ? 'shadow-[0_0_30px_rgba(0,0,0,0.3)]'
                  : 'shadow-2xl'
              )}
              style={{
                background: styles.background,
                transition: 'all 0.3s ease',
                transform:
                  hoveredCard === index ? 'translateY(-5px)' : 'translateY(0)',
              }}
            >
              {/* Prize ribbon */}
              <div
                className="absolute top-5 -right-8 rotate-45 bg-blue-950/80 px-10 py-1 text-center text-xs font-semibold shadow-lg"
                style={{ color: styles.prizeColor }}
              >
                {styles.prize}
              </div>

              {/* Glowing border */}
              <motion.div
                className="absolute inset-0 -z-10 rounded-xl opacity-50"
                style={{
                  background: `linear-gradient(45deg, ${styles.glow}, transparent, ${styles.glow})`,
                  backgroundSize: '200% 200%',
                }}
                animate={{
                  backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
                }}
                transition={{
                  duration: 5,
                  repeat: Infinity,
                  repeatType: 'loop',
                  ease: 'easeInOut',
                }}
              />

              {/* Rank number in hexagon */}
              <div className="absolute top-8 left-1/2 -translate-x-1/2 scale-75 sm:scale-100">
                <div className="relative">
                  <div
                    className="hex-shape flex h-14 w-14 items-center justify-center"
                    style={{
                      background:
                        index === 0
                          ? 'linear-gradient(135deg, #F59E0B, #D97706)'
                          : index === 1
                            ? 'linear-gradient(135deg, #9CA3AF, #6B7280)'
                            : 'linear-gradient(135deg, #B45309, #92400E)',
                    }}
                  >
                    <span className="text-2xl font-bold text-slate-900">
                      {styles.rank}
                    </span>
                  </div>

                  <motion.div
                    className="hex-shape-outline absolute -inset-1 -z-10"
                    style={{
                      borderColor: styles.glow,
                      opacity: 0.6,
                    }}
                    animate={{
                      opacity: [0.4, 0.8, 0.4],
                      scale: [1, 1.1, 1],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  />
                </div>
              </div>

              {/* Trophy or medal icon with glow */}
              <motion.div
                className="relative mt-4 mb-6"
                animate={{
                  y: [0, -5, 0],
                  rotate: hoveredCard === index ? [0, -5, 5, 0] : 0,
                }}
                transition={{
                  y: {
                    duration: 3,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  },
                  rotate: {
                    duration: 1,
                    repeat: hoveredCard === index ? 0 : 0,
                  },
                }}
              >
                <motion.div
                  className="absolute inset-0 -z-10 blur-md"
                  style={{ background: styles.glow, opacity: 0.4 }}
                  animate={{
                    opacity: [0.3, 0.7, 0.3],
                    scale: [1, 1.3, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />

                {index === 0 ? (
                  <Trophy
                    className="h-16 w-16"
                    style={{ color: styles.prizeColor }}
                  />
                ) : (
                  <Medal
                    className="h-14 w-14"
                    style={{ color: styles.prizeColor }}
                  />
                )}
              </motion.div>

              {/* Avatar with hexagonal frame */}
              <div className="relative mb-4">
                {/* Animated glow behind avatar */}
                <motion.div
                  className="hex-shape absolute -inset-3 opacity-40 blur-lg"
                  style={{ background: styles.glow }}
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.3, 0.6, 0.3],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />

                {/* Hexagonal border */}
                <div className="relative h-24 w-24 overflow-hidden">
                  <div
                    className="hex-shape-outline absolute inset-0 z-10"
                    style={{ borderColor: styles.glow, borderWidth: '3px' }}
                  />

                  <div className="hex-shape h-full w-full overflow-hidden">
                    <Avatar className="h-24 w-24 scale-125">
                      <AvatarImage src={entry.avatar} alt={entry.name} />
                      <AvatarFallback
                        style={{
                          color: styles.textColor,
                          backgroundColor: '#1F2937',
                        }}
                      >
                        {entry.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </div>

                {/* Sparkles around 1st place avatar */}
                {index === 0 && (
                  <>
                    <motion.div
                      className="absolute -top-2 -right-2 z-20"
                      animate={{
                        rotate: [-10, 10, -10],
                        scale: [1, 1.2, 1],
                      }}
                      transition={{
                        duration: 4,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    >
                      <Sparkles className="h-5 w-5 text-yellow-300" />
                    </motion.div>
                    <motion.div
                      className="absolute bottom-0 -left-2 z-20"
                      animate={{
                        rotate: [10, -10, 10],
                        scale: [1, 1.1, 1],
                      }}
                      transition={{
                        duration: 3.5,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    >
                      <Sparkles className="h-4 w-4 text-yellow-300" />
                    </motion.div>
                  </>
                )}
              </div>

              {/* Player name */}
              <div className="relative text-center">
                <h3
                  className="mb-2 text-center text-xl font-bold"
                  style={{ color: styles.textColor }}
                >
                  {entry.name}
                </h3>

                {/* Player rank badge */}
                <Badge
                  variant="outline"
                  className="mb-4 border-slate-700 bg-slate-900/80 text-xs"
                  style={{ color: styles.textColor }}
                >
                  {index === 0
                    ? 'Champion'
                    : index === 1
                      ? 'Runner-up'
                      : 'Third Place'}
                </Badge>
              </div>

              {/* Score with highlight */}
              <motion.div
                className="flex items-center justify-center rounded-full bg-slate-800/80 px-5 py-1"
                animate={{
                  scale: hoveredCard === index ? [1, 1.05, 1] : 1,
                  boxShadow:
                    hoveredCard === index
                      ? [
                          `0 0 0 rgba(${styles.glow}, 0)`,
                          `0 0 15px rgba(${styles.glow}, 0.5)`,
                          `0 0 0 rgba(${styles.glow}, 0)`,
                        ]
                      : '0 0 0 rgba(0,0,0,0)',
                }}
                transition={{
                  duration: 1,
                  ease: 'easeInOut',
                }}
              >
                <motion.span
                  className="text-2xl font-bold"
                  style={{ color: styles.textColor }}
                  animate={{ scale: hoveredCard === index ? [1, 1.1, 1] : 1 }}
                  transition={{ duration: 0.5 }}
                >
                  {entry.score.toLocaleString()}
                </motion.span>
                <span className="ml-1 text-xs text-slate-400">pts</span>
              </motion.div>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
