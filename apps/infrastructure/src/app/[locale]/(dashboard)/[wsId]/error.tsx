'use client';

import { InfrastructureDashboardError } from '../_components/infrastructure-dashboard-error';

export default function WorkspaceDashboardErrorPage({
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
      description="The workspace layout is still available, but this infrastructure view hit an unexpected render error."
      error={error}
      reset={reset}
      title="This infrastructure view could not load"
      unstable_retry={unstable_retry}
    />
  );
}
