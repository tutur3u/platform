import type { ReactNode } from 'react';
import { WorkspaceSelectRevealProvider } from './workspace-select-reveal';

interface SidebarWorkspaceSelectSectionProps {
  children?: ReactNode;
  id?: string;
  /** Renders nothing (no row at all) for apps without a workspace selector. */
  visible?: boolean;
}

/**
 * The workspace selector row. It is permanently in the sidebar flow with one
 * fixed geometry (same gutter and height in the rail and the panel), so the
 * avatar never moves and nothing is shown or hidden on demand.
 */
export function SidebarWorkspaceSelectSection({
  children,
  id = 'sidebar-workspace-selector',
  visible = true,
}: SidebarWorkspaceSelectSectionProps) {
  if (!visible || !children) return null;

  return (
    <WorkspaceSelectRevealProvider>
      <div
        className="shrink-0 border-b px-2 pb-2"
        data-sidebar-workspace-select
        id={id}
      >
        {children}
      </div>
    </WorkspaceSelectRevealProvider>
  );
}
