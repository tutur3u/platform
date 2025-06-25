'use client';

import { Button } from '@tuturuuu/ui/button';
import { CommandGroup, CommandItem } from '@tuturuuu/ui/command';
import {
  Brain,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  PlusCircle,
  Timer,
  TrendingUp,
} from '@tuturuuu/ui/icons';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

// Peak productivity hours configuration
const PEAK_HOURS = {
  morning: { start: 9, end: 11 },
  afternoon: { start: 14, end: 16 },
} as const;

interface QuickActionsProps {
  wsId: string;
  setOpen: (open: boolean) => void;
  setPage?: (page: string) => void;
}

export function QuickActions({ wsId, setOpen, setPage }: QuickActionsProps) {
  const [isExpanded, setIsExpanded] = useState(true); // Default to expanded
  const router = useRouter();

  // Calculate current hour for productivity suggestions with memoization
  const isPeakHour = useMemo(() => {
    const currentHour = new Date().getHours();
    return (
      (currentHour >= PEAK_HOURS.morning.start &&
        currentHour <= PEAK_HOURS.morning.end) ||
      (currentHour >= PEAK_HOURS.afternoon.start &&
        currentHour <= PEAK_HOURS.afternoon.end)
    );
  }, []);

  const handleAddTask = () => {
    // Navigate to add task form within command palette
    if (setPage) {
      setPage('add-task');
    } else {
      // Fallback to external navigation if setPage is not available
      router.push(`/${wsId}/tasks/boards`);
      setOpen(false);
    }
  };

  const handleQuickTimeTracker = () => {
    // Open quick time tracker
    setOpen(false);
    // This would open a quick timer modal or similar
  };

  const handleTimeTracker = () => {
    router.push(`/${wsId}/time-tracker`);
    setOpen(false);
  };

  const handleCalendar = () => {
    router.push(`/${wsId}/calendar`);
    setOpen(false);
  };

  return (
    <div className="border-b border-border/50 pb-2">
      {/* Collapsible Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            ⚡ Quick Actions
          </span>
          <div className="rounded-md bg-dynamic-blue/10 px-2 py-0.5 text-xs font-medium text-dynamic-blue">
            4 actions
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-6 w-6 p-0 hover:bg-muted/50"
          data-toggle
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </Button>
      </div>

      {/* Collapsible Content */}
      {isExpanded && (
        <CommandGroup>
          <CommandItem
            onSelect={handleAddTask}
            className="group hover:to-dynamic-emerald/5 cursor-pointer border-l-2 border-transparent transition-all duration-200 hover:border-dynamic-green/30 hover:bg-gradient-to-r hover:from-dynamic-green/5"
          >
            <div className="flex w-full items-center gap-4">
              <div className="relative">
                <div className="to-dynamic-emerald/20 absolute inset-0 rounded-lg bg-gradient-to-br from-dynamic-green/20 blur-sm transition-all group-hover:blur-md" />
                <div className="to-dynamic-emerald/10 relative rounded-lg border border-dynamic-green/20 bg-gradient-to-br from-dynamic-green/10 p-2.5">
                  <PlusCircle className="h-5 w-5 text-dynamic-green" />
                </div>
              </div>
              <div className="flex flex-1 flex-col">
                <span className="font-semibold text-foreground transition-colors group-hover:text-dynamic-green">
                  Add new task
                </span>
                <span className="text-xs text-muted-foreground">
                  Create a task in any board and list
                </span>
              </div>
              <div className="text-xs text-dynamic-green/60 opacity-0 transition-opacity group-hover:opacity-100">
                Press Enter
              </div>
            </div>
          </CommandItem>

          <CommandItem
            onSelect={handleQuickTimeTracker}
            className="group cursor-pointer border-l-2 border-transparent transition-all duration-200 hover:border-dynamic-purple/30 hover:bg-gradient-to-r hover:from-dynamic-purple/5 hover:to-dynamic-pink/5"
          >
            <div className="flex w-full items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-dynamic-purple/20 to-dynamic-pink/20 blur-sm transition-all group-hover:blur-md" />
                <div className="relative rounded-lg border border-dynamic-purple/20 bg-gradient-to-br from-dynamic-purple/10 to-dynamic-pink/10 p-2.5">
                  <Timer className="h-5 w-5 text-dynamic-purple" />
                </div>
              </div>
              <div className="flex flex-1 flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground transition-colors group-hover:text-dynamic-purple">
                    Quick timer
                  </span>
                  {isPeakHour && (
                    <div className="flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 dark:bg-amber-900/30">
                      <Brain className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                        Peak Time
                      </span>
                    </div>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {isPeakHour
                    ? 'Perfect timing for deep focus work'
                    : 'Start tracking time instantly'}
                </span>
              </div>
              <div className="text-xs text-dynamic-purple/60 opacity-0 transition-opacity group-hover:opacity-100">
                Fast start
              </div>
            </div>
          </CommandItem>

          <CommandItem
            onSelect={handleTimeTracker}
            className="group cursor-pointer border-l-2 border-transparent transition-all duration-200 hover:border-dynamic-blue/30 hover:bg-gradient-to-r hover:from-dynamic-blue/5 hover:to-dynamic-purple/5"
          >
            <div className="flex w-full items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-dynamic-blue/20 to-dynamic-purple/20 blur-sm transition-all group-hover:blur-md" />
                <div className="relative rounded-lg border border-dynamic-blue/20 bg-gradient-to-br from-dynamic-blue/10 to-dynamic-purple/10 p-2.5">
                  <Clock className="h-5 w-5 text-dynamic-blue" />
                </div>
              </div>
              <div className="flex flex-1 flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground transition-colors group-hover:text-dynamic-blue">
                    Time Tracker
                  </span>
                  <div className="flex items-center gap-1 rounded-md bg-blue-100 px-1.5 py-0.5 dark:bg-blue-900/30">
                    <TrendingUp className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                      Analytics
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  Advanced time tracking with focus scores & insights
                </span>
              </div>
              <div className="text-xs text-dynamic-blue/60 opacity-0 transition-opacity group-hover:opacity-100">
                Navigate
              </div>
            </div>
          </CommandItem>

          <CommandItem
            onSelect={handleCalendar}
            className="group cursor-pointer border-l-2 border-transparent transition-all duration-200 hover:border-dynamic-orange/30 hover:bg-gradient-to-r hover:from-dynamic-orange/5 hover:to-dynamic-pink/5"
          >
            <div className="flex w-full items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-dynamic-orange/20 to-dynamic-pink/20 blur-sm transition-all group-hover:blur-md" />
                <div className="relative rounded-lg border border-dynamic-orange/20 bg-gradient-to-br from-dynamic-orange/10 to-dynamic-pink/10 p-2.5">
                  <Calendar className="h-5 w-5 text-dynamic-orange" />
                </div>
              </div>
              <div className="flex flex-1 flex-col">
                <span className="font-semibold text-foreground transition-colors group-hover:text-dynamic-orange">
                  Calendar
                </span>
                <span className="text-xs text-muted-foreground">
                  View events and manage your schedule
                </span>
              </div>
              <div className="text-xs text-dynamic-orange/60 opacity-0 transition-opacity group-hover:opacity-100">
                Navigate
              </div>
            </div>
          </CommandItem>
        </CommandGroup>
      )}
    </div>
  );
}
