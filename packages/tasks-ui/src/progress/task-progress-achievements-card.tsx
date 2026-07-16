import { useQuery } from '@tanstack/react-query';
import {
  Award,
  CalendarCheck,
  Flame,
  Lock,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from '@tuturuuu/icons';
import {
  getTaskProgressAchievements,
  type TaskProgressAchievement,
  type TaskProgressAchievementTier,
} from '@tuturuuu/tasks-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import type { ComponentType } from 'react';
import type { Translate } from './task-progress-shared';

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  Sparkles,
  Flame,
  Trophy,
  CalendarCheck,
  Target,
  TrendingUp,
  Award,
  Users,
  Star,
};

const TIER_CLASS: Record<TaskProgressAchievementTier, string> = {
  bronze: 'text-dynamic-orange bg-dynamic-orange/10 border-dynamic-orange/30',
  silver: 'text-dynamic-sky bg-dynamic-sky/10 border-dynamic-sky/30',
  gold: 'text-dynamic-yellow bg-dynamic-yellow/10 border-dynamic-yellow/30',
  platinum: 'text-dynamic-purple bg-dynamic-purple/10 border-dynamic-purple/30',
};

function AchievementBadge({
  achievement,
  t,
}: {
  achievement: TaskProgressAchievement;
  t: Translate;
}) {
  const Icon = ICONS[achievement.icon ?? 'Award'] ?? Award;
  const unlocked = achievement.unlocked;
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition',
        unlocked ? TIER_CLASS[achievement.tier] : 'border-dashed opacity-55'
      )}
      title={achievement.description ?? achievement.name}
    >
      <span
        className={cn(
          'flex size-10 items-center justify-center rounded-full',
          unlocked ? 'bg-background/60' : 'bg-muted'
        )}
      >
        {unlocked ? (
          <Icon className="size-5" />
        ) : (
          <Lock className="size-4 text-muted-foreground" />
        )}
      </span>
      <span className="line-clamp-2 font-medium text-xs">
        {unlocked ? achievement.name : t('gamification.locked')}
      </span>
    </div>
  );
}

export function TaskProgressAchievementsCard({
  t,
  wsId,
}: {
  t: Translate;
  wsId: string;
}) {
  const query = useQuery({
    queryKey: ['task-progress', wsId, 'achievements'],
    queryFn: () => getTaskProgressAchievements(wsId),
  });

  const data = query.data?.ok ? query.data : null;
  if (!data) return null;

  const { achievements, stats } = data;
  const remaining = Math.max(0, stats.next_level_xp - stats.xp);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/20">
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Trophy className="size-4 text-dynamic-yellow" />
            {t('gamification.title')}
          </span>
          <Badge variant="secondary">
            {t('gamification.unlocked_of', {
              unlocked: stats.unlocked_count,
              total: stats.total_count,
            })}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center gap-4">
          <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-full bg-dynamic-purple/10 text-dynamic-purple">
            <span className="font-bold text-lg leading-none">
              {stats.level}
            </span>
            <span className="text-[9px] uppercase tracking-wide">lvl</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium">
                {t('gamification.xp', { xp: stats.xp })}
              </span>
              <span className="text-muted-foreground text-xs">
                {t('gamification.to_next', {
                  remaining,
                  level: stats.level + 1,
                })}
              </span>
            </div>
            <Progress
              className="h-2"
              indicatorClassName="bg-dynamic-purple"
              value={stats.level_percent}
            />
            {stats.streak_freezes > 0 ? (
              <div className="mt-1.5 flex items-center gap-1 text-muted-foreground text-xs">
                <Flame className="size-3 text-dynamic-sky" />
                {t('gamification.streak_freezes', {
                  count: stats.streak_freezes,
                })}
              </div>
            ) : null}
          </div>
        </div>

        {achievements.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t('gamification.empty')}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {achievements.map((achievement) => (
              <AchievementBadge
                achievement={achievement}
                key={achievement.code}
                t={t}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
