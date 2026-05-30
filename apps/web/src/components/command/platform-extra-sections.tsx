'use client';

import { useRouter } from 'next/navigation';
import type { NavLink } from '@/components/navigation';
import { ProductActionsSection } from './sections/product-actions-section';
import { QuickActionsSection } from './sections/quick-actions-section';
import { RecentSection } from './sections/recent-section';
import { TaskSection } from './sections/task-section';
import type { CommandAction } from './utils/command-actions';
import { useNavigationData } from './utils/use-navigation-data';
import { useTaskSearch } from './utils/use-task-search';

export function PlatformCommandExtraSections({
  navLinks,
  onClose,
  onApplySearch,
  query,
  workspaceId,
  workspaceName,
}: {
  navLinks: (NavLink | null)[];
  onApplySearch: (query: string) => void;
  onClose: () => void;
  query: string;
  workspaceId?: string | null;
  workspaceName?: string | null;
}) {
  const router = useRouter();
  const flattenedNav = useNavigationData(navLinks);
  const { isLoading: isLoadingTasks, tasks } = useTaskSearch(
    workspaceId ?? null,
    query,
    Boolean(workspaceId)
  );

  const handleOpenAction = (action: CommandAction) => {
    router.push(action.targetHref);
    onClose();
  };

  return (
    <>
      {!query.trim() && (
        <RecentSection
          query={query}
          onApplySearch={onApplySearch}
          onSelect={onClose}
        />
      )}
      <QuickActionsSection query={query} onSelect={onClose} />
      <ProductActionsSection
        navItems={flattenedNav}
        onOpenAction={handleOpenAction}
        onSelect={onClose}
        query={query}
      />
      <TaskSection
        isLoading={isLoadingTasks}
        onSelect={onClose}
        query={query}
        tasks={tasks}
        workspaceName={workspaceName ?? undefined}
      />
    </>
  );
}
