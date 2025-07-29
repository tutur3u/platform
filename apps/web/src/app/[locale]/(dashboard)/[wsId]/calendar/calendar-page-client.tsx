'use client';

import { useState } from 'react';
import type { Workspace, WorkspaceCalendarGoogleToken } from '@tuturuuu/types/db';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Button } from '@tuturuuu/ui/button';
import { PanelLeftClose, Sparkles } from '@tuturuuu/ui/icons';
import { SmartCalendar } from '@tuturuuu/ui/legacy/calendar/smart-calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@tuturuuu/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { DEV_MODE } from '@/constants/common';
import AddEventModal from './components/add-event-dialog';
import AddEventButton from './components/add-event-button';
import TestEventGeneratorButton from './components/test-event-generator-button';
import AutoScheduleComprehensiveDialog from './components/auto-schedule-comprehensive-dialog';
import CalendarSidebar from './components/calendar-sidebar';
import { useCalendarState } from './calendar-state-context';

interface CalendarPageClientProps {
  wsId: string;
  locale: string;
  workspace: Workspace;
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
}

export default function CalendarPageClient({
  locale, workspace, experimentalGoogleToken,
}: CalendarPageClientProps) {
  const t = useTranslations('calendar');
  const [isAddEventModalOpen, setIsAddEventModalOpen] = useState(false);
  const [calendarSidebarOpen, setCalendarSidebarOpen] = useState(false);
  const { date, setDate, view, setView, availableViews } = useCalendarState();

  const handleNext = () => {
    const newDate = new Date(date);
    if (view === 'day') {
      newDate.setDate(newDate.getDate() + 1);
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else if (view === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setDate(newDate);
  };

  const handlePrev = () => {
    const newDate = new Date(date);
    if (view === 'day') {
      newDate.setDate(newDate.getDate() - 1);
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else if (view === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    }
    setDate(newDate);
  };

  const selectToday = () => {
    setDate(new Date());
  };

  const isToday = () => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isCurrentMonth = () => {
    const today = new Date();
    return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
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

  // Sidebar toggle button for header
  const sidebarToggleButton = (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle calendar sidebar"
      onClick={() => setCalendarSidebarOpen(!calendarSidebarOpen)}
      className="h-7 w-7"
    >
      <PanelLeftClose className="h-5 w-5 text-muted-foreground" />
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

  const externalState = {
    date,
    setDate,
    view,
    setView,
    availableViews,
  };

  return (
    <>
      <div className="flex h-full w-full flex-col">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 border-b">
          <div className="p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                {sidebarToggleButton}
                <h2 className="text-xl font-semibold tracking-tight">
                  {date.toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric'
                  })}
                </h2>
              </div>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="flex items-center gap-2">
                  <div className="flex flex-none items-center justify-center gap-2 md:justify-start">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={handlePrev} aria-label="Previous period">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={isToday() || isCurrentMonth() ? undefined : selectToday} disabled={isToday() || isCurrentMonth()}>
                      {view === 'day' ? t('today') : view === 'week' ? t('this-week') : view === 'month' ? t('this-month') : t('current')}
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleNext} aria-label="Next period">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
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
        <div className="flex flex-1 w-full overflow-hidden">
          {calendarSidebarOpen && (
            <CalendarSidebar />
          )}
          <div className="flex-1 w-full">
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
              onSidebarToggle={() => {}} // This will be handled by SmartCalendar
              sidebarToggleButton={undefined} // Sidebar toggle is now handled by CalendarPageClient
            />
          </div>
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
