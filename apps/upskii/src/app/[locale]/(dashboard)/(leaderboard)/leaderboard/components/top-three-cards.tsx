'use client';

import { LeaderboardEntry } from './leaderboard';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { ExternalLink, Medal, Sparkles, Trophy } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface RandomValues {
  width: number;
  height: number;
  left: string;
  top: string;
  delay: number;
  duration: number;
  xOffset: number;
}
interface TopThreeCardsProps {
  topThree: LeaderboardEntry[];
  teamMode?: boolean;
  wsId: string;
}

export function TopThreeCards({
  topThree,
  teamMode = false,
  wsId,
}: TopThreeCardsProps) {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const t = useTranslations('nova.leaderboard-page');

  const [randomValues, setRandomValues] = useState<RandomValues[]>([]);

  // Only run this on the client side
  useEffect(() => {
    setRandomValues(
      [...Array(6)].map(() => ({
        width: Math.random() * 6 + 2,
        height: Math.random() * 6 + 2,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        delay: Math.random() * 2,
        duration: Math.random() * 3 + 2,
        xOffset: Math.random() * 10 - 5,
      }))
    );
  }, []);

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
        prize: '185M VND',
        prizeColor: '#FBBF24',
        rank: '1',
        badgeClass: 'text-amber-700 dark:text-amber-300',
        scoreClass: 'text-amber-700 dark:text-amber-300',
        hexBorderClass: 'border-amber-500/50',
        particleColors: ['#FBBF24', '#F59E0B', '#D97706'],
        gradientClass: 'from-amber-500/20 via-amber-400/10 to-amber-300/5',
      };
    } else if (index === 1) {
      return {
        background: '#fff',
        glow: '#9CA3AF',
        textColor: '#6B7280',
        iconColor: '#9CA3AF',
        prize: '111M VND',
        prizeColor: '#9CA3AF',
        rank: '2',
        badgeClass: 'text-gray-600 dark:text-gray-300',
        scoreClass: 'text-gray-600 dark:text-gray-300',
        hexBorderClass: 'border-gray-400/50',
        particleColors: ['#E5E7EB', '#9CA3AF', '#6B7280'],
        gradientClass: 'from-gray-500/20 via-gray-400/10 to-gray-300/5',
      };
    } else {
      return {
        background: '#fff',
        glow: '#B45309',
        textColor: '#92400E',
        iconColor: '#B45309',
        prize: '67M VND',
        prizeColor: '#D97706',
        rank: '3',
        badgeClass: 'text-amber-800 dark:text-amber-400',
        scoreClass: 'text-amber-800 dark:text-amber-400',
        hexBorderClass: 'border-amber-700/50',
        particleColors: ['#FB923C', '#F97316', '#C2410C'],
        gradientClass: 'from-amber-700/20 via-amber-600/10 to-amber-500/5',
      };
    }
  };

  const handleCardHover = (index: number) => {
    setHoveredCard(index);

    if (!prefersReducedMotion) {
      if (index === 0) {
        // firePreset('celebration');
      } else if (index === 1) {
        // firePreset('levelUp');
      } else if (index === 2) {
        // firePreset('achievement');
      }
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
            onHoverStart={() => handleCardHover(index)}
            onHoverEnd={() => setHoveredCard(null)}
          >
            <div
              className={cn(
                'group relative flex w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-gray-200 p-6 pt-32 transition-all dark:border-slate-700',
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

              {/* Animated background gradient */}
              <div className="absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                <motion.div
                  className={cn(
                    'absolute inset-0 bg-gradient-to-br opacity-20 dark:opacity-30',
                    styles.gradientClass
                  )}
                  animate={{
                    backgroundPosition: ['0% 0%', '100% 100%'],
                  }}
                  transition={{
                    duration: 8,
                    repeat: Infinity,
                    repeatType: 'reverse',
                    ease: 'easeInOut',
                  }}
                />
              </div>

              {/* Floating particles */}
              {!prefersReducedMotion && (
                <>
                  {randomValues.map((value, i) => (
                    <motion.div
                      key={i}
                      className="absolute rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-70"
                      style={{
                        width: value.width,
                        height: value.height,
                        background:
                          styles.particleColors[
                            i % styles.particleColors.length
                          ],
                        left: value.left,
                        top: value.top,
                      }}
                      animate={{
                        y: [0, -20, 0],
                        x: [0, value.xOffset, 0],
                        scale: [1, Math.random() * 0.5 + 0.8, 1],
                      }}
                      transition={{
                        duration: value.duration,
                        repeat: Infinity,
                        delay: value.delay,
                        ease: 'easeInOut',
                      }}
                    />
                  ))}
                </>
              )}

              {/* Glowing border */}
              <motion.div
                className="absolute inset-0 -z-10 rounded-xl opacity-0 dark:opacity-50"
                style={{
                  backgroundImage: `linear-gradient(45deg, ${styles.glow}, transparent, ${styles.glow})`,
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
              <div className="absolute left-1/2 top-8 -translate-x-1/2 scale-75 sm:scale-100 dark:top-8">
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
                className="relative mb-6 mt-4 dark:mt-4"
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
                      className="absolute -right-2 -top-2 z-20"
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
                      className="absolute -left-2 bottom-0 z-20"
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
                    ? t('top-performers.ranks.first-badge')
                    : index === 1
                      ? t('top-performers.ranks.second-badge')
                      : t('top-performers.ranks.third-badge')}
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
              <Link
                href={`/${teamMode ? 'profile/teams' : 'profile'}/${entry.id.replace(/-/g, '')}`}
                className="mt-4 flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 opacity-0 transition-opacity hover:bg-gray-200 group-hover:opacity-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {t('view-profile')} <ExternalLink className="ml-1 h-3 w-3" />
              </Link>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
