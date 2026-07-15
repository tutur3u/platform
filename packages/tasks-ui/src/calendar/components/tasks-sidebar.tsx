import type { ExtendedWorkspaceTask } from '@tuturuuu/ui/time-tracker/types';
import { CalendarSidebar } from './sidebar';

interface TasksSidebarProps {
  resolvedWsId: string;
  locale: string;
  userId: string;
  tasks?: ExtendedWorkspaceTask[];
}

export default function TasksSidebar({
  resolvedWsId,
  locale,
  userId,
  tasks = [],
}: TasksSidebarProps) {
  // Personal workspace = workspace ID matches user ID (no need for auto-assignment)
  const isPersonalWorkspace = resolvedWsId === userId;

  return (
    <CalendarSidebar
      // IMPORTANT: child components (task scheduler, schedule endpoints) expect a UUID.
      // Always pass the resolved workspace UUID, not the route slug (e.g. "personal").
      wsId={resolvedWsId}
      assigneeId={userId}
      tasks={tasks}
      locale={locale}
      isPersonalWorkspace={isPersonalWorkspace}
    />
  );
}
