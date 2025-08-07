'use client';

import { useCalendarState } from './calendar-state-context';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useCallback } from 'react';

interface CalendarPageClientProps {
  wsId: string;
  locale: string;
  workspace: Workspace;
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
}

// Type definitions for the expected useQuery and useQueryClient signatures
type CalendarUseQuery = (options: { 
  queryKey: string[]; 
  queryFn: () => Promise<unknown>; 
  enabled?: boolean; 
  refetchInterval?: number; 
  staleTime?: number 
}) => { data?: { events?: unknown[] } };

type CalendarUseQueryClient = () => { 
  invalidateQueries: (options: { queryKey: string[]; refetchType?: string } | string[]) => Promise<void>; 
  setQueryData: (queryKey: string[], data: unknown) => void 
};

export default function CalendarPageClient({
  locale,
  workspace,
  experimentalGoogleToken,
}: CalendarPageClientProps) {
  const t = useTranslations('calendar');
  
  // Create a wrapper function to match the expected type signature
  const translationWrapper = useCallback((key: string) => {
    // Use type assertion to handle the next-intl type system
    return t(key as Parameters<typeof t>[0]);
  }, [t]);

  const [isAddEventModalOpen, setIsAddEventModalOpen] = useState(false);
  const [calendarSidebarOpen, setCalendarSidebarOpen] = useState(false);
  const [othersSidebarOpen, setOthersSidebarOpen] = useState(false);
  const { date, setDate, view, setView, availableViews } = useCalendarState();

  // Fetch tasks data using custom hook
  const { data: tasksData } = useTasksData(workspace.id, othersSidebarOpen);

  // Fetch AI chat data using custom hook
  const { data: aiChatData } = useAIChatData(workspace.id, othersSidebarOpen);

  const openAddEventDialog = () => setIsAddEventModalOpen(true);
  const closeAddEventDialog = () => setIsAddEventModalOpen(false);

  // Calendar navigation functions
  const handleNext = useCallback(() => {
    const newDate = new Date(date);
    if (view === 'day') {
      newDate.setDate(newDate.getDate() + 1);
    } else if (view === '4-days') {
      newDate.setDate(newDate.getDate() + 4);
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
    } else if (view === '4-days') {
      newDate.setDate(newDate.getDate() - 4);
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else if (view === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    }
    setDate(newDate);
  }, [date, view, setDate]);

  const selectToday = () => setDate(new Date());

  const isToday = () => {
    const today = new Date();
    return date.getDate() === today.getDate() && 
           date.getMonth() === today.getMonth() && 
           date.getFullYear() === today.getFullYear();
  };

  const isCurrent4DayPeriod = () => {
    if (view !== '4-days') return false;
    const today = new Date();
    const currentDate = new Date(date);
    
    // For 4-day view, check if today is within the 4-day period starting from the current date
    const startDate = new Date(currentDate);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 3);
    
    return today >= startDate && today <= endDate;
  };

  const onViewChange = (newView: string) => {
    setView(newView as 'day' | '4-days' | 'week' | 'month');
  };

  const views = availableViews.map((v) => ({
    value: v.value,
    label: v.label,
    disabled: v.disabled,
  }));

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

  return (
    <div className="calendar-container h-full flex flex-col">
      {/* Sticky Header - Above Everything */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              {sidebarToggleButton}
              <h2 className="font-semibold text-xl tracking-tight">
                {date.toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric',
                })}
              </h2>
              {/* Navigation Controls */}
              <div className="flex items-center gap-2">
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectToday}
                  disabled={isToday() || isCurrent4DayPeriod()}
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
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className="flex items-center gap-2">
                {/* View Switcher */}
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
                
                {/* Action Buttons */}
                {extras}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area - Three Column Layout */}
      <div className="flex-1 flex w-full overflow-hidden pb-6">
        {/* Left Sidebar */}
        {calendarSidebarOpen && (
          <div className="w-[261px] border-r bg-background/50">
            <CalendarSidebar />
          </div>
        )}
        
        {/* Center Calendar View */}
        <div className="flex-1">
          <SmartCalendar
            t={translationWrapper}
            locale={locale}
            workspace={workspace}
            useQuery={useQuery as CalendarUseQuery}
            useQueryClient={useQueryClient as CalendarUseQueryClient}
            experimentalGoogleToken={
              experimentalGoogleToken?.ws_id === workspace.id
                ? experimentalGoogleToken
                : null
            }
            enableHeader={false}
            extras={extras}
            sidebarToggleButton={sidebarToggleButton}
            externalState={{
              date,
              setDate,
              view,
              setView,
              availableViews,
            }}
          />
        </div>

        {/* Right Sidebar */}
        {othersSidebarOpen && (
          <div className="w-80 border-l bg-background/50">
            <TasksSidebarContent
              wsId={workspace.id}
              locale={locale}
              tasks={tasksData?.tasks || []}
              hasKeys={aiChatData?.hasKeys || { openAI: false, anthropic: false, google: false }}
              chats={aiChatData?.chats || []}
              count={aiChatData?.count || 0}
              hasAiChatAccess={aiChatData?.hasAiChatAccess || false}
            />
          </div>
        )}
      </div>
      <AddEventModal
        wsId={workspace.id}
        isOpen={isAddEventModalOpen}
        onClose={closeAddEventDialog}
      />
    </div>
  );
}
