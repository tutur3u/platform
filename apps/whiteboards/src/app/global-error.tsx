'use client';

import { GlobalAppErrorBoundary } from '@tuturuuu/ui/custom/app-error-boundary';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <GlobalAppErrorBoundary appName="Whiteboards" error={error} reset={reset} />
  );
}
