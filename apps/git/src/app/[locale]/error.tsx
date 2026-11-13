'use client';

import { AppErrorBoundary } from '@tuturuuu/ui/custom/app-error-boundary';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppErrorBoundary appName="Git" chrome="page" error={error} reset={reset} />
  );
}
