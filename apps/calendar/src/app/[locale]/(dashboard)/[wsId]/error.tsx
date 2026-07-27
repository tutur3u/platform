'use client';

import { AppErrorBoundary } from '@tuturuuu/ui/custom/app-error-boundary';

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <AppErrorBoundary appName="Calendar" error={error} reset={reset} />;
}
