'use client';

import type { TulearnBootstrapResponse } from '@tuturuuu/internal-api';
import { SidebarStructure } from '@tuturuuu/satellite/sidebar-structure';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types/db';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { WorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { LearnerStudentSelect } from '@/components/learner-shell-parts';
import { WEB_APP_URL } from '@/constants/common';

interface StructureProps {
  bootstrap: TulearnBootstrapResponse;
  children: ReactNode;
  defaultCollapsed: boolean;
  footerActions: ReactNode;
  links: NavLink[];
  notificationPopover: ReactNode;
  userPopover: ReactNode;
  wsId: string;
}

export function Structure({
  bootstrap,
  children,
  defaultCollapsed,
  footerActions,
  links,
  notificationPopover,
  userPopover,
  wsId,
}: StructureProps) {
  const studentId = useSearchParams().get('studentId');
  const activeWorkspace = bootstrap.workspaces.find((item) => item.id === wsId);
  const studentLinks = useMemo(
    () =>
      studentId
        ? links.map((link) =>
            link.href
              ? {
                  ...link,
                  href: `${link.href}?studentId=${encodeURIComponent(studentId)}`,
                  aliases: [link.href, ...(link.aliases ?? [])],
                }
              : link
          )
        : links,
    [links, studentId]
  );

  return (
    <SidebarStructure
      actions={
        <div className="flex w-full min-w-0 items-center gap-2">
          <LearnerStudentSelect bootstrap={bootstrap} wsId={wsId} />
          {footerActions}
        </div>
      }
      appId="learn"
      brandHref={WEB_APP_URL}
      childContainerClassName="mx-auto w-full max-w-[1500px] px-4 py-5 md:px-6 md:py-8"
      defaultCollapsed={defaultCollapsed}
      links={studentLinks}
      notificationPopover={notificationPopover}
      showUpgrade={false}
      userPopover={userPopover}
      workspace={activeWorkspace ?? null}
      workspaceSelect={() => (
        <WorkspaceSelect
          cacheScope={bootstrap.profile.id}
          disableCreateNewWorkspace
          fetchWorkspaces={async () =>
            bootstrap.workspaces.map(
              (workspace): InternalApiWorkspaceSummary => ({
                access_type: 'member',
                avatar_url: workspace.avatar_url,
                id: workspace.id,
                logo_url: workspace.logo_url,
                name: workspace.name,
                personal: false,
              })
            )
          }
          resolveNextPathname={({ nextSlug }) => `/${nextSlug}`}
          showTierBadges={false}
          standalone
          wsId={wsId}
        />
      )}
      wsId={wsId}
    >
      {bootstrap.linkedStudents.some(
        (student) => student.workspace_id === wsId
      ) ? (
        <div className="mb-5 md:hidden">
          <LearnerStudentSelect bootstrap={bootstrap} wsId={wsId} />
        </div>
      ) : null}
      {children}
    </SidebarStructure>
  );
}
