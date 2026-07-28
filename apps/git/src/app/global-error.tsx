'use client';

import { Button } from '@tuturuuu/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
        <main className="max-w-lg space-y-4 text-center">
          <p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.24em]">
            Tuturuuu Git
          </p>
          <h1 className="font-semibold text-3xl">
            The repository view failed.
          </h1>
          <p className="text-muted-foreground">
            {error.digest
              ? `Reference ${error.digest}`
              : 'Try the request again in a moment.'}
          </p>
          <Button onClick={reset}>Try again</Button>
        </main>
      </body>
    </html>
  );
}
