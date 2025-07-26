'use client';

import { useState } from 'react';
import type { Workspace, WorkspaceCalendarGoogleToken } from '@tuturuuu/types/db';
import CalendarClientPage from './client';

interface CalendarPageClientProps {
  wsId: string;
  locale: string;
  workspace: Workspace;
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
}

export default function CalendarPageClient({
  wsId, locale, workspace, experimentalGoogleToken,
}: CalendarPageClientProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSidebarToggle = () => {
    setSidebarOpen((open) => !open);
  };

  return (
    <div className="flex h-full">
      <CalendarClientPage
        experimentalGoogleToken={experimentalGoogleToken}
        workspace={workspace}
        hideHeader={false}
        sidebarOpen={sidebarOpen}
        onSidebarToggle={handleSidebarToggle}
      />
    </div>
  );
}
