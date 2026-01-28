'use client';

import { Cookie, Heart } from '@tuturuuu/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';

interface HealthMetersProps {
  health: number;
  hunger: number;
  className?: string;
  compact?: boolean;
}

export function HealthMeters({
  health,
  hunger,
  className,
  compact = false,
}: HealthMetersProps) {
  const getHealthColor = (value: number) => {
    if (value >= 70) return 'text-dynamic-green';
    if (value >= 40) return 'text-dynamic-yellow';
    return 'text-dynamic-red';
  };

  const getHungerColor = (value: number) => {
    if (value >= 70) return 'text-dynamic-orange';
    if (value >= 40) return 'text-dynamic-yellow';
    return 'text-dynamic-red';
  };

  if (compact) {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <div className="flex items-center gap-1">
          <Heart className={cn('h-4 w-4', getHealthColor(health))} />
          <span className="font-medium text-xs">{health}%</span>
        </div>
        <div className="flex items-center gap-1">
          <Cookie className={cn('h-4 w-4', getHungerColor(hunger))} />
          <span className="font-medium text-xs">{hunger}%</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Health bar */}
      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5">
            <Heart className={cn('h-4 w-4', getHealthColor(health))} />
            <span className="font-medium">Health</span>
          </div>
          <span className={cn('text-xs', getHealthColor(health))}>
            {health}%
          </span>
        </div>
        <Progress
          value={health}
          className={cn(
            'h-2',
            health >= 70 && '[&>div]:bg-dynamic-green',
            health >= 40 && health < 70 && '[&>div]:bg-dynamic-yellow',
            health < 40 && '[&>div]:bg-dynamic-red'
          )}
        />
      </div>

      {/* Hunger bar */}
      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5">
            <Cookie className={cn('h-4 w-4', getHungerColor(hunger))} />
            <span className="font-medium">Hunger</span>
          </div>
          <span className={cn('text-xs', getHungerColor(hunger))}>
            {hunger}%
          </span>
        </div>
        <Progress
          value={hunger}
          className={cn(
            'h-2',
            hunger >= 70 && '[&>div]:bg-dynamic-orange',
            hunger >= 40 && hunger < 70 && '[&>div]:bg-dynamic-yellow',
            hunger < 40 && '[&>div]:bg-dynamic-red'
          )}
        />
        {hunger < 30 && (
          <p className="mt-1 text-dynamic-red text-xs">
            Tuna is hungry! Feed them some treats.
          </p>
        )}
      </div>
    </div>
  );
}
