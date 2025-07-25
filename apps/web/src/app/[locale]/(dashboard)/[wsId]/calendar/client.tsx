'use client';

import AddEventButton from './components/add-event-button';
import AddEventModal from './components/add-event-dialog';
import AutoScheduleComprehensiveDialog from './components/auto-schedule-comprehensive-dialog';
import TestEventGeneratorButton from './components/test-event-generator-button';
import CalendarSidebar from './components/calendar-sidebar';
import { DEV_MODE } from '@/constants/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Workspace,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { PanelLeftClose, PanelRightClose, Sparkles } from '@tuturuuu/ui/icons';
import { SmartCalendar } from '@tuturuuu/ui/legacy/calendar/smart-calendar';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export default function CalendarClientPage({
  experimentalGoogleToken,
  workspace,
}: {
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
  workspace: Workspace;
}) {
  const t = useTranslations('calendar');
  const locale = useLocale();
  const [isAddEventModalOpen, setIsAddEventModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const openAddEventDialog = () => setIsAddEventModalOpen(true);
  const closeAddEventDialog = () => setIsAddEventModalOpen(false);

  // Sidebar toggle button for header
  const sidebarToggleButton = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      onClick={() => setSidebarOpen((open) => !open)}
      className="h-7 w-7"
    >
      {sidebarOpen ? (
        <PanelRightClose className="h-5 w-5 text-muted-foreground" />
      ) : (
        <PanelLeftClose className="h-5 w-5 text-muted-foreground" />
      )}
    </Button>
  );

  const extras =
    workspace.id === ROOT_WORKSPACE_ID ? (
      <div className="grid w-full items-center gap-2 md:flex md:w-auto">
        <AddEventButton onOpenDialog={openAddEventDialog} />
        {DEV_MODE && <TestEventGeneratorButton wsId={workspace.id} />}
        <AutoScheduleComprehensiveDialog wsId={workspace.id}>
          <Button
            variant="default"
            size="sm"
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 md:w-fit"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Auto-Schedule
          </Button>
        </AutoScheduleComprehensiveDialog>
      </div>
    ) : undefined;

  return (
    <>
      <div className="flex h-full">
        {isMounted && sidebarOpen && <CalendarSidebar onClose={() => setSidebarOpen(false)} />}
        <div className="flex-1">
          <SmartCalendar
            t={t}
            locale={locale}
            workspace={workspace}
            useQuery={useQuery}
            useQueryClient={useQueryClient}
            experimentalGoogleToken={
              experimentalGoogleToken?.ws_id === workspace.id
                ? experimentalGoogleToken
                : null
            }
            extras={extras}
            onSidebarToggle={() => setSidebarOpen((open) => !open)}
            sidebarToggleButton={sidebarToggleButton}
          />
        </div>
      </div>
      <AddEventModal
        wsId={workspace.id}
        isOpen={isAddEventModalOpen}
        onClose={closeAddEventDialog}
      />
    </>
  );
}
