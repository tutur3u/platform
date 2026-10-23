'use client';

import { JoinOutcome } from '@tuturuuu/meet-core/features/call/components/join-outcome';

export default function RoomError({ reset }: { reset: () => void }) {
  return <JoinOutcome reason="error" onRetry={reset} />;
}
