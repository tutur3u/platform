'use client';

import { Focus, Frown, Meh, Moon, PartyPopper, Smile } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type { TunaMood } from '../../types/tuna';

interface MoodIndicatorProps {
  mood: TunaMood;
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const moodConfig = {
  happy: {
    icon: Smile,
    label: 'Happy',
    color: 'text-dynamic-green',
    bgColor: 'bg-dynamic-green/10',
  },
  neutral: {
    icon: Meh,
    label: 'Neutral',
    color: 'text-dynamic-blue',
    bgColor: 'bg-dynamic-blue/10',
  },
  tired: {
    icon: Moon,
    label: 'Tired',
    color: 'text-dynamic-gray',
    bgColor: 'bg-dynamic-gray/10',
  },
  sad: {
    icon: Frown,
    label: 'Sad',
    color: 'text-dynamic-indigo',
    bgColor: 'bg-dynamic-indigo/10',
  },
  excited: {
    icon: PartyPopper,
    label: 'Excited',
    color: 'text-dynamic-yellow',
    bgColor: 'bg-dynamic-yellow/10',
  },
  focused: {
    icon: Focus,
    label: 'Focused',
    color: 'text-dynamic-purple',
    bgColor: 'bg-dynamic-purple/10',
  },
};

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

export function MoodIndicator({
  mood,
  className,
  showLabel = true,
  size = 'md',
}: MoodIndicatorProps) {
  const config = moodConfig[mood];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1',
        config.bgColor,
        className
      )}
    >
      <Icon className={cn(sizeClasses[size], config.color)} />
      {showLabel && (
        <span className={cn('font-medium text-sm', config.color)}>
          {config.label}
        </span>
      )}
    </div>
  );
}
