import { AlertCircle, CheckCircle2 } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import type { CmsStrings } from '../../cms-strings';
import type {
  EntryPublishReadiness,
  EntryPublishReadinessCheckId,
} from './entry-detail-publish-readiness';

function getCheckLabel(id: EntryPublishReadinessCheckId, strings: CmsStrings) {
  switch (id) {
    case 'content':
      return strings.readinessContentLabel;
    case 'cover':
      return strings.readinessCoverLabel;
    case 'slug':
      return strings.readinessSlugLabel;
    default:
      return strings.readinessTitleLabel;
  }
}

export function EntryDetailPublishReadinessCard({
  readiness,
  strings,
}: {
  readiness: EntryPublishReadiness;
  strings: CmsStrings;
}) {
  return (
    <Card className="overflow-hidden border-border/70 bg-card/95 shadow-none">
      <CardHeader className="border-border/60 border-b bg-background/35">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{strings.publishReadinessTitle}</CardTitle>
            <CardDescription className="mt-1.5 max-w-xl leading-5">
              {strings.publishReadinessDescription}
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'gap-1.5 rounded-full',
              readiness.isComplete
                ? 'border-dynamic-green/35 bg-dynamic-green/10 text-dynamic-green'
                : 'border-dynamic-orange/35 bg-dynamic-orange/10 text-dynamic-orange'
            )}
          >
            {readiness.isComplete ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5" />
            )}
            {readiness.completeCount}/{readiness.totalCount}{' '}
            {readiness.isComplete
              ? strings.readinessReadyLabel
              : strings.readinessReviewLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 p-4 sm:grid-cols-2">
        {readiness.items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/55 px-3 py-2.5"
          >
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border',
                item.complete
                  ? 'border-dynamic-green/35 bg-dynamic-green/10 text-dynamic-green'
                  : 'border-dynamic-orange/35 bg-dynamic-orange/10 text-dynamic-orange'
              )}
            >
              {item.complete ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-sm">
                {getCheckLabel(item.id, strings)}
              </span>
              <span className="block text-muted-foreground text-xs">
                {item.complete
                  ? strings.readinessCompleteLabel
                  : strings.readinessMissingLabel}
              </span>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
