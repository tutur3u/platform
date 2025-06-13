'use client';

import { CommandGroup, CommandItem } from '@tuturuuu/ui/command';
import { Calendar, Clock, PlusCircle, Timer } from 'lucide-react';

interface QuickActionsProps {
  onAddTask: () => void;
  onTimeTracker: () => void;
  onQuickTimeTracker: () => void;
  onCalendar: () => void;
}

export function QuickActions({
  onAddTask,
  onTimeTracker,
  onQuickTimeTracker,
  onCalendar,
}: QuickActionsProps) {
  return (
    <CommandGroup heading="⚡ Quick Actions">
      <CommandItem
        onSelect={onAddTask}
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
        onSelect={onQuickTimeTracker}
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
            <span className="font-semibold text-foreground transition-colors group-hover:text-dynamic-purple">
              Quick timer
            </span>
            <span className="text-xs text-muted-foreground">
              Start tracking time instantly
            </span>
          </div>
          <div className="text-xs text-dynamic-purple/60 opacity-0 transition-opacity group-hover:opacity-100">
            Fast start
          </div>
        </div>
      </CommandItem>

      <CommandItem
        onSelect={onTimeTracker}
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
            <span className="font-semibold text-foreground transition-colors group-hover:text-dynamic-blue">
              Time Tracker
            </span>
            <span className="text-xs text-muted-foreground">
              Advanced time tracking and analytics
            </span>
          </div>
          <div className="text-xs text-dynamic-blue/60 opacity-0 transition-opacity group-hover:opacity-100">
            Navigate
          </div>
        </div>
      </CommandItem>

      <CommandItem
        onSelect={onCalendar}
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
  );
}
