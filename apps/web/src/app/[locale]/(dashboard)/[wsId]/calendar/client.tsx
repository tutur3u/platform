'use client';

import AddEventButton from './components/add-event-button';
import AddEventModal from './components/add-event-dialog';
import AutoScheduleComprehensiveDialog from './components/auto-schedule-comprehensive-dialog';
import CalendarSidebar from './components/calendar-sidebar';
import TasksSidebarContent from './components/tasks-sidebar-content';
import TestEventGeneratorButton from './components/test-event-generator-button';
import { useTasksData, useAIChatData } from './hooks';
import { DEV_MODE } from '@/constants/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Workspace,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import {
  PanelLeftClose,
  PanelRightClose,
  Plus,
  Sparkles,
} from '@tuturuuu/ui/icons';
import { SmartCalendar } from '@tuturuuu/ui/legacy/calendar/smart-calendar';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
  const [othersSidebarOpen, setOthersSidebarOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const openAddEventDialog = () => setIsAddEventModalOpen(true);
  const closeAddEventDialog = () => setIsAddEventModalOpen(false);

  // Fetch tasks data using custom hook
  const { data: tasksData } = useTasksData(workspace.id, othersSidebarOpen);

  // Fetch AI chat data using custom hook
  const { data: aiChatData } = useAIChatData(workspace.id, othersSidebarOpen);

  // Sidebar toggle button for header (left sidebar)
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
        {/* Add Task button - only show when others sidebar is open */}
        {othersSidebarOpen && (
          <AddEventButton onOpenDialog={openAddEventDialog} />
        )}
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
        {/* New "Others" button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOthersSidebarOpen((open) => !open)}
          className="w-full md:w-fit"
        >
          <Plus className="mr-2 h-4 w-4" />
          Tasks & AI
        </Button>
      </div>
    ) : undefined;

  // Adapt TanStack's QueryClient to SmartCalendar's expected API
  const tanstackQueryClient = useQueryClient();
  const memoizedQueryClientAdapter = useMemo(
    () => ({
      invalidateQueries: (
        options: string[] | { queryKey: string[]; refetchType?: string }
      ) => {
        if (Array.isArray(options)) {
          return tanstackQueryClient.invalidateQueries({ queryKey: options });
        }
        const { queryKey, refetchType } = options;
        return tanstackQueryClient.invalidateQueries({
          queryKey,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          refetchType: refetchType as any,
        });
      },
      setQueryData: (queryKey: string[], data: unknown) => {
        tanstackQueryClient.setQueryData(queryKey, data);
      },
    }),
    [tanstackQueryClient]
  );
  const wrappedUseQueryClient = useCallback(
    () => memoizedQueryClientAdapter,
    [memoizedQueryClientAdapter]
  );

  return (
    <>
      <div className="flex h-full">
        {/* Left sidebar (existing) */}
        {isMounted && sidebarOpen && <CalendarSidebar />}

        {/* Main calendar content */}
        <div className="flex-1">
          <SmartCalendar
            t={(key: string, values?: Record<string, unknown>) => {
              // next-intl uses conditional types; adapt to generic string keys
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return t(key as any, values as any);
            }}
            locale={locale}
            workspace={workspace}
            useQuery={useQuery}
            useQueryClient={wrappedUseQueryClient}
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

        {/* Right sidebar (tasks and AI chat) - only show when others sidebar is open */}
        {isMounted && othersSidebarOpen && (
          <TasksSidebarContent
            wsId={workspace.id}
            assigneeId={workspace.creator_id || workspace.id}
            locale={locale}
            tasks={tasksData?.tasks || []}
            hasKeys={aiChatData?.hasKeys || { openAI: false, anthropic: false, google: false }}
            chats={aiChatData?.chats || []}
            count={aiChatData?.count || 0}
            hasAiChatAccess={aiChatData?.hasAiChatAccess || false}
          />
        )}
      </div>
      <AddEventModal
        wsId={workspace.id}
        isOpen={isAddEventModalOpen}
        onClose={closeAddEventDialog}
      />
    </>
  );
}
