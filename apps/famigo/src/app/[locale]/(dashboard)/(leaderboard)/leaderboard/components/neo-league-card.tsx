import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  ArrowUpRight,
  Check,
  Info,
  Sparkles,
  Trophy,
} from '@tuturuuu/ui/icons';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';

const NEO_LEAGUE_ROUND_1_ID = '8d5e4c63-eccb-4a34-964b-c5018c0094da';

export function NeoLeagueCard() {
  const t = useTranslations('nova.leaderboard-page');
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedChallenge = searchParams.get('challenge');
  const isRound1Selected = selectedChallenge === NEO_LEAGUE_ROUND_1_ID;

  const handleFilterRound1 = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('challenge', NEO_LEAGUE_ROUND_1_ID);
    params.set('page', '1');
    router.push(`?${params.toString()}`);
  };

  const handleResetFilter = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('challenge');
    params.set('page', '1');
    router.push(`?${params.toString()}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`relative overflow-hidden rounded-lg border ${
        isRound1Selected
          ? 'bg-linear-to-br border-purple-400/40 from-purple-50/90 via-indigo-50/50 to-blue-50/70 dark:border-purple-500/30 dark:from-purple-950/30 dark:via-indigo-950/20 dark:to-blue-950/10'
          : 'bg-card border-slate-200 dark:border-slate-800'
      } p-4 shadow-sm`}
    >
      {isRound1Selected ? (
        <>
          <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-purple-500/10 blur-3xl" />
          <div className="absolute -bottom-12 -left-12 h-36 w-36 rounded-full bg-indigo-300/15 blur-3xl" />
          <motion.div
            className="absolute right-0 top-0 h-16 w-16 -translate-y-1/2 translate-x-1/2 rounded-full bg-indigo-400/20 blur-xl"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.5, 0.8, 0.5],
            }}
            transition={{ duration: 3, repeat: Infinity }}
          />
          <motion.div
            className="absolute right-2 top-2 h-2 w-2 rounded-full bg-purple-500"
            initial={{ scale: 0.8, opacity: 0.6 }}
            animate={{
              scale: [0.8, 1.4, 0.8],
              opacity: [0.6, 1, 0.6],
            }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <motion.div
            className="absolute bottom-3 right-3 text-purple-400/20 dark:text-purple-500/10"
            initial={{ rotate: -10, scale: 0.9 }}
            animate={{
              rotate: [-10, 5, -10],
              scale: [0.9, 1.1, 0.9],
            }}
            transition={{ duration: 6, repeat: Infinity }}
          >
            <Trophy className="h-16 w-16" />
          </motion.div>
          <div className="absolute left-1/4 top-0 h-1 w-1 rounded-full bg-purple-400/60" />
          <div className="absolute left-1/3 top-5 h-1.5 w-1.5 rounded-full bg-indigo-400/60" />
          <div className="left-1/5 absolute bottom-6 h-1 w-1 rounded-full bg-blue-400/60" />
        </>
      ) : (
        <>
          <div className="bg-linear-to-br absolute -right-12 -top-12 h-32 w-32 rounded-full from-slate-500/5 to-blue-500/5 blur-2xl" />
          <div className="bg-linear-to-tr absolute -bottom-12 -left-12 h-32 w-32 rounded-full from-slate-500/5 to-blue-500/5 blur-2xl" />
        </>
      )}

      <div className="relative flex items-start gap-4">
        <motion.div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            isRound1Selected
              ? 'bg-linear-to-br from-purple-200 to-indigo-300/70 text-purple-700 shadow-sm dark:from-purple-700/50 dark:to-indigo-800/30 dark:text-purple-300'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-300'
          }`}
          initial={{ rotate: 0 }}
          animate={isRound1Selected ? { rotate: [0, 10, 0] } : {}}
          transition={{ duration: 0.3 }}
        >
          {isRound1Selected ? (
            <Check className="h-5 w-5" />
          ) : (
            <Info className="h-5 w-5" />
          )}
        </motion.div>
        <div className="flex-1 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <motion.h3
                className={`font-semibold tracking-tight ${
                  isRound1Selected ? 'text-dynamic-purple' : 'text-dynamic-blue'
                }`}
                animate={
                  isRound1Selected
                    ? {
                        color: ['#7e22ce', '#9333ea', '#7e22ce'],
                      }
                    : {
                        color: ['#0ea5e9', '#60a5fa', '#0ea5e9'],
                      }
                }
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                {isRound1Selected
                  ? t('neo-league-card.round-1-title') ||
                    'Viewing NEO League Round 1'
                  : t('neo-league-card.title') || 'NEO League Competition'}
              </motion.h3>
              <Badge
                variant="outline"
                className={`${
                  isRound1Selected
                    ? 'border-purple-400/40 bg-purple-400/15 text-purple-700 dark:border-purple-500/40 dark:bg-purple-500/20 dark:text-purple-300'
                    : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                }`}
              >
                <motion.div>
                  <Sparkles className="mr-1 h-3 w-3" />
                </motion.div>
                {isRound1Selected
                  ? t('neo-league-card.active') || 'Active'
                  : t('neo-league-card.new') || 'New'}
              </Badge>
            </div>
            {isRound1Selected ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full text-purple-700 hover:bg-purple-100 hover:text-purple-800 dark:text-purple-400 dark:hover:bg-purple-900/30 dark:hover:text-purple-300"
                onClick={handleResetFilter}
                title="View all challenges"
              >
                <span className="sr-only">View all challenges</span>
                <span className="text-xs">×</span>
              </Button>
            ) : null}
          </div>
          <div className={`rounded-md p-2`}>
            <p className="text-muted-foreground text-sm">
              {isRound1Selected
                ? t('neo-league-card.round-1-description') ||
                  'You are currently viewing the results for Round 1 of the NEO League competition. The scores shown are specific to this challenge.'
                : t('neo-league-card.description') ||
                  'By default, this leaderboard shows scores from all challenges combined. To view results specifically for Round 1 of the NEO League competition, click the link below.'}
            </p>
          </div>
          <div className="pt-1">
            {isRound1Selected ? (
              <Button
                variant="outline"
                size="sm"
                className={`text-xs font-medium transition-all ${
                  isRound1Selected
                    ? 'border-purple-300/50 bg-purple-50/50 text-purple-700 hover:border-purple-400/60 hover:bg-purple-100/60 dark:border-purple-700/40 dark:bg-purple-900/20 dark:text-purple-300 dark:hover:bg-purple-800/30'
                    : ''
                }`}
                onClick={handleResetFilter}
              >
                {t('neo-league-card.view-all-challenges') ||
                  'View All Challenges'}
                <motion.div
                  animate={{ x: [0, 3, 0] }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    repeatType: 'reverse',
                  }}
                >
                  <ArrowUpRight className="ml-1 h-3 w-3" />
                </motion.div>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="text-xs font-medium hover:bg-indigo-50/50 hover:text-indigo-700 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-300"
                onClick={handleFilterRound1}
              >
                {t('neo-league-card.view-round-1') || 'View Round 1 Results'}
                <motion.div
                  animate={{ x: [0, 3, 0] }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    repeatType: 'reverse',
                  }}
                >
                  <ArrowUpRight className="ml-1 h-3 w-3" />
                </motion.div>
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
