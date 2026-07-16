'use client';

import type { LucideIcon } from '@tuturuuu/icons';
import {
  CheckCircle2,
  ShieldCheck,
  Smartphone,
  SquareTerminal,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { SquareProductionLaunchDetails } from './square-production-launch-details';
import {
  getSquareProductionLaunchProgress,
  type SquareProductionLaunchStageId,
} from './square-production-launch-progress';

const icons: Record<SquareProductionLaunchStageId, LucideIcon> = {
  hardware: SquareTerminal,
  connect: ShieldCheck,
  pair: Smartphone,
  verify: CheckCircle2,
};

export function SquareProductionLaunchGuide({
  connectionReady,
  deviceReady,
}: {
  connectionReady: boolean;
  deviceReady: boolean;
}) {
  const t = useTranslations('inventory.operator.square.guide.launch');
  const stages = getSquareProductionLaunchProgress({
    connectionReady,
    deviceReady,
  });
  const setupReady = connectionReady && deviceReady;
  const completed = stages.filter(
    (stage) => stage.status === 'complete'
  ).length;

  return (
    <div className="border-border border-t bg-muted/10">
      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{t('eyebrow')}</Badge>
            <Badge variant={setupReady ? 'default' : 'secondary'}>
              {setupReady ? t('status.ready') : t('status.inProgress')}
            </Badge>
          </div>
          <h4 className="mt-3 text-balance font-semibold text-lg tracking-tight">
            {t('title')}
          </h4>
          <p className="mt-1 max-w-3xl text-muted-foreground text-sm leading-6">
            {t('description')}
          </p>
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {t('automaticChecks')}
            </span>
            <span className="font-mono">{completed}/2</span>
          </div>
          <Progress value={(completed / 2) * 100} />
        </div>
      </div>

      <div className="grid gap-px border-border border-y bg-border sm:grid-cols-2 xl:grid-cols-4">
        {stages.map((stage, index) => {
          const Icon = icons[stage.id];
          const active =
            stage.status === 'ready' || stage.status === 'needsAction';
          const complete = stage.status === 'complete';

          return (
            <div className="bg-card p-4" key={stage.id}>
              <div className="flex items-start justify-between gap-3">
                <span
                  className={cn(
                    'grid size-9 place-items-center rounded-lg border border-border bg-muted/30 text-muted-foreground',
                    complete && 'border-primary/25 bg-primary/10 text-primary',
                    active && 'border-primary/25 text-foreground'
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="font-mono text-muted-foreground text-xs">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </div>
              <p className="mt-4 font-semibold text-sm">
                {t(`stages.${stage.id}.title`)}
              </p>
              <p className="mt-1 min-h-10 text-muted-foreground text-xs leading-5">
                {t(`stages.${stage.id}.description`)}
              </p>
              <Badge
                className="mt-3"
                variant={complete || active ? 'outline' : 'secondary'}
              >
                {t(`status.${stage.status}`)}
              </Badge>
            </div>
          );
        })}
      </div>

      <SquareProductionLaunchDetails setupReady={setupReady} />
    </div>
  );
}
