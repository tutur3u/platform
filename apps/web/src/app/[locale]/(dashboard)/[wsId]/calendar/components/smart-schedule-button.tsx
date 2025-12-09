'use client';

import { SmartSchedulePreviewPanel } from './smart-schedule-preview-panel';
import {
  ChevronDown,
  Eye,
  Loader2,
  Play,
  Sparkles,
  Zap,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';

interface SmartScheduleButtonProps {
  wsId: string;
}

export function SmartScheduleButton({ wsId }: SmartScheduleButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<'instant' | 'animated'>(
    'instant'
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { refresh } = useCalendarSync();

  const handleSmartSchedule = async () => {
    setDropdownOpen(false); // Close dropdown immediately
    setIsLoading(true);
    toast.loading('Running smart schedule...', { id: 'smart-schedule' });

    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/calendar/schedule`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ windowDays: 30, forceReschedule: true }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Scheduling failed');
      }

      refresh();

      toast.success(
        `Scheduled ${result.summary.eventsCreated} events (${result.summary.habitsScheduled} habits, ${result.summary.tasksScheduled} tasks)`,
        { id: 'smart-schedule' }
      );

      if (result.summary.bumpedHabits > 0) {
        toast.info(
          `${result.summary.bumpedHabits} habit events were rescheduled due to urgent tasks`
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Scheduling failed',
        { id: 'smart-schedule' }
      );
    } finally {
      setIsLoading(false);
    }
  };

  const openPreview = (mode: 'instant' | 'animated') => {
    setDropdownOpen(false); // Close dropdown immediately
    setPreviewMode(mode);
    setPreviewOpen(true);
  };

  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            disabled={isLoading || previewOpen}
            variant="default"
            size="sm"
            className="gap-1.5"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {isLoading ? 'Scheduling...' : 'Smart Schedule'}
            </span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            onClick={handleSmartSchedule}
            className="cursor-pointer"
          >
            <Zap className="mr-2 h-4 w-4 text-dynamic-yellow" />
            <div className="flex flex-col">
              <span className="font-medium">Execute Now</span>
              <span className="text-xs text-muted-foreground">
                Apply immediately
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => openPreview('instant')}
            className="cursor-pointer"
          >
            <Eye className="mr-2 h-4 w-4 text-dynamic-blue" />
            <div className="flex flex-col">
              <span className="font-medium">Preview</span>
              <span className="text-xs text-muted-foreground">
                See all changes first
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => openPreview('animated')}
            className="cursor-pointer"
          >
            <Play className="mr-2 h-4 w-4 text-dynamic-green" />
            <div className="flex flex-col">
              <span className="font-medium">Animated Demo</span>
              <span className="text-xs text-muted-foreground">
                Watch step-by-step
              </span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SmartSchedulePreviewPanel
        wsId={wsId}
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        mode={previewMode}
      />
    </>
  );
}
