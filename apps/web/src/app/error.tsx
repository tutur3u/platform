'use client'; // Error components must be Client Components

import { Button } from '@/components/ui/button';
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="absolute inset-0 mx-4 mb-8 mt-24 flex flex-col items-center justify-center text-center md:mx-32 lg:mx-64">
      <h1 className="text-xl font-bold">Something went wrong.</h1>
      <p className="mb-4 font-semibold opacity-75">
        {error?.message || error?.digest || 'Unknown error'}
      </p>

      <Button onClick={() => reset()}>Try again</Button>
    </div>
  );
}
