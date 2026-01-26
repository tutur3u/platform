import type { LucideIcon } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';

type FeatureColor = 'blue' | 'green' | 'purple' | 'cyan' | 'orange';

const colorStyles: Record<
  FeatureColor,
  { card: string; iconBg: string; icon: string; subtitle: string }
> = {
  blue: {
    card: 'border-dynamic-blue/20 bg-gradient-to-br from-dynamic-blue/5 via-background to-background hover:border-dynamic-blue/40',
    iconBg: 'bg-dynamic-blue/10',
    icon: 'text-dynamic-blue',
    subtitle: 'text-dynamic-blue',
  },
  green: {
    card: 'border-dynamic-green/20 bg-gradient-to-br from-dynamic-green/5 via-background to-background hover:border-dynamic-green/40',
    iconBg: 'bg-dynamic-green/10',
    icon: 'text-dynamic-green',
    subtitle: 'text-dynamic-green',
  },
  purple: {
    card: 'border-dynamic-purple/20 bg-gradient-to-br from-dynamic-purple/5 via-background to-background hover:border-dynamic-purple/40',
    iconBg: 'bg-dynamic-purple/10',
    icon: 'text-dynamic-purple',
    subtitle: 'text-dynamic-purple',
  },
  cyan: {
    card: 'border-dynamic-cyan/20 bg-gradient-to-br from-dynamic-cyan/5 via-background to-background hover:border-dynamic-cyan/40',
    iconBg: 'bg-dynamic-cyan/10',
    icon: 'text-dynamic-cyan',
    subtitle: 'text-dynamic-cyan',
  },
  orange: {
    card: 'border-dynamic-orange/20 bg-gradient-to-br from-dynamic-orange/5 via-background to-background hover:border-dynamic-orange/40',
    iconBg: 'bg-dynamic-orange/10',
    icon: 'text-dynamic-orange',
    subtitle: 'text-dynamic-orange',
  },
};

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  description: string;
  color: FeatureColor;
}

export function FeatureCard({
  icon: Icon,
  title,
  subtitle,
  description,
  color,
}: FeatureCardProps) {
  const styles = colorStyles[color];

  return (
    <div
      className={cn(
        'group relative h-full overflow-hidden rounded-xl border p-5 transition-all hover:shadow-lg',
        styles.card
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'mb-4 flex h-11 w-11 items-center justify-center rounded-lg transition-transform group-hover:scale-105',
          styles.iconBg
        )}
      >
        <Icon className={cn('h-5 w-5', styles.icon)} />
      </div>

      {/* Title & Subtitle */}
      <div className="mb-1 font-semibold text-lg">{title}</div>
      <div className={cn('mb-2 text-sm', styles.subtitle)}>{subtitle}</div>

      {/* Description */}
      <p className="mb-4 line-clamp-3 text-foreground/60 text-sm leading-relaxed">
        {description}
      </p>
    </div>
  );
}
