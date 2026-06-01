'use client';

import { OverviewDescription } from './overview/description-card';
import { OverviewLinkedDocuments } from './overview/linked-documents-card';
import { OverviewLinkedTasks } from './overview/linked-tasks-card';
import { OverviewUpdates } from './overview/updates-card';
import { ProjectConfiguration } from './project-configuration';
import { ProjectSidebar } from './project-sidebar';

export function OverviewTab() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Main content area */}
      <div className="space-y-4 lg:col-span-2">
        {/* Description Card */}
        <OverviewDescription />

        {/* Project Configuration - Collapsible */}
        <ProjectConfiguration />

        {/* Recent Updates */}
        <OverviewUpdates />

        {/* Recent Tasks */}
        <OverviewLinkedTasks />

        {/* Linked Documents */}
        <OverviewLinkedDocuments />
      </div>

      {/* Metadata sidebar */}
      <ProjectSidebar />
    </div>
  );
}
