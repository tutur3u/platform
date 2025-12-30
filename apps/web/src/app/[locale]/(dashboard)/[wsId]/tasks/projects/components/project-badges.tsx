'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@tuturuuu/ui/badge';
import { Target, Circle } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';

export function HealthStatusBadge({ health }: { health: string | null }) {
  const t = useTranslations('task-projects.badges');

  if (!health) return null;
  const config = {
    on_track: {
      label: t('on_track'),
      className:
        'border-dynamic-green/40 bg-dynamic-green/10 text-dynamic-green',
      iconColor: 'text-dynamic-green',
    },
    at_risk: {
      label: t('at_risk'),
      className:
        'border-dynamic-yellow/40 bg-dynamic-yellow/10 text-dynamic-yellow',
      iconColor: 'text-dynamic-yellow',
    },
    off_track: {
      label: t('off_track'),
      className: 'border-dynamic-red/40 bg-dynamic-red/10 text-dynamic-red',
      iconColor: 'text-dynamic-red',
    },
  };
  const { label, className, iconColor } =
    config[health as keyof typeof config] || config.on_track;
  return (
    <Badge variant="outline" className={cn('text-xs', className)}>
      <Circle className={cn('mr-1 h-2 w-2 fill-current', iconColor)} />
      {label}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: string | null }) {
  const t = useTranslations('task-projects.badges');

  if (!priority) return null;
  const config = {
    critical: {
      label: t('critical'),
      className: 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red',
    },
    high: {
      label: t('high'),
      className:
        'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange',
    },
    normal: {
      label: t('normal'),
      className:
        'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow',
    },
    low: {
      label: t('low'),
      className: 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue',
    },
  };
  const { label, className } =
    config[priority as keyof typeof config] || config.normal;
  return (
    <Badge variant="outline" className={cn('text-xs', className)}>
      {label}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: string | null }) {
  const t = useTranslations('task-projects.status');

  if (!status) return null;
  return (
    <Badge variant="secondary" className="text-xs">
      <Target className="mr-1 h-3 w-3" />
      {t(status as any)}
    </Badge>
  );
}
