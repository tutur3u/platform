'use client';

import { AppErrorBoundary } from '@tuturuuu/ui/custom/app-error-boundary';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <AppErrorBoundary appName="Tools" error={error} reset={reset} />;
}
