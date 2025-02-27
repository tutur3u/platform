import { LeaderboardEntry } from '@tuturuuu/types/primitives/leaderboard';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { Trophy } from 'lucide-react';

interface TopThreeCardsProps {
  data: LeaderboardEntry[];
}

const getPositionStyles = (index: number) => {
  switch (index) {
    case 0:
      return {
        background:
          'bg-gradient-to-br from-yellow-100 via-yellow-300 to-yellow-200',
        darkBackground:
          'dark:from-yellow-900 dark:via-yellow-800 dark:to-yellow-950',
        border: 'border-yellow-300 dark:border-yellow-700',
        shadow: 'shadow-yellow-200 dark:shadow-yellow-900',
        trophy: 'text-yellow-600 dark:text-yellow-400',
        label: 'Champion',
      };
    case 1:
      return {
        background:
          'bg-gradient-to-br from-slate-100 via-slate-200 to-slate-300',
        darkBackground:
          'dark:from-slate-800 dark:via-slate-700 dark:to-slate-900',
        border: 'border-slate-300 dark:border-slate-700',
        shadow: 'shadow-slate-200 dark:shadow-slate-900',
        trophy: 'text-slate-600 dark:text-slate-400',
        label: 'Runner-up',
      };
    case 2:
      return {
        background:
          'bg-gradient-to-br from-orange-100 via-orange-200 to-orange-300',
        darkBackground:
          'dark:from-orange-950 dark:via-orange-900 dark:to-orange-800',
        border: 'border-orange-300 dark:border-orange-700',
        shadow: 'shadow-orange-200 dark:shadow-orange-900',
        trophy: 'text-orange-600 dark:text-orange-400',
        label: 'Third Place',
      };
    default:
      return {
        background: '',
        darkBackground: '',
        border: '',
        shadow: '',
        trophy: '',
        label: '',
      };
  }
};

export function TopThreeCards({ data }: TopThreeCardsProps) {
  if (!data.length) return null;

  return (
    <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
      {data.slice(0, 3).map((entry, index) => {
        const styles = getPositionStyles(index);
        return (
          <Card
            key={entry.userId}
            className={cn(
              'relative overflow-hidden border-2 shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl',
              styles.background,
              styles.darkBackground,
              styles.border,
              styles.shadow
            )}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Trophy className={`h-7 w-7 ${styles.trophy}`} />
                <span className="text-xl font-bold">{styles.label}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              <p className="text-2xl font-bold tracking-tight">
                {entry.username}
              </p>
              <p className="mt-2 flex items-center text-muted-foreground">
                <span className="text-lg font-semibold">
                  {entry.totalScore.toLocaleString()}
                </span>
                <span className="ml-2">points</span>
              </p>
            </CardContent>
            <div className="absolute right-0 bottom-0 h-32 w-32 translate-x-8 translate-y-8 transform rounded-full bg-white/10 blur-2xl" />
          </Card>
        );
      })}
    </div>
  );
}
