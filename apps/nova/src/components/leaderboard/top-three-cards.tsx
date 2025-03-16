'use client';

import { LeaderboardEntry } from './leaderboard';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import { motion, useReducedMotion } from 'framer-motion';
import { ExternalLink, Medal, Share, Sparkles, Trophy } from 'lucide-react';
import { useState } from 'react';

interface TopThreeCardsProps {
  data: LeaderboardEntry[];
  isLoading?: boolean;
}

export function TopThreeCards({ data, isLoading = false }: TopThreeCardsProps) {
  const topThree = data.slice(0, 3);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const prefersReducedMotion = useReducedMotion();

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
                'h-72 w-full rounded-xl bg-gray-200 dark:bg-slate-800/50',
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
        background: '#fff',
        glow: '#F59E0B',
        textColor: '#B45309',
        iconColor: '#F59E0B',
        prize: '$250',
        prizeColor: '#FBBF24',
        rank: '1',
        badgeClass: 'text-amber-700 dark:text-amber-300',
        scoreClass: 'text-amber-700 dark:text-amber-300',
        hexBorderClass: 'border-amber-500/50',
      };
    } else if (index === 1) {
      return {
        background: '#fff',
        glow: '#9CA3AF',
        textColor: '#6B7280',
        iconColor: '#9CA3AF',
        prize: '$125',
        prizeColor: '#9CA3AF',
        rank: '2',
        badgeClass: 'text-gray-600 dark:text-gray-300',
        scoreClass: 'text-gray-600 dark:text-gray-300',
        hexBorderClass: 'border-gray-400/50',
      };
    } else {
      return {
        background: '#fff',
        glow: '#B45309',
        textColor: '#92400E',
        iconColor: '#B45309',
        prize: '$75',
        prizeColor: '#D97706',
        rank: '3',
        badgeClass: 'text-amber-800 dark:text-amber-400',
        scoreClass: 'text-amber-800 dark:text-amber-400',
        hexBorderClass: 'border-amber-700/50',
      };
    }
  };

  return (
    <motion.div
      className="mb-12 grid grid-cols-3 gap-4 sm:gap-8"
      variants={prefersReducedMotion ? {} : containerVariants}
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
            variants={prefersReducedMotion ? {} : itemVariants}
            onHoverStart={() => setHoveredCard(index)}
            onHoverEnd={() => setHoveredCard(null)}
          >
            <div
              className={cn(
                'group relative flex w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-gray-200 p-6 pt-9 pt-32 transition-all dark:border-slate-700',
                hoveredCard === index
                  ? 'shadow-lg dark:shadow-[0_0_30px_rgba(0,0,0,0.3)]'
                  : 'shadow-md dark:shadow-2xl'
              )}
              style={{
                background: styles.background,
                transition: 'all 0.3s ease',
                transform:
                  hoveredCard === index ? 'translateY(-5px)' : 'translateY(0)',
              }}
            >
              {/* Light/dark mode backgrounds */}
              <div className="absolute inset-0 -z-10 bg-gradient-to-b from-gray-50 to-white opacity-100 dark:opacity-0"></div>
              <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-900 to-slate-950 opacity-0 dark:opacity-100"></div>

              {/* Prize ribbon */}
              <div
                className={cn(
                  'absolute top-5 -right-8 rotate-45 bg-blue-50 px-10 py-1 text-center text-xs font-semibold shadow-lg dark:bg-blue-950/80',
                  styles.badgeClass
                )}
              >
                {styles.prize}
              </div>

              {/* Share button */}
              <button
                className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-500 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-200 hover:text-gray-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                aria-label="Share profile"
              >
                <Share className="h-3.5 w-3.5" />
              </button>

              {/* Glowing border */}
              <motion.div
                className="absolute inset-0 -z-10 rounded-xl opacity-0 dark:opacity-50"
                style={{
                  background: `linear-gradient(45deg, ${styles.glow}, transparent, ${styles.glow})`,
                  backgroundSize: '200% 200%',
                }}
                animate={
                  prefersReducedMotion
                    ? {}
                    : {
                        backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
                      }
                }
                transition={{
                  duration: 5,
                  repeat: Infinity,
                  repeatType: 'loop',
                  ease: 'easeInOut',
                }}
              />

              {/* Rank number in hexagon */}
              <div className="absolute top-8 left-1/2 -translate-x-1/2 scale-75 sm:scale-100 dark:top-8">
                <div className="relative">
                  <div
                    className="hex-shape flex h-14 w-14 items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 shadow dark:shadow-none"
                    style={{
                      background:
                        index === 0
                          ? 'linear-gradient(135deg, #FBBF24, #D97706)'
                          : index === 1
                            ? 'linear-gradient(135deg, #E5E7EB, #9CA3AF)'
                            : 'linear-gradient(135deg, #FB923C, #B45309)',
                    }}
                  >
                    <span className="text-2xl font-bold text-white dark:text-slate-900">
                      {styles.rank}
                    </span>
                  </div>

                  {!prefersReducedMotion && (
                    <motion.div
                      className={cn(
                        'hex-shape-outline absolute -inset-1 -z-10 border-2',
                        styles.hexBorderClass
                      )}
                      style={{
                        opacity: 0.3,
                      }}
                      animate={{
                        opacity: [0.3, 0.6, 0.3],
                        scale: [1, 1.1, 1],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Trophy or medal icon with glow */}
              <motion.div
                className="relative mt-4 mb-6 dark:mt-4"
                animate={
                  prefersReducedMotion
                    ? {}
                    : {
                        y: [0, -5, 0],
                        rotate: hoveredCard === index ? [0, -5, 5, 0] : 0,
                      }
                }
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
                {!prefersReducedMotion && (
                  <motion.div
                    className="absolute inset-0 -z-10 blur-md"
                    style={{
                      background: styles.glow,
                      opacity: 0.15,
                    }}
                    animate={{
                      opacity: [0.1, 0.3, 0.1],
                      scale: [1, 1.3, 1],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  />
                )}

                {index === 0 ? (
                  <Trophy
                    className="h-16 w-16"
                    style={{ color: styles.iconColor }}
                  />
                ) : (
                  <Medal
                    className="h-14 w-14"
                    style={{ color: styles.iconColor }}
                  />
                )}
              </motion.div>

              {/* Avatar with hexagonal frame */}
              <div className="relative mb-4">
                {/* Animated glow behind avatar */}
                {!prefersReducedMotion && (
                  <motion.div
                    className="hex-shape absolute -inset-3 blur-lg"
                    style={{
                      background: styles.glow,
                      opacity: 0.1,
                    }}
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.1, 0.2, 0.1],
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  />
                )}

                {/* Hexagonal border */}
                <div className="relative h-24 w-24 overflow-hidden">
                  <div className="hex-shape h-full w-full overflow-hidden">
                    <Avatar className="h-24 w-24 scale-125">
                      <AvatarImage src={entry.avatar} alt={entry.name} />
                      <AvatarFallback className="bg-gray-50 text-gray-700 dark:bg-slate-800 dark:text-slate-200">
                        {entry.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </div>

                {/* Sparkles around 1st place avatar */}
                {index === 0 && !prefersReducedMotion && (
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
                      <Sparkles className="h-5 w-5 text-yellow-500 dark:text-yellow-300" />
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
                      <Sparkles className="h-4 w-4 text-yellow-500 dark:text-yellow-300" />
                    </motion.div>
                  </>
                )}
              </div>

              {/* Player name */}
              <div className="relative text-center">
                <h3
                  className={cn(
                    'mb-2 text-center text-xl font-bold',
                    styles.badgeClass
                  )}
                >
                  {entry.name}
                </h3>

                {/* Player rank badge */}
                <Badge
                  variant="outline"
                  className={cn(
                    'mb-4 border-gray-200 bg-gray-50 text-xs dark:border-slate-700 dark:bg-slate-900/80',
                    styles.badgeClass
                  )}
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
                className="flex items-center justify-center rounded-full bg-gray-50 px-5 py-1.5 dark:bg-slate-800/80"
                animate={
                  prefersReducedMotion
                    ? {}
                    : {
                        scale: hoveredCard === index ? [1, 1.05, 1] : 1,
                      }
                }
                transition={{
                  duration: 1,
                  ease: 'easeInOut',
                }}
              >
                <motion.span
                  className={cn('text-2xl font-bold', styles.scoreClass)}
                  animate={
                    prefersReducedMotion
                      ? {}
                      : { scale: hoveredCard === index ? [1, 1.1, 1] : 1 }
                  }
                  transition={{ duration: 0.5 }}
                >
                  {entry.score.toLocaleString()}
                </motion.span>
                <span className="ml-1 text-xs text-gray-500 dark:text-slate-400">
                  pts
                </span>
              </motion.div>

              {/* View profile button */}
              <button className="mt-4 flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                View profile <ExternalLink className="ml-1 h-3 w-3" />
              </button>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
