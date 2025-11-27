'use client';

import {
  Calendar,
  Check,
  Clock,
  Edit,
  Flame,
  MoreVertical,
  Trash2,
} from '@tuturuuu/icons';
import type { Habit, HabitStreak } from '@tuturuuu/types/primitives/Habit';
import { getRecurrenceDescription } from '@tuturuuu/types/primitives/Habit';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';

interface HabitWithStreak extends Habit {
  streak?: HabitStreak;
}

interface HabitCardProps {
  habit: HabitWithStreak;
  wsId: string;
  onEdit: () => void;
  onDelete: () => void;
  onComplete: (date: string) => void;
}

const colorMap: Record<string, string> = {
  BLUE: 'bg-blue-500',
  RED: 'bg-red-500',
  GREEN: 'bg-green-500',
  YELLOW: 'bg-yellow-500',
  PURPLE: 'bg-purple-500',
  PINK: 'bg-pink-500',
  CYAN: 'bg-cyan-500',
  ORANGE: 'bg-orange-500',
};

const priorityColors: Record<string, string> = {
  critical: 'text-red-500 bg-red-50 dark:bg-red-950',
  high: 'text-orange-500 bg-orange-50 dark:bg-orange-950',
  normal: 'text-blue-500 bg-blue-50 dark:bg-blue-950',
  low: 'text-gray-500 bg-gray-50 dark:bg-gray-950',
};

export default function HabitCard({
  habit,
  onEdit,
  onDelete,
  onComplete,
}: HabitCardProps) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const streak = habit.streak;

  // Get background color class
  const colorClass = colorMap[habit.color] || colorMap.BLUE;

  return (
    <Card
      className={cn(
        'relative overflow-hidden',
        !habit.is_active && 'opacity-60'
      )}
    >
      {/* Color indicator */}
      <div className={cn('absolute top-0 left-0 h-full w-1', colorClass)} />

      <CardHeader className="pb-2 pl-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-1">
            <CardTitle className="text-lg">{habit.name}</CardTitle>
            <p className="flex items-center gap-1 text-muted-foreground text-sm">
              <Calendar className="h-3 w-3" />
              {getRecurrenceDescription(habit)}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pl-4">
        {/* Duration and Priority */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            {habit.duration_minutes} min
          </Badge>
          <Badge className={cn('gap-1', priorityColors[habit.priority])}>
            {habit.priority}
          </Badge>
          {!habit.is_active && (
            <Badge variant="outline" className="text-muted-foreground">
              Inactive
            </Badge>
          )}
        </div>

        {/* Streak info */}
        {streak && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Flame
                  className={cn(
                    'h-4 w-4',
                    streak.current_streak > 0
                      ? 'text-orange-500'
                      : 'text-muted-foreground'
                  )}
                />
                <span className="font-medium">
                  {streak.current_streak} day streak
                </span>
              </div>
              <span className="text-muted-foreground">
                Best: {streak.best_streak}
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-muted-foreground text-xs">
                <span>Completion rate</span>
                <span>{streak.completion_rate}%</span>
              </div>
              <Progress value={streak.completion_rate} className="h-2" />
            </div>
          </div>
        )}

        {/* Quick complete button for today */}
        {habit.is_active && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => onComplete(today)}
          >
            <Check className="mr-2 h-4 w-4" />
            Complete for Today
          </Button>
        )}

        {/* Description preview */}
        {habit.description && (
          <p className="line-clamp-2 text-muted-foreground text-sm">
            {habit.description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
