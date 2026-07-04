'use client';

import { InfrastructureDashboardError } from './_components/infrastructure-dashboard-error';

export default function DashboardErrorPage({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  return (
    <InfrastructureDashboardError
      description="The dashboard shell could not finish loading. You can retry the render or return to the internal root."
      error={error}
      reset={reset}
      title="Infrastructure shell interrupted"
      unstable_retry={unstable_retry}
    />
  );
}
