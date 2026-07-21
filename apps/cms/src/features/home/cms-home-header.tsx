import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FileText,
  RefreshCw,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';

export function CmsHomeHeader({
  description,
  isRefreshing,
  needsReview,
  libraryAction,
  libraryHref,
  onRefresh,
  previewAction,
  previewHref,
  statusDescription,
  statusTitle,
  title,
}: {
  description: string;
  isRefreshing: boolean;
  needsReview: boolean;
  libraryAction: string;
  libraryHref: string;
  onRefresh: () => void;
  previewAction: string;
  previewHref: string;
  statusDescription: string;
  statusTitle: string;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card/80">
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <Badge variant="secondary" className="gap-1.5 rounded-md">
            {needsReview ? (
              <AlertCircle className="size-3.5 text-dynamic-orange" />
            ) : (
              <CheckCircle2 className="size-3.5 text-dynamic-green" />
            )}
            {statusTitle}
          </Badge>
          <h1 className="mt-4 text-balance font-semibold text-2xl tracking-tight sm:text-3xl">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
            {description}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button asChild size="sm">
            <Link href={libraryHref}>
              <FileText className="mr-2 size-4" />
              {libraryAction}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={previewHref}>
              <Eye className="mr-2 size-4" />
              {previewAction}
            </Link>
          </Button>
          <Button
            aria-label={statusDescription}
            disabled={isRefreshing}
            onClick={onRefresh}
            size="icon"
            title={statusDescription}
            variant="ghost"
          >
            <RefreshCw
              className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>
      </div>

      <div className="border-border/70 border-t bg-background/40 px-5 py-3 text-muted-foreground text-xs leading-5 sm:px-6">
        {statusDescription}
      </div>
    </section>
  );
}
