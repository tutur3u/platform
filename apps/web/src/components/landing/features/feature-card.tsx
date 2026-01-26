'use client';

import type { LucideIcon } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  description: string;
  features?: string[];
  color: string;
}

export function FeatureCard({
  icon: Icon,
  title,
  subtitle,
  description,
  color,
}: FeatureCardProps) {
  return (
    <div
      className={cn(
        'group relative h-full overflow-hidden rounded-xl border p-5 transition-all hover:shadow-lg',
        `border-dynamic-${color}/20 bg-gradient-to-br from-dynamic-${color}/5 via-background to-background hover:border-dynamic-${color}/40`
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'mb-4 flex h-11 w-11 items-center justify-center rounded-lg transition-transform group-hover:scale-105',
          `bg-dynamic-${color}/10`
        )}
      >
        <Icon className={cn('h-5 w-5', `text-dynamic-${color}`)} />
      </div>

      {/* Title & Subtitle */}
      <div className="mb-1 font-semibold text-lg">{title}</div>
      <div className={cn('mb-2 text-sm', `text-dynamic-${color}`)}>
        {subtitle}
      </div>

      {/* Description */}
      <p className="mb-4 line-clamp-3 text-foreground/60 text-sm leading-relaxed">
        {description}
      </p>
    </div>
  );
}
