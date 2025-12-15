'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Eye,
  EyeOff,
  Link,
  Loader2,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  Upload,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

type CalendarConnection = {
  id: string;
  ws_id: string;
  calendar_id: string;
  calendar_name: string;
  is_enabled: boolean;
  color: string | null;
  created_at: string;
  updated_at: string;
};

type GoogleCalendar = {
  id: string;
  name: string;
  description: string;
  primary: boolean;
  backgroundColor: string;
  foregroundColor: string;
  accessRole: string;
};

interface AuthResponse {
  authUrl: string;
}

export function QuickCalendarToggle() {
  const {
    calendarConnections,
    updateCalendarConnection,
    syncStatus,
    syncToGoogle,
    syncToTuturuuu,
    isSyncing,
  } = useCalendarSync();
  const t = useTranslations('calendar');
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [isOpen, setIsOpen] = useState(false);

  const enabledCount = useMemo(
    () => calendarConnections.filter((c) => c.is_enabled).length,
    [calendarConnections]
  );

  if (calendarConnections.length === 0) return null;

  const syncStatusStyles =
    syncStatus.state === 'syncing'
      ? 'bg-dynamic-blue/10 text-dynamic-blue'
      : syncStatus.state === 'success'
        ? 'bg-dynamic-green/10 text-dynamic-green'
        : 'bg-dynamic-red/10 text-dynamic-red';

  const handleToggle = async (connectionId: string, currentState: boolean) => {
    const newState = !currentState;
    const connection = calendarConnections.find((c) => c.id === connectionId);
    if (!connection) return;

    updateCalendarConnection(connectionId, newState);
    setTogglingIds((prev) => new Set(prev).add(connectionId));

    try {
      const response = await fetch('/api/v1/calendar/connections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: connectionId, isEnabled: newState }),
      });

      if (!response.ok) {
        updateCalendarConnection(connectionId, currentState);
        const data = await response.json();
        toast.error(data.error || t('failed_to_update_visibility'));
      }
    } catch (_error) {
      updateCalendarConnection(connectionId, currentState);
      toast.error(t('failed_to_update_visibility'));
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
          <span>{t('calendars')}</span>
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
              {t('visible_calendars')}
            </h4>
            <p className="text-muted-foreground text-xs">
              {t('toggle_calendars_desc')}
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

          <div className="space-y-2 border-border border-t pt-2">
            <p className="text-muted-foreground text-xs">
              {t('visible_calendars_count', {
                count: enabledCount,
                total: calendarConnections.length,
                s: calendarConnections.length !== 1 ? 's' : '',
              })}
            </p>

            {syncStatus.state !== 'idle' && (
              <div
                className={`flex items-center gap-2 rounded-md p-2 text-xs ${syncStatusStyles}`}
              >
                {syncStatus.state === 'syncing' && (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
                {syncStatus.state === 'success' && (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                {syncStatus.state === 'error' && (
                  <AlertCircle className="h-3 w-3" />
                )}
                <span className="flex-1 truncate">{syncStatus.message}</span>
                {syncStatus.lastSyncTime && (
                  <span className="text-[10px] opacity-70">
                    {new Date(syncStatus.lastSyncTime).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => syncToTuturuuu()}
                disabled={isSyncing}
                className="flex-1 gap-2"
              >
                {isSyncing && syncStatus.direction === 'google-to-tuturuuu' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}

                <span className="text-xs">{t('sync_from_google')}</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => syncToGoogle()}
                disabled={isSyncing}
                className="flex-1 gap-2"
              >
                {isSyncing && syncStatus.direction === 'tuturuuu-to-google' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Upload className="h-3 w-3" />
                )}
                <span className="text-xs">{t('sync_to_google')}</span>
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function CalendarConnections({
  wsId,
  initialConnections: _initialConnections,
  hasGoogleAuth,
}: {
  wsId: string;
  initialConnections: CalendarConnection[];
  hasGoogleAuth: boolean;
}) {
  const {
    calendarConnections,
    updateCalendarConnection,
    setCalendarConnections,
    syncStatus,
    syncToGoogle,
    syncToTuturuuu,
    isSyncing,
  } = useCalendarSync();

  const t = useTranslations('calendar');
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [isQuickOpen, setIsQuickOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [isAddingCalendar, setIsAddingCalendar] = useState(false);

  // Replaced manual fetch with useMutation
  const googleAuthMutation = useMutation<AuthResponse, Error, void>({
    mutationKey: ['calendar', 'google-auth', wsId],
    mutationFn: async () => {
      const response = await fetch(`/api/v1/calendar/auth?wsId=${wsId}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? 'unauthorized'
            : response.status === 403
              ? 'forbidden'
              : 'unknown_error'
        );
      }

      return (await response.json()) as AuthResponse;
    },
    onSuccess: (data) => {
      const { authUrl } = data;
      if (authUrl) {
        window.location.href = authUrl;
      } else {
        toast.error(t('auth_url_invalid'));
      }
    },
    onError: (error) => {
      const errorKey =
        error.message === 'unauthorized' || error.message === 'forbidden'
          ? error.message
          : 'unknown_error';
      toast.error(t('google_auth_failed'), {
        description: t(`errors.${errorKey}`),
      });
    },
  });

  const handleGoogleAuth = () => {
    googleAuthMutation.mutate();
  };

  const enabledCount = useMemo(
    () => calendarConnections.filter((c) => c.is_enabled).length,
    [calendarConnections]
  );

  const refreshConnections = async () => {
    try {
      const response = await fetch(`/api/v1/calendar/connections?wsId=${wsId}`);
      const data = await response.json();
      if (response.ok && Array.isArray(data.connections)) {
        setCalendarConnections(data.connections);
      }
    } catch (_error) {
      // Keep silent; UI will continue to reflect optimistic state.
    }
  };

  const { data: availableCalendars = [], isLoading: isLoadingCalendars } =
    useQuery({
      queryKey: ['google-calendar-list', wsId],
      enabled: isManageOpen && hasGoogleAuth,
      queryFn: async () => {
        const response = await fetch(
          `/api/v1/calendar/auth/list-calendars?wsId=${wsId}`
        );
        const data = await response.json();

        if (response.ok) {
          return (data.calendars || []) as GoogleCalendar[];
        }

        // Handle 403 (insufficient scope) specially
        if (response.status === 403 && data.requiresReauth) {
          toast.error(t('please_reconnect'), {
            description: t('reconnect_desc'),
            duration: 5000,
          });
        } else if (data.requiresReauth) {
          toast.error(t('please_reconnect'), {
            description: data.error || t('refresh_connection'),
            duration: 5000,
          });
        } else {
          toast.error(data.error || t('failed_to_fetch_calendars'));
        }

        return [] as GoogleCalendar[];
      },
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    });

  const connectedCalendarIds = useMemo(
    () => new Set(calendarConnections.map((c) => c.calendar_id)),
    [calendarConnections]
  );

  const unconnectedCalendars = useMemo(
    () => availableCalendars.filter((cal) => !connectedCalendarIds.has(cal.id)),
    [availableCalendars, connectedCalendarIds]
  );

  const handleToggleVisibility = async (
    connectionId: string,
    currentState: boolean
  ) => {
    const newState = !currentState;
    const connection = calendarConnections.find((c) => c.id === connectionId);
    if (!connection) return;

    updateCalendarConnection(connectionId, newState);
    setTogglingIds((prev) => new Set(prev).add(connectionId));

    try {
      const response = await fetch('/api/v1/calendar/connections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: connectionId, isEnabled: newState }),
      });

      if (!response.ok) {
        updateCalendarConnection(connectionId, currentState);
        const data = await response.json();
        toast.error(data.error || t('failed_to_update_visibility'));
      } else {
        await refreshConnections();
      }
    } catch (_error) {
      updateCalendarConnection(connectionId, currentState);
      toast.error(t('failed_to_update_visibility'));
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(connectionId);
        return next;
      });
    }
  };

  const handleToggleEnabled = async (
    connectionId: string,
    isEnabled: boolean
  ) => {
    const prevState =
      calendarConnections.find((c) => c.id === connectionId)?.is_enabled ??
      !isEnabled;

    updateCalendarConnection(connectionId, isEnabled);

    try {
      const response = await fetch('/api/v1/calendar/connections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: connectionId, isEnabled }),
      });

      if (response.ok) {
        await refreshConnections();
        toast.success(
          isEnabled ? t('calendar_enabled') : t('calendar_disabled')
        );
      } else {
        updateCalendarConnection(connectionId, prevState);
        const data = await response.json();
        toast.error(data.error || t('failed_to_update'));
      }
    } catch (_error) {
      updateCalendarConnection(connectionId, prevState);
      toast.error(t('failed_to_update'));
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
        toast.success(t('added_calendar', { name: calendar.name }));
      } else {
        const data = await response.json();
        toast.error(data.error || t('failed_to_add'));
      }
    } catch (_error) {
      toast.error(t('failed_to_add'));
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
        { method: 'DELETE' }
      );

      if (response.ok) {
        await refreshConnections();
        toast.success(t('removed_calendar', { name: calendarName }));
      } else {
        const data = await response.json();
        toast.error(data.error || t('failed_to_remove'));
      }
    } catch (_error) {
      toast.error(t('failed_to_remove'));
    }
  };

  if (!hasGoogleAuth) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleGoogleAuth}
        disabled={googleAuthMutation.isPending}
        className="gap-2"
      >
        {googleAuthMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Link className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">{t('connect_google_calendar')}</span>
        <span className="sm:hidden">{t('connect')}</span>
      </Button>
    );
  }

  const showQuickToggle = calendarConnections.length > 0;

  const syncStatusStyles =
    syncStatus.state === 'syncing'
      ? 'bg-dynamic-blue/10 text-dynamic-blue'
      : syncStatus.state === 'success'
        ? 'bg-dynamic-green/10 text-dynamic-green'
        : 'bg-dynamic-red/10 text-dynamic-red';

  return (
    <>
      {showQuickToggle && (
        <Popover open={isQuickOpen} onOpenChange={setIsQuickOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Calendar className="h-4 w-4" />
              <span>{t('calendars')}</span>
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
                  {t('visible_calendars')}
                </h4>
                <p className="text-muted-foreground text-xs">
                  {t('toggle_calendars_desc')}
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
                      onClick={() =>
                        handleToggleVisibility(connection.id, isEnabled)
                      }
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

              <div className="space-y-2 border-border border-t pt-2">
                <p className="text-muted-foreground text-xs">
                  {t('visible_calendars_count', {
                    count: enabledCount,
                    total: calendarConnections.length,
                    s: calendarConnections.length !== 1 ? 's' : '',
                  })}
                </p>

                {syncStatus.state !== 'idle' && (
                  <div
                    className={`flex items-center gap-2 rounded-md p-2 text-xs ${syncStatusStyles}`}
                  >
                    {syncStatus.state === 'syncing' && (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                    {syncStatus.state === 'success' && (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    {syncStatus.state === 'error' && (
                      <AlertCircle className="h-3 w-3" />
                    )}
                    <span className="flex-1 truncate">
                      {syncStatus.message}
                    </span>
                    {syncStatus.lastSyncTime && (
                      <span className="text-[10px] opacity-70">
                        {new Date(syncStatus.lastSyncTime).toLocaleTimeString(
                          [],
                          {
                            hour: '2-digit',
                            minute: '2-digit',
                          }
                        )}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => syncToTuturuuu()}
                    disabled={isSyncing}
                    className="flex-1 gap-2"
                  >
                    {isSyncing &&
                    syncStatus.direction === 'google-to-tuturuuu' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    <span className="text-xs">{t('sync_from_google')}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => syncToGoogle()}
                    disabled={isSyncing}
                    className="flex-1 gap-2"
                  >
                    {isSyncing &&
                    syncStatus.direction === 'tuturuuu-to-google' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Upload className="h-3 w-3" />
                    )}
                    <span className="text-xs">{t('sync_to_google')}</span>
                  </Button>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsQuickOpen(false);
                    setIsManageOpen(true);
                  }}
                  className="w-full gap-2"
                >
                  <Settings className="h-3 w-3" />
                  <span className="text-xs">{t('manage_calendars')}</span>
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Fallback button when no calendars connected yet */}
      {!showQuickToggle && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsManageOpen(true)}
        >
          <Calendar className="mr-2 h-4 w-4" />
          {t('calendars')}
        </Button>
      )}

      <Dialog open={isManageOpen} onOpenChange={setIsManageOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('manage_google_calendars_title')}</DialogTitle>
            <DialogDescription>
              {t('manage_google_calendars_desc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div>
              <h3 className="mb-3 font-medium text-sm">
                {t('connected_calendars')}
              </h3>
              {calendarConnections.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t('no_calendars_connected')}
                </p>
              ) : (
                <div className="max-w-md space-y-2">
                  {calendarConnections.map((connection) => (
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
                            handleToggleEnabled(connection.id, checked)
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

            <div>
              <h3 className="mb-3 font-medium text-sm">
                {t('add_more_calendars')}
              </h3>
              {isLoadingCalendars ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('loading_calendars')}
                </div>
              ) : unconnectedCalendars.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t('all_calendars_connected')}
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
                                {t('primary')}
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
                        {t('add')}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
