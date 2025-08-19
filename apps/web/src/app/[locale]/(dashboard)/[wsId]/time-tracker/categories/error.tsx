'use client';

import { Button } from '@tuturuuu/ui/button';
import { AlertTriangle } from '@tuturuuu/ui/icons';
import { useEffect } from 'react';

export default function CategoriesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Categories page error:', error);
  }, [error]);

  return (
    <div className="container mx-auto p-6">
      <div className="flex flex-col items-center justify-center space-y-4 py-12">
        <AlertTriangle className="h-16 w-16 text-destructive" />
        <h2 className="font-bold text-2xl">Something went wrong!</h2>
        <p className="max-w-md text-center text-muted-foreground">
          We encountered an error while loading the time tracking categories.
          Please try again or contact support if the problem persists.
        </p>
        <div className="flex space-x-2">
          <Button onClick={reset} variant="default">
            Try again
          </Button>
          <Button
            onClick={() => {
              window.location.href = '/dashboard';
            }}
            variant="outline"
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
