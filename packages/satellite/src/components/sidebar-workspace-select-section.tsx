import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

interface SidebarWorkspaceSelectSectionProps {
  children?: ReactNode;
  visible: boolean;
}

/**
 * Keeps the workspace selector in the sidebar flow while animating its height.
 * The closed state intentionally collapses to zero so navigation keeps the
 * same top gap in apps that do not expose a workspace selector at all.
 */
export function SidebarWorkspaceSelectSection({
  children,
  visible,
}: SidebarWorkspaceSelectSectionProps) {
  return (
    <div
      aria-hidden={!visible}
      className={cn(
        'grid shrink-0 overflow-hidden px-2 transition-[grid-template-rows,opacity,border-color,padding] duration-200 ease-out',
        visible
          ? 'grid-rows-[1fr] border-b pb-2 opacity-100'
          : 'pointer-events-none grid-rows-[0fr] border-transparent pb-0 opacity-0'
      )}
      data-sidebar-workspace-select
      data-state={visible ? 'open' : 'closed'}
      id="sidebar-workspace-selector"
      inert={visible ? undefined : true}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
