'use client';

import { useActiveTimerSession } from '@tuturuuu/hooks/hooks/use-active-timer-session';
import { ActiveTimerIndicator } from '@/components/active-timer-indicator';

interface SidebarActiveTimerProps {
  isCollapsed: boolean;
  wsId: string;
}

export function SidebarActiveTimer({
  isCollapsed,
  wsId,
}: SidebarActiveTimerProps) {
  const { data: activeTimerSession } = useActiveTimerSession(wsId);

  if (!activeTimerSession) {
    return null;
  }

  return (
    <div className="p-2 pt-0">
      <ActiveTimerIndicator
        wsId={wsId}
        session={activeTimerSession}
        isCollapsed={isCollapsed}
      />
    </div>
  );
}
