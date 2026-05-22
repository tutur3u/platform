'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';

type Props = {
  boardTitle: string;
  edgeCount: number;
  nodeCount: number;
  tagCount: number;
};

export function MindDashboardHeader({
  boardTitle,
  edgeCount,
  nodeCount,
  tagCount,
}: Props) {
  const t = useTranslations('mind');

  return (
    <header className="pointer-events-none absolute top-3 left-3 z-20">
      <div className="pointer-events-auto min-w-0 max-w-[min(28rem,calc(100vw-12rem))] rounded-xl border border-border bg-background/90 px-3 py-2 shadow-foreground/5 shadow-xl backdrop-blur">
        <h2 className="truncate font-semibold text-lg tracking-normal">
          {boardTitle}
        </h2>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge className="h-5 px-1.5 text-[11px]" variant="secondary">
            {t('counts.nodes', { count: nodeCount })}
          </Badge>
          <Badge className="h-5 px-1.5 text-[11px]" variant="secondary">
            {t('counts.edges', { count: edgeCount })}
          </Badge>
          <Badge className="h-5 px-1.5 text-[11px]" variant="secondary">
            {t('counts.tags', { count: tagCount })}
          </Badge>
        </div>
      </div>
    </header>
  );
}
