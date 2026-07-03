'use client';

import { AlertTriangle, Home, RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';

interface InfrastructureDashboardErrorProps {
  description: string;
  error: Error & { digest?: string };
  reset?: () => void;
  title: string;
  unstable_retry?: () => void;
}

export function InfrastructureDashboardError({
  description,
  error,
  reset,
  title,
  unstable_retry,
}: InfrastructureDashboardErrorProps) {
  const retry = unstable_retry ?? reset;
  const reference = error.digest ?? error.message;

  return (
    <section className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-background shadow-sm">
        <div className="border-border border-b bg-foreground/5 px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="font-medium text-muted-foreground text-sm">
                Infrastructure Console
              </p>
              <h1 className="font-semibold text-2xl tracking-normal">
                {title}
              </h1>
              <p className="text-muted-foreground text-sm leading-6">
                {description}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          {reference ? (
            <div className="rounded-md border border-border bg-muted/40 px-4 py-3">
              <p className="font-medium text-muted-foreground text-xs uppercase">
                Error reference
              </p>
              <p className="mt-1 break-words font-mono text-sm">{reference}</p>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            {retry ? (
              <Button className="gap-2" onClick={() => retry()} type="button">
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            ) : null}
            <Button asChild className="gap-2" variant="secondary">
              <a href="/internal">
                <Home className="h-4 w-4" />
                Open internal root
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
