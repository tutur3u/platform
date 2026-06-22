import type { LucideIcon } from '@tuturuuu/icons/lucide';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import type { ReactNode } from 'react';
import type { ContributorTone } from './types';

export const toneClasses: Record<
  ContributorTone,
  {
    badge: string;
    card: string;
    icon: string;
    iconFrame: string;
    text: string;
  }
> = {
  amber: {
    badge: 'border-dynamic-amber/30 bg-dynamic-amber/10 text-dynamic-amber',
    card: 'border-dynamic-amber/30 bg-linear-to-br from-dynamic-amber/5 via-background to-background hover:border-dynamic-amber/50 hover:shadow-dynamic-amber/10',
    icon: 'text-dynamic-amber',
    iconFrame: 'bg-dynamic-amber/10',
    text: 'text-dynamic-amber',
  },
  blue: {
    badge: 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue',
    card: 'border-dynamic-blue/30 bg-linear-to-br from-dynamic-blue/5 via-background to-background hover:border-dynamic-blue/50 hover:shadow-dynamic-blue/10',
    icon: 'text-dynamic-blue',
    iconFrame: 'bg-dynamic-blue/10',
    text: 'text-dynamic-blue',
  },
  cyan: {
    badge: 'border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan',
    card: 'border-dynamic-cyan/30 bg-linear-to-br from-dynamic-cyan/5 via-background to-background hover:border-dynamic-cyan/50 hover:shadow-dynamic-cyan/10',
    icon: 'text-dynamic-cyan',
    iconFrame: 'bg-dynamic-cyan/10',
    text: 'text-dynamic-cyan',
  },
  green: {
    badge: 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
    card: 'border-dynamic-green/30 bg-linear-to-br from-dynamic-green/5 via-background to-background hover:border-dynamic-green/50 hover:shadow-dynamic-green/10',
    icon: 'text-dynamic-green',
    iconFrame: 'bg-dynamic-green/10',
    text: 'text-dynamic-green',
  },
  pink: {
    badge: 'border-dynamic-pink/30 bg-dynamic-pink/10 text-dynamic-pink',
    card: 'border-dynamic-pink/30 bg-linear-to-br from-dynamic-pink/5 via-background to-background hover:border-dynamic-pink/50 hover:shadow-dynamic-pink/10',
    icon: 'text-dynamic-pink',
    iconFrame: 'bg-dynamic-pink/10',
    text: 'text-dynamic-pink',
  },
  purple: {
    badge: 'border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple',
    card: 'border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/5 via-background to-background hover:border-dynamic-purple/50 hover:shadow-dynamic-purple/10',
    icon: 'text-dynamic-purple',
    iconFrame: 'bg-dynamic-purple/10',
    text: 'text-dynamic-purple',
  },
};

export function joinClassNames(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function SectionIntro({
  badge,
  children,
  icon: Icon,
  tone,
}: {
  badge: string;
  children: ReactNode;
  icon: LucideIcon;
  tone: ContributorTone;
}) {
  return (
    <div className="mb-16 text-center">
      <Badge
        className={joinClassNames('mb-4', toneClasses[tone].badge)}
        variant="secondary"
      >
        <Icon className="mr-1.5 h-3.5 w-3.5" />
        {badge}
      </Badge>
      {children}
    </div>
  );
}

export function ChartCard({
  children,
  description,
  tone,
  title,
}: {
  children: ReactNode;
  description: string;
  tone: ContributorTone;
  title: string;
}) {
  return (
    <Card
      className={joinClassNames(
        'h-full overflow-hidden p-8 transition-all duration-300 hover:shadow-md',
        toneClasses[tone].card
      )}
    >
      <div className="mb-6">
        <h3 className="mb-2 font-bold text-2xl">{title}</h3>
        <p className="text-foreground/60 text-sm">{description}</p>
      </div>
      {children}
    </Card>
  );
}
