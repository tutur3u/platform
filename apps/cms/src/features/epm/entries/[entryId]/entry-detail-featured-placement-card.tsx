'use client';

import { CheckCircle2, Loader2 } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import type { EpmStrings } from '../../epm-strings';
import type { FeaturedPlacementConfig } from './entry-detail-shared';

type EntryDetailFeaturedPlacementCardProps = {
  config: FeaturedPlacementConfig;
  createPending: boolean;
  featuredPlacementActive: boolean;
  featuredPlacementIndex: number;
  featuredPlacementProcessing: boolean;
  featuredPlacementSlugsLength: number;
  onCreateConfig: () => void;
  onMove: (direction: -1 | 1) => void;
  onToggle: () => void;
  strings: EpmStrings;
};

export function EntryDetailFeaturedPlacementCard({
  config,
  createPending,
  featuredPlacementActive,
  featuredPlacementIndex,
  featuredPlacementProcessing,
  featuredPlacementSlugsLength,
  onCreateConfig,
  onMove,
  onToggle,
  strings,
}: EntryDetailFeaturedPlacementCardProps) {
  const processing = featuredPlacementProcessing || createPending;

  return (
    <Card className="overflow-hidden border-border/70 bg-card/95 shadow-none">
      <CardHeader className="border-border/60 border-b bg-[linear-gradient(135deg,rgba(245,158,11,0.1),rgba(251,191,36,0.03))]">
        <CardTitle>{strings.featuredPlacementTitle}</CardTitle>
        <CardDescription>{config.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {config.sectionEntry ? (
          <>
            <div className="rounded-[1.1rem] border border-border/70 bg-background/75 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-muted-foreground text-xs uppercase tracking-[0.24em]">
                    {config.featuredLabel}
                  </div>
                  <div className="font-medium">
                    {featuredPlacementActive
                      ? strings.featuredPlacementActiveLabel
                      : strings.featuredPlacementInactiveLabel}
                  </div>
                </div>
                <Badge
                  variant={featuredPlacementActive ? 'default' : 'outline'}
                >
                  {featuredPlacementActive
                    ? `${strings.featuredPlacementPositionLabel} ${featuredPlacementIndex + 1}`
                    : strings.noneLabel}
                </Badge>
              </div>
              <p className="mt-3 text-muted-foreground text-sm leading-6">
                {featuredPlacementActive
                  ? strings.featuredPlacementActiveDescription
                  : strings.featuredPlacementInactiveDescription}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <Button type="button" disabled={processing} onClick={onToggle}>
                {processing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                {featuredPlacementActive
                  ? strings.featuredPlacementRemoveAction
                  : strings.featuredPlacementAddAction}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={
                  processing ||
                  !featuredPlacementActive ||
                  featuredPlacementIndex === 0
                }
                onClick={() => onMove(-1)}
              >
                {strings.previousAction}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={
                  processing ||
                  !featuredPlacementActive ||
                  featuredPlacementIndex === featuredPlacementSlugsLength - 1
                }
                onClick={() => onMove(1)}
              >
                {strings.nextAction}
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-4 rounded-[1.1rem] border border-border/70 border-dashed bg-background/60 p-4">
            <div className="text-muted-foreground text-sm leading-6">
              {config.emptyState}
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={processing}
              onClick={onCreateConfig}
            >
              {processing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              {strings.featuredPlacementCreateAction}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
