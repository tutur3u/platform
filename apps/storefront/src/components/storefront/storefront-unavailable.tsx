'use client';

import { RefreshCw, Store } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';

export function StorefrontUnavailable({
  description,
  eyebrow,
  hint,
  onRetry,
  retryLabel,
  title,
}: {
  description: string;
  eyebrow: string;
  hint: string;
  onRetry: () => void;
  retryLabel: string;
  title: string;
}) {
  return (
    <main className="relative grid min-h-dvh overflow-hidden bg-background px-5 py-12 sm:px-8">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/35 to-transparent"
      />
      <section className="relative m-auto grid w-full max-w-3xl overflow-hidden rounded-3xl border border-border bg-card shadow-2xl shadow-foreground/5 md:grid-cols-[0.78fr_1.22fr]">
        <div className="relative grid min-h-56 place-items-center overflow-hidden border-border border-b bg-muted/20 p-8 md:min-h-[28rem] md:border-r md:border-b-0">
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,var(--muted),transparent_68%)]"
          />
          <div className="relative grid size-24 place-items-center rounded-3xl border border-border bg-background shadow-sm">
            <Store className="size-10 text-muted-foreground" />
          </div>
        </div>
        <div className="flex flex-col justify-center p-7 sm:p-10">
          <p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.2em]">
            {eyebrow}
          </p>
          <h1 className="mt-4 text-balance font-semibold text-3xl tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 max-w-lg text-pretty text-muted-foreground leading-7">
            {description}
          </p>
          <div className="mt-6 rounded-xl border border-border bg-muted/25 p-4 text-muted-foreground text-sm leading-6">
            {hint}
          </div>
          <Button className="mt-7 w-fit gap-2" onClick={onRetry} type="button">
            <RefreshCw className="size-4" />
            {retryLabel}
          </Button>
        </div>
      </section>
    </main>
  );
}
