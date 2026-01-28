'use client';

import {
  CheckCircle2,
  Lock,
  MessageCircle,
  Sparkles,
  Star,
  Timer,
  Trophy,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { useGroupedAchievements } from '../../hooks/use-achievements';
import type { TunaAchievementWithUnlock } from '../../types/tuna';

const categoryConfig = {
  milestones: {
    label: 'Milestones',
    icon: Star,
    color: 'text-dynamic-yellow',
    bgColor: 'bg-dynamic-yellow/10',
  },
  productivity: {
    label: 'Productivity',
    icon: Timer,
    color: 'text-dynamic-purple',
    bgColor: 'bg-dynamic-purple/10',
  },
  social: {
    label: 'Social',
    icon: MessageCircle,
    color: 'text-dynamic-blue',
    bgColor: 'bg-dynamic-blue/10',
  },
  special: {
    label: 'Special',
    icon: Sparkles,
    color: 'text-dynamic-pink',
    bgColor: 'bg-dynamic-pink/10',
  },
};

// Map achievement icon names to components
const iconMap: Record<string, typeof Star> = {
  MessageCircle,
  Flame: Star, // fallback
  Trophy,
  Star,
  Sparkles,
  Heart: Star, // fallback
  Timer,
  Target: Star, // fallback
  Zap: Sparkles,
  Clock: Timer,
  Sun: Star,
  Moon: Star,
  Award: Trophy,
  Crown: Trophy,
  Book: MessageCircle,
  Brain: Star,
  HeartHandshake: MessageCircle,
  Cookie: Star,
  Palette: Sparkles,
  CalendarCheck: Timer,
};

interface AchievementsPanelProps {
  className?: string;
}

export function AchievementsPanel({ className }: AchievementsPanelProps) {
  const {
    data: groupedAchievements,
    stats,
    isLoading,
  } = useGroupedAchievements();

  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-lg bg-muted/50" />
        ))}
      </div>
    );
  }

  const categories = [
    'milestones',
    'productivity',
    'social',
    'special',
  ] as const;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Overall progress */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-5 w-5 text-dynamic-yellow" />
              Achievement Progress
            </CardTitle>
            <Badge variant="outline">
              {stats?.unlocked ?? 0} / {stats?.total ?? 0}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={stats?.completion_percentage ?? 0} className="h-3" />
          <div className="mt-2 flex justify-between text-sm">
            <span className="text-muted-foreground">
              {stats?.completion_percentage ?? 0}% complete
            </span>
            <span className="font-medium text-dynamic-yellow">
              +{stats?.total_xp_earned ?? 0} XP earned
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Achievements by category */}
      {categories.map((category) => {
        const config = categoryConfig[category];
        const achievements = groupedAchievements[category] || [];
        const Icon = config.icon;
        const unlockedCount = achievements.filter((a) => a.is_unlocked).length;

        if (achievements.length === 0) return null;

        return (
          <Card key={category}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className={cn('h-5 w-5', config.color)} />
                  {config.label}
                </CardTitle>
                <Badge variant="outline" className={config.bgColor}>
                  {unlockedCount} / {achievements.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {achievements.map((achievement: TunaAchievementWithUnlock) => (
                  <AchievementCard
                    key={achievement.id}
                    achievement={achievement}
                    categoryColor={config.color}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

interface AchievementCardProps {
  achievement: TunaAchievementWithUnlock;
  categoryColor: string;
}

function AchievementCard({ achievement, categoryColor }: AchievementCardProps) {
  const IconComponent = iconMap[achievement.icon] || Star;

  return (
    <div
      className={cn(
        'relative flex items-start gap-3 rounded-lg border p-3 transition-colors',
        achievement.is_unlocked ? 'bg-muted/30' : 'bg-muted/10 opacity-60'
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
          achievement.is_unlocked ? 'bg-dynamic-yellow/20' : 'bg-muted'
        )}
      >
        {achievement.is_unlocked ? (
          <IconComponent className={cn('h-5 w-5', categoryColor)} />
        ) : (
          <Lock className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-medium text-sm leading-tight">
            {achievement.name}
          </h4>
          {achievement.is_unlocked && (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-dynamic-green" />
          )}
        </div>
        <p className="mt-0.5 text-muted-foreground text-xs leading-snug">
          {achievement.description}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              'text-xs',
              achievement.is_unlocked && 'bg-dynamic-yellow/10'
            )}
          >
            +{achievement.xp_reward} XP
          </Badge>
          {achievement.is_unlocked && achievement.unlocked_at && (
            <span className="text-muted-foreground text-xs">
              {new Date(achievement.unlocked_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
