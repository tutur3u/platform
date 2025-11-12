'use client';

import { Calendar, Eye, EyeOff } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { toast } from '@tuturuuu/ui/sonner';
import { useMemo, useState } from 'react';

export default function QuickCalendarToggle() {
  const { calendarConnections, updateCalendarConnection } = useCalendarSync();
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [isOpen, setIsOpen] = useState(false);

  // Count enabled calendars
  const enabledCount = useMemo(
    () => calendarConnections.filter((c) => c.is_enabled).length,
    [calendarConnections]
  );

  // Don't show if no calendar connections
  if (calendarConnections.length === 0) {
    return null;
  }

  const handleToggle = async (connectionId: string, currentState: boolean) => {
    const newState = !currentState;
    const connection = calendarConnections.find((c) => c.id === connectionId);

    if (!connection) return;

    // Optimistically update the UI
    updateCalendarConnection(connectionId, newState);
    setTogglingIds((prev) => new Set(prev).add(connectionId));

    try {
      const response = await fetch('/api/v1/calendar/connections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: connectionId, isEnabled: newState }),
      });

      if (!response.ok) {
        // Revert on error
        updateCalendarConnection(connectionId, currentState);
        const data = await response.json();
        toast.error(data.error || 'Failed to update calendar visibility');
      }
    } catch (_error) {
      // Revert on error
      updateCalendarConnection(connectionId, currentState);
      toast.error('Failed to update calendar visibility');
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(connectionId);
        return next;
      });
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Calendar className="h-4 w-4" />
          <span>Calendars</span>
          {enabledCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
              {enabledCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="space-y-1">
            <h4 className="font-medium text-sm leading-none">
              Visible Calendars
            </h4>
            <p className="text-muted-foreground text-xs">
              Toggle which calendars to show
            </p>
          </div>

          <div className="space-y-2">
            {calendarConnections.map((connection) => {
              const isEnabled = connection.is_enabled;
              const isToggling = togglingIds.has(connection.id);

              return (
                <button
                  type="button"
                  key={connection.id}
                  onClick={() => handleToggle(connection.id, isEnabled)}
                  disabled={isToggling}
                  className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {connection.color && (
                    <div
                      className="h-4 w-4 shrink-0 rounded-full border border-border"
                      style={{ backgroundColor: connection.color }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">
                      {connection.calendar_name}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isEnabled ? (
                      <Eye className="h-4 w-4 text-primary" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {calendarConnections.length > 0 && (
            <div className="border-border border-t pt-2">
              <p className="text-muted-foreground text-xs">
                {enabledCount} of {calendarConnections.length} calendar
                {calendarConnections.length !== 1 ? 's' : ''} visible
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
