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

function formatUnknownErrorValue(value: unknown): string | null {
  if (value == null) return null;

  if (value instanceof Error) {
    return [value.name, value.message].filter(Boolean).join(': ');
  }

  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function InfrastructureDashboardError({
  description,
  error,
  reset,
  title,
  unstable_retry,
}: InfrastructureDashboardErrorProps) {
  const retry = unstable_retry ?? reset;
  const errorName = error.name || 'Error';
  const errorMessage = error.message || 'No error message was exposed.';
  const errorDigest = error.digest;
  const errorCause = formatUnknownErrorValue(
    (error as Error & { cause?: unknown }).cause
  );
  const errorStack = error.stack?.trim();

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
          <div className="rounded-md border border-border bg-muted/40 px-4 py-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-medium text-muted-foreground text-xs uppercase">
                Captured error
              </p>
              {errorDigest ? (
                <p className="break-all font-mono text-muted-foreground text-xs">
                  digest: {errorDigest}
                </p>
              ) : null}
            </div>

            <dl className="mt-3 grid gap-3 text-sm">
              <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
                <dt className="font-medium text-muted-foreground">Name</dt>
                <dd className="break-words font-mono">{errorName}</dd>
              </div>
              <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
                <dt className="font-medium text-muted-foreground">Message</dt>
                <dd className="break-words font-mono">{errorMessage}</dd>
              </div>
              {errorCause ? (
                <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
                  <dt className="font-medium text-muted-foreground">Cause</dt>
                  <dd className="whitespace-pre-wrap break-words font-mono">
                    {errorCause}
                  </dd>
                </div>
              ) : null}
            </dl>

            {errorStack ? (
              <details className="mt-4" open>
                <summary className="cursor-pointer font-medium text-muted-foreground text-xs uppercase">
                  Stack trace
                </summary>
                <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-border bg-background p-3 text-xs leading-5">
                  <code>{errorStack}</code>
                </pre>
              </details>
            ) : (
              <p className="mt-4 text-muted-foreground text-xs leading-5">
                Stack trace unavailable. Server-rendered errors may be redacted
                in production; use the digest above with Vercel logs.
              </p>
            )}
          </div>

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
