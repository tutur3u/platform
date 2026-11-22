import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import {
  type WorkspaceSelectOpenRequest,
  WorkspaceSelectRevealProvider,
} from './workspace-select-reveal';

interface SidebarWorkspaceSelectSectionProps {
  children?: ReactNode;
  id?: string;
  openRequest?: WorkspaceSelectOpenRequest;
  visible: boolean;
}

/**
 * Keeps the workspace selector in the sidebar flow while animating its height.
 * The closed state intentionally collapses to zero so navigation keeps the
 * same top gap in apps that do not expose a workspace selector at all.
 */
export function SidebarWorkspaceSelectSection({
  children,
  id = 'sidebar-workspace-selector',
  openRequest,
  visible,
}: SidebarWorkspaceSelectSectionProps) {
  return (
    <WorkspaceSelectRevealProvider openRequest={openRequest} revealed={visible}>
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
        id={id}
        inert={visible ? undefined : true}
        style={{
          // Satellite source files are outside each app's Tailwind scan root.
          // Keep the critical height transition identical to apps/web even when
          // arbitrary grid utilities are not emitted by a satellite build.
          gridTemplateRows: visible ? '1fr' : '0fr',
          transitionProperty:
            'grid-template-rows, opacity, border-color, padding',
        }}
      >
        <div className="min-h-0 overflow-hidden">{children}</div>
      </div>
    </WorkspaceSelectRevealProvider>
  );
}
