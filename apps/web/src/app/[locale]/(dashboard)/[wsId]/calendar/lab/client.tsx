'use client';

import type { Workspace } from '@tuturuuu/types';

interface CalendarLabClientPageProps {
  workspace: Workspace;
}

export default function CalendarLabClientPage({
  workspace,
}: CalendarLabClientPageProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center space-y-4">
      <h1 className="text-2xl font-bold">Calendar Algorithm Lab</h1>
      <p className="text-muted-foreground">
        Workspace: {workspace.name || workspace.id}
      </p>
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p>Simulation Engine coming soon...</p>
      </div>
    </div>
  );
}
