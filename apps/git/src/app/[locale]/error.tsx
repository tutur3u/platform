'use client';

import { RotateCcw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="grid min-h-[70vh] place-items-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="font-semibold text-2xl">Unable to load this Git view</h1>
        <p className="text-muted-foreground text-sm">
          GitHub may be temporarily unavailable or rate limited.
        </p>
        <Button onClick={reset} variant="outline">
          <RotateCcw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    </main>
  );
}
