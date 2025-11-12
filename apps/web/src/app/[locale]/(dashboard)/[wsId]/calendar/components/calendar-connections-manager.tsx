'use client';

import { Plus, Settings, Trash2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useCallback, useEffect, useState } from 'react';

interface CalendarConnection {
  id: string;
  ws_id: string;
  calendar_id: string;
  calendar_name: string;
  is_enabled: boolean;
  color: string | null;
  created_at: string;
  updated_at: string;
}

interface GoogleCalendar {
  id: string;
  name: string;
  description: string;
  primary: boolean;
  backgroundColor: string;
  foregroundColor: string;
  accessRole: string;
}

interface CalendarConnectionsManagerProps {
  wsId: string;
  initialConnections: CalendarConnection[];
  hasGoogleAuth: boolean;
}

export default function CalendarConnectionsManager({
  wsId,
  initialConnections,
  hasGoogleAuth,
}: CalendarConnectionsManagerProps) {
  const [connections, setConnections] =
    useState<CalendarConnection[]>(initialConnections);
  const [availableCalendars, setAvailableCalendars] = useState<
    GoogleCalendar[]
  >([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoadingCalendars, setIsLoadingCalendars] = useState(false);
  const [isAddingCalendar, setIsAddingCalendar] = useState(false);

  const fetchAvailableCalendars = useCallback(async () => {
    setIsLoadingCalendars(true);
    try {
      const response = await fetch(
        `/api/v1/calendar/auth/list-calendars?wsId=${wsId}`
      );
      const data = await response.json();

      if (response.ok) {
        setAvailableCalendars(data.calendars);
      } else {
        // Handle 403 (insufficient scope) specially
        if (response.status === 403 && data.requiresReauth) {
          toast.error('Please reconnect your Google Calendar', {
            description:
              'Your current connection needs additional permissions. Please disconnect and reconnect your Google Calendar.',
            duration: 5000,
          });
        } else if (data.requiresReauth) {
          toast.error('Please reconnect your Google Calendar', {
            description:
              data.error ||
              'Your Google Calendar connection needs to be refreshed.',
            duration: 5000,
          });
        } else {
          toast.error(data.error || 'Failed to fetch calendars');
        }
      }
    } catch (_error) {
      toast.error('Failed to fetch calendars');
    } finally {
      setIsLoadingCalendars(false);
    }
  }, [wsId]);

  // Fetch available Google calendars when dialog opens
  useEffect(() => {
    if (isOpen && hasGoogleAuth && availableCalendars.length === 0) {
      fetchAvailableCalendars();
    }
  }, [
    isOpen,
    hasGoogleAuth,
    availableCalendars.length,
    fetchAvailableCalendars,
  ]);

  const refreshConnections = async () => {
    try {
      const response = await fetch(`/api/v1/calendar/connections?wsId=${wsId}`);
      const data = await response.json();

      if (response.ok) {
        setConnections(data.connections);
      }
    } catch (error) {
      console.error('Failed to refresh connections:', error);
    }
  };

  const handleToggleCalendar = async (
    connectionId: string,
    isEnabled: boolean
  ) => {
    try {
      const response = await fetch('/api/v1/calendar/connections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: connectionId, isEnabled }),
      });

      if (response.ok) {
        await refreshConnections();
        toast.success(isEnabled ? 'Calendar enabled' : 'Calendar disabled');
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to update calendar');
      }
    } catch (_error) {
      toast.error('Failed to update calendar');
    }
  };

  const handleAddCalendar = async (calendar: GoogleCalendar) => {
    setIsAddingCalendar(true);
    try {
      const response = await fetch('/api/v1/calendar/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wsId,
          calendarId: calendar.id,
          calendarName: calendar.name,
          color: calendar.backgroundColor,
          isEnabled: true,
        }),
      });

      if (response.ok) {
        await refreshConnections();
        toast.success(`Added ${calendar.name}`);
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to add calendar');
      }
    } catch (_error) {
      toast.error('Failed to add calendar');
    } finally {
      setIsAddingCalendar(false);
    }
  };

  const handleRemoveCalendar = async (
    connectionId: string,
    calendarName: string
  ) => {
    try {
      const response = await fetch(
        `/api/v1/calendar/connections?id=${connectionId}`,
        {
          method: 'DELETE',
        }
      );

      if (response.ok) {
        await refreshConnections();
        toast.success(`Removed ${calendarName}`);
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to remove calendar');
      }
    } catch (_error) {
      toast.error('Failed to remove calendar');
    }
  };

  if (!hasGoogleAuth) {
    return null;
  }

  // Get calendars that are not yet connected
  const connectedCalendarIds = new Set(connections.map((c) => c.calendar_id));
  const unconnectedCalendars = availableCalendars.filter(
    (cal) => !connectedCalendarIds.has(cal.id)
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="mr-2 h-4 w-4" />
          Manage Calendars
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Google Calendars</DialogTitle>
          <DialogDescription>
            Choose which Google Calendars to sync with your workspace
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Connected Calendars Section */}
          <div>
            <h3 className="mb-3 font-medium text-sm">Connected Calendars</h3>
            {connections.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No calendars connected yet. Add calendars below to start
                syncing.
              </p>
            ) : (
              <div className="max-w-md space-y-2">
                {connections.map((connection) => (
                  <div
                    key={connection.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="flex w-full min-w-0 flex-1 items-center gap-3">
                      {connection.color && (
                        <div
                          className="h-4 w-4 shrink-0 rounded-full"
                          style={{ backgroundColor: connection.color }}
                        />
                      )}
                      <div className="min-w-0">
                        <p className="line-clamp-1 break-all font-medium text-sm">
                          {connection.calendar_name}
                        </p>
                        <p className="line-clamp-1 break-all text-muted-foreground text-xs">
                          {connection.calendar_id}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Switch
                        checked={connection.is_enabled}
                        onCheckedChange={(checked) =>
                          handleToggleCalendar(connection.id, checked)
                        }
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleRemoveCalendar(
                            connection.id,
                            connection.calendar_name
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Available Calendars Section */}
          <div>
            <h3 className="mb-3 font-medium text-sm">Add More Calendars</h3>
            {isLoadingCalendars ? (
              <p className="text-muted-foreground text-sm">
                Loading calendars...
              </p>
            ) : unconnectedCalendars.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                All your Google Calendars are already connected.
              </p>
            ) : (
              <div className="max-w-md space-y-2">
                {unconnectedCalendars.map((calendar) => (
                  <div
                    key={calendar.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div
                        className="h-4 w-4 shrink-0 rounded-full"
                        style={{ backgroundColor: calendar.backgroundColor }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="line-clamp-1 break-all font-medium text-sm">
                            {calendar.name}
                          </p>
                          {calendar.primary && (
                            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
                              Primary
                            </span>
                          )}
                        </div>
                        {calendar.description && (
                          <p className="line-clamp-1 break-all text-muted-foreground text-xs">
                            {calendar.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="shrink-0"
                      onClick={() => handleAddCalendar(calendar)}
                      disabled={isAddingCalendar}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
