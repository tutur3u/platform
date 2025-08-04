'use client';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useCallback } from 'react';
import { DEV_MODE, TASKS_LIMIT } from '@/constants/common';
import { isSameDay, isSameMonth } from '@/utils/date-helper';
import { useCalendarState } from './calendar-state-context';
import AddEventButton from './components/add-event-button';
import AddEventModal from './components/add-event-dialog';
import AutoScheduleComprehensiveDialog from './components/auto-schedule-comprehensive-dialog';
import CalendarSidebar from './components/calendar-sidebar';
import TasksSidebarContent from './components/tasks-sidebar-content';
import TestEventGeneratorButton from './components/test-event-generator-button';

interface CalendarPageClientProps {
  wsId: string;
  locale: string;
  workspace: Workspace;
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
}

export default function CalendarPageClient({
  locale,
  workspace,
  experimentalGoogleToken,
}: CalendarPageClientProps) {
  const t = useTranslations('calendar');
  const [isAddEventModalOpen, setIsAddEventModalOpen] = useState(false);
  const [calendarSidebarOpen, setCalendarSidebarOpen] = useState(false);
  const [othersSidebarOpen, setOthersSidebarOpen] = useState(false);
  const { date, setDate, view, setView, availableViews } = useCalendarState();

  // Fetch tasks data with configurable limit
  const { data: tasksData } = useQuery({
    queryKey: ['tasks', workspace.id, TASKS_LIMIT],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${workspace.id}/tasks?limit=${TASKS_LIMIT}`
      );
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    },
    enabled: othersSidebarOpen, // Only fetch when sidebar is open
    staleTime: 30000, // Cache for 30 seconds
  });

  const handleNext = useCallback(() => {
    const newDate = new Date(date);
    if (view === 'day') {
      newDate.setDate(newDate.getDate() + 1);
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else if (view === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setDate(newDate);
  }, [date, view, setDate]);

  const handlePrev = useCallback(() => {
    const newDate = new Date(date);
    if (view === 'day') {
      newDate.setDate(newDate.getDate() - 1);
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else if (view === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    }
    setDate(newDate);
  }, [date, view, setDate]);

  const selectToday = () => {
    setDate(new Date());
  };

  const isToday = () => {
    return isSameDay(date, new Date());
  };

  const isCurrentMonth = () => {
    return isSameMonth(date, new Date());
  };

  const onViewChange = (newView: string) => {
    setView(newView as 'day' | '4-days' | 'week' | 'month');
  };

  const views = availableViews.map((v) => ({
    value: v.value,
    label: v.label,
    disabled: v.disabled,
  }));

  const openAddEventDialog = () => setIsAddEventModalOpen(true);
  const closeAddEventDialog = () => setIsAddEventModalOpen(false);

  // Sidebar toggle button for header (left sidebar)
  const sidebarToggleButton = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={calendarSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      onClick={() => setCalendarSidebarOpen((open) => !open)}
      className="h-7 w-7"
    >
      {calendarSidebarOpen ? (
        <PanelRightClose className="h-5 w-5 text-muted-foreground" />
      ) : (
        <PanelLeftClose className="h-5 w-5 text-muted-foreground" />
      )}
    </Button>
  );

  const extras = (
    <div className="flex items-center gap-2">
      {/* Add Task button - only show when others sidebar is open */}
      {othersSidebarOpen && (
        <AddEventButton onOpenDialog={openAddEventDialog} />
      )}
      {DEV_MODE && <TestEventGeneratorButton wsId={workspace.id} />}
      <AutoScheduleComprehensiveDialog wsId={workspace.id}>
        <Button
          variant="default"
          size="sm"
          className="bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Auto-Schedule
        </Button>
      </AutoScheduleComprehensiveDialog>
      {/* Tools button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOthersSidebarOpen((open) => !open)}
      >
        <Plus className="mr-2 h-4 w-4" />
        Tools
      </Button>
    </div>
  );

  const externalState = {
    date,
    setDate,
    view,
    setView,
    availableViews,
  };

  // Keyboard navigation support for date navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.key === 'ArrowLeft' && e.ctrlKey) {
        handlePrev();
      } else if (e.key === 'ArrowRight' && e.ctrlKey) {
        handleNext();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrev, handleNext]);

  return (
    <>
      <div className="calendar-container flex h-full w-full flex-col">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 border-b">
          <div className="p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center gap-2">
                  <div className="ml-1">
                    {sidebarToggleButton}
                  </div>
                  <div className="flex items-center gap-1">
                    <h2 className="font-semibold text-xl tracking-tight ml-1">
                      {date.toLocaleDateString('en-US', {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </h2>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handlePrev}
                      aria-label="Previous period"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleNext}
                      aria-label="Next period"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectToday}
                    disabled={isToday() || isCurrentMonth()}
                  >
                    {view === 'day'
                      ? t('today')
                      : view === 'week'
                        ? t('this-week')
                        : view === 'month'
                          ? t('this-month')
                          : t('current')}
                  </Button>
                </div>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="flex items-center gap-2">
                  {views.length > 1 && (
                    <div className="w-full flex-1 md:w-auto">
                      <Select value={view} onValueChange={onViewChange}>
                        <SelectTrigger className="h-8 w-full">
                          <SelectValue placeholder={t('view')} />
                        </SelectTrigger>
                        <SelectContent>
                          {views.map((view) => (
                            <SelectItem key={view.value} value={view.value}>
                              {view.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                {extras}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex w-full flex-1 overflow-hidden">
          {calendarSidebarOpen && <CalendarSidebar />}
          <div className="w-full flex-1">
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
              enableHeader={false} // Header is now handled by CalendarPageClient
              externalState={externalState}
              extras={undefined} // Extras are now handled by CalendarPageClient
            />
          </div>

          {/* Right sidebar (tasks and AI chat) - only show when others sidebar is open */}
          {othersSidebarOpen && (
            <TasksSidebarContent
              wsId={workspace.id}
              locale={locale}
              tasks={tasksData?.tasks || []}
              hasKeys={{ openAI: false, anthropic: false, google: false }}
              chats={[]}
              count={0}
              hasAiChatAccess={true}
            />
          )}
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
