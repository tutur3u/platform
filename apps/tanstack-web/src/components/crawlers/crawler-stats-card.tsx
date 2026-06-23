import { ArrowUpRight, BugPlay, Globe } from '@tuturuuu/icons';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import Link from 'next/link';
import type { CrawlerReadOnlyLabels } from './types';

export function CrawlerStatsCard({
  domainsCount,
  labels,
  uncrawledCount,
  uncrawledHref,
}: {
  domainsCount: number;
  labels: CrawlerReadOnlyLabels;
  uncrawledCount: number;
  uncrawledHref: string;
}) {
  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{labels.stats.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Link
          className="grid gap-4 rounded-md border border-border bg-muted/30 p-4 transition-colors hover:bg-muted/50 md:grid-cols-[1fr_1fr_auto]"
          href={uncrawledHref}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <BugPlay className="h-4 w-4" />
              {labels.stats.uncrawledUrls}
            </div>
            <div className="font-semibold text-3xl tabular-nums">
              {uncrawledCount}
            </div>
            <p className="text-muted-foreground text-sm">
              {uncrawledCount === 0
                ? labels.stats.allCaughtUp
                : labels.stats.waitingToBeCrawled}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Globe className="h-4 w-4" />
              {labels.stats.domains}
            </div>
            <div className="font-semibold text-3xl tabular-nums">
              {domainsCount}
            </div>
            <p className="text-muted-foreground text-sm">
              {labels.stats.uniqueDomainsDiscovered}
            </p>
          </div>

          <div className="flex items-start justify-end text-muted-foreground">
            <ArrowUpRight className="h-4 w-4" />
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}
