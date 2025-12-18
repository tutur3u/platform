'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type {
  AuthResponse,
  ConnectedAccount,
  GoogleCalendar,
} from './calendar-types';

interface AccountsResponse {
  accounts: ConnectedAccount[];
  grouped: {
    google: ConnectedAccount[];
    microsoft: ConnectedAccount[];
  };
  total: number;
}

export default function CalendarConnectionsUnified({ wsId }: { wsId: string }) {
  const t = useTranslations('calendar');
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(
    new Set()
  );

  const {
    calendarConnections,
    updateCalendarConnection,
    syncStatus,
    syncToTuturuuu,
    isSyncing,
  } = useCalendarSync();

  // Fetch connected accounts
  const { data: accountsData, isLoading: isLoadingAccounts } = useQuery({
    queryKey: ['calendar-accounts', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/calendar/auth/accounts?wsId=${wsId}`
      );
      if (!response.ok)
        return {
          accounts: [],
          grouped: { google: [], microsoft: [] },
          total: 0,
        };
      return response.json() as Promise<AccountsResponse>;
    },
    staleTime: 30_000,
  });

  const accounts = accountsData?.accounts || [];
  const hasConnectedAccounts = accounts.length > 0;

  // Google auth mutation
  const googleAuthMutation = useMutation<AuthResponse, Error, void>({
    mutationKey: ['calendar', 'google-auth', wsId],
    mutationFn: async () => {
      const response = await fetch(`/api/v1/calendar/auth?wsId=${wsId}`);
      if (!response.ok) throw new Error('Failed to get auth URL');
      return response.json();
    },
    onSuccess: (data) => {
      if (data.authUrl) window.location.href = data.authUrl;
      else toast.error(t('auth_url_invalid'));
    },
    onError: () => toast.error(t('google_auth_failed')),
  });

  // Microsoft auth mutation
  const microsoftAuthMutation = useMutation<AuthResponse, Error, void>({
    mutationKey: ['calendar', 'microsoft-auth', wsId],
    mutationFn: async () => {
      const response = await fetch(
        `/api/v1/calendar/auth/microsoft?wsId=${wsId}`
      );
      if (!response.ok) throw new Error('Failed to get auth URL');
      return response.json();
    },
    onSuccess: (data) => {
      if (data.authUrl) window.location.href = data.authUrl;
      else toast.error(t('auth_url_invalid'));
    },
    onError: () => toast.error(t('microsoft_auth_failed')),
  });

  // Disconnect account mutation
  const disconnectMutation = useMutation({
    mutationFn: async (accountId: string) => {
      setDisconnectingId(accountId);
      const response = await fetch(
        `/api/v1/calendar/auth/accounts?accountId=${accountId}&wsId=${wsId}`,
        { method: 'DELETE' }
      );
      if (!response.ok) throw new Error('Failed to disconnect');
      return response.json();
    },
    onSuccess: () => {
      toast.success(t('account_disconnected'));
      queryClient.invalidateQueries({ queryKey: ['calendar-accounts', wsId] });
    },
    onError: () => toast.error(t('failed_to_disconnect')),
    onSettled: () => setDisconnectingId(null),
  });

  // Toggle calendar visibility - handles both existing connections and new calendars
  const handleToggle = async (
    calendarId: string,
    currentState: boolean,
    calendarData?: {
      calendar_id: string;
      calendar_name: string;
      color: string | null;
      connectionExists: boolean;
      accountId?: string;
    }
  ) => {
    const newState = !currentState;
    setTogglingIds((prev) => new Set(prev).add(calendarId));

    try {
      // If connection doesn't exist in database and we're enabling, create it
      if (calendarData && !calendarData.connectionExists && newState) {
        const response = await fetch('/api/v1/calendar/connections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wsId,
            calendarId: calendarData.calendar_id,
            calendarName: calendarData.calendar_name,
            color: calendarData.color,
            isEnabled: true,
            authTokenId: calendarData.accountId,
          }),
        });

        if (!response.ok) {
          // Handle 409 Conflict - calendar already exists, update it instead
          if (response.status === 409) {
            // Calendar already exists, make a PATCH request to enable it
            const patchResponse = await fetch('/api/v1/calendar/connections', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                // Use calendar_id to find the connection since we don't have the connection ID
                calendarId: calendarData.calendar_id,
                wsId,
                isEnabled: true,
              }),
            });

            if (patchResponse.ok) {
              // Update local state immediately
              updateCalendarConnection(calendarId, true);
              queryClient.invalidateQueries({
                queryKey: ['google-calendar-list', wsId],
              });
              queryClient.invalidateQueries({
                queryKey: ['calendar-connections', wsId],
              });
              toast.success(t('calendar_enabled'));
            } else {
              toast.error(t('toggle_failed'));
            }
          } else {
            const errorText = await response.text().catch(() => '');
            console.error('Failed to create connection:', {
              status: response.status,
              statusText: response.statusText,
              rawText: errorText,
            });
            toast.error(t('toggle_failed'));
          }
        } else {
          // Update local state immediately
          updateCalendarConnection(calendarId, true);
          // Invalidate queries to refresh the list
          queryClient.invalidateQueries({
            queryKey: ['google-calendar-list', wsId],
          });
          queryClient.invalidateQueries({
            queryKey: ['calendar-connections', wsId],
          });
          toast.success(t('calendar_enabled'));
        }
      } else {
        // Update existing connection
        updateCalendarConnection(calendarId, newState);

        const response = await fetch('/api/v1/calendar/connections', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: calendarId, isEnabled: newState }),
        });

        if (!response.ok) {
          updateCalendarConnection(calendarId, currentState);
          toast.error(t('toggle_failed'));
        }
      }
    } catch {
      if (calendarData?.connectionExists) {
        updateCalendarConnection(calendarId, currentState);
      }
      toast.error(t('toggle_failed'));
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(calendarId);
        return next;
      });
    }
  };

  const toggleAccountExpanded = (accountId: string) => {
    setExpandedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

  const enabledCount = calendarConnections.filter((c) => c.is_enabled).length;
  const syncStatusStyles =
    syncStatus.state === 'syncing'
      ? 'bg-dynamic-blue/10 text-dynamic-blue'
      : syncStatus.state === 'success'
        ? 'bg-dynamic-green/10 text-dynamic-green'
        : 'bg-dynamic-red/10 text-dynamic-red';

  // Fetch Google calendars from API (must be before any conditional returns)
  const { data: googleCalendarsData } = useQuery({
    queryKey: ['google-calendar-list', wsId],
    enabled: hasConnectedAccounts,
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/calendar/auth/list-calendars?wsId=${wsId}`
      );
      if (!response.ok) return { calendars: [], byAccount: {} };
      return response.json() as Promise<{
        calendars: GoogleCalendar[];
        byAccount: Record<string, GoogleCalendar[]>;
      }>;
    },
    staleTime: 30_000,
  });

  const calendarsByAccountFromAPI = googleCalendarsData?.byAccount || {};

  // Merge API calendars with existing connections for visibility state
  const calendarsByAccount = accounts.reduce(
    (acc, account) => {
      const apiCalendars = calendarsByAccountFromAPI[account.id] || [];

      // Map API calendars to connection-like objects, merging with existing connections
      acc[account.id] = apiCalendars.map((apiCal) => {
        // Find existing connection for this calendar
        const existingConnection = calendarConnections.find(
          (conn) => conn.calendar_id === apiCal.id
        );

        return {
          id: existingConnection?.id || apiCal.id,
          ws_id: wsId,
          calendar_id: apiCal.id,
          calendar_name: apiCal.name,
          is_enabled: existingConnection?.is_enabled ?? false, // Default to hidden if no connection exists
          color: existingConnection?.color || apiCal.backgroundColor,
          isFromAPI: true,
          connectionExists: !!existingConnection,
          accountId: account.id,
        };
      });

      return acc;
    },
    {} as Record<
      string,
      Array<{
        id: string;
        ws_id: string;
        calendar_id: string;
        calendar_name: string;
        is_enabled: boolean;
        color: string | null;
        isFromAPI: boolean;
        connectionExists: boolean;
        accountId: string;
      }>
    >
  );

  // Show connect button if no accounts
  if (!hasConnectedAccounts && !isLoadingAccounts) {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t('connect_calendar')}</span>
            <span className="sm:hidden">{t('connect')}</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('connect_calendar')}</DialogTitle>
            <DialogDescription>
              {t('manage_calendar_accounts_desc')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <Button
              variant="outline"
              className="h-14 justify-start gap-3"
              onClick={() => googleAuthMutation.mutate()}
              disabled={googleAuthMutation.isPending}
            >
              {googleAuthMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Image
                  src="/media/logos/google.svg"
                  alt="Google"
                  width={20}
                  height={20}
                />
              )}
              <div className="text-left">
                <div className="font-medium">{t('google_calendar')}</div>
                <div className="text-muted-foreground text-xs">
                  {t('connect_google_desc')}
                </div>
              </div>
            </Button>
            {DEV_MODE ? (
              <Button
                variant="outline"
                className="h-14 justify-start gap-3"
                onClick={() => microsoftAuthMutation.mutate()}
                disabled={microsoftAuthMutation.isPending}
              >
                {microsoftAuthMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Image
                    src="/media/logos/microsoft.svg"
                    alt="Microsoft"
                    width={20}
                    height={20}
                  />
                )}
                <div className="text-left">
                  <div className="font-medium">{t('microsoft_outlook')}</div>
                  <div className="text-muted-foreground text-xs">
                    {t('connect_microsoft_desc')}
                  </div>
                </div>
              </Button>
            ) : (
              <div className="flex h-14 items-center gap-3 rounded-md border border-dashed px-4 opacity-60">
                <Image
                  src="/media/logos/microsoft.svg"
                  alt="Microsoft"
                  width={20}
                  height={20}
                  className="opacity-50"
                />
                <div className="text-left">
                  <div className="font-medium text-muted-foreground">
                    {t('microsoft_outlook')}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {t('coming_soon')}
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* Quick calendar visibility toggle */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">{t('calendars')}</span>
            {enabledCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {enabledCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-sm">
                  {t('visible_calendars')}
                </h4>
                <p className="text-muted-foreground text-xs">
                  {t('toggle_calendars_desc')}
                </p>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Settings className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{t('manage_calendar_accounts')}</DialogTitle>
                    <DialogDescription>
                      {t('manage_calendar_accounts_desc')}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    {/* Connected accounts with calendars */}
                    {accounts.map((account) => (
                      <Collapsible
                        key={account.id}
                        open={expandedAccounts.has(account.id)}
                        onOpenChange={() => toggleAccountExpanded(account.id)}
                      >
                        <div className="rounded-lg border">
                          <CollapsibleTrigger className="flex w-full items-center justify-between p-3 transition-colors hover:bg-muted/50">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                                <Image
                                  src={
                                    account.provider === 'google'
                                      ? '/media/logos/google.svg'
                                      : '/media/logos/microsoft.svg'
                                  }
                                  alt={account.provider}
                                  width={18}
                                  height={18}
                                />
                              </div>
                              <div className="text-left">
                                <p className="font-medium text-sm">
                                  {account.account_name ||
                                    account.account_email ||
                                    t('unknown_account')}
                                </p>
                                {account.account_email &&
                                  account.account_name && (
                                    <p className="text-muted-foreground text-xs">
                                      {account.account_email}
                                    </p>
                                  )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className="text-xs capitalize"
                              >
                                {account.provider}
                              </Badge>
                              <ChevronDown
                                className={`h-4 w-4 transition-transform ${expandedAccounts.has(account.id) ? 'rotate-180' : ''}`}
                              />
                            </div>
                          </CollapsibleTrigger>

                          <CollapsibleContent>
                            <Separator />
                            <div className="space-y-2 p-3">
                              {(calendarsByAccount[account.id] || []).length >
                              0 ? (
                                (calendarsByAccount[account.id] || []).map(
                                  (cal) => (
                                    <div
                                      key={cal.id}
                                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                                    >
                                      <div className="flex min-w-0 flex-1 items-center gap-2">
                                        <div
                                          className="h-3 w-3 shrink-0 rounded-full"
                                          style={{
                                            backgroundColor:
                                              cal.color || '#4285f4',
                                          }}
                                        />
                                        <span
                                          className="line-clamp-1 break-all text-sm"
                                          title={cal.calendar_name}
                                        >
                                          {cal.calendar_name}
                                        </span>
                                      </div>
                                      <Switch
                                        checked={cal.is_enabled}
                                        onCheckedChange={() =>
                                          handleToggle(cal.id, cal.is_enabled, {
                                            calendar_id: cal.calendar_id,
                                            calendar_name: cal.calendar_name,
                                            color: cal.color,
                                            connectionExists:
                                              cal.connectionExists,
                                            accountId: cal.accountId,
                                          })
                                        }
                                        disabled={togglingIds.has(cal.id)}
                                      />
                                    </div>
                                  )
                                )
                              ) : (
                                <p className="py-2 text-center text-muted-foreground text-xs">
                                  {t('no_calendars_found')}
                                </p>
                              )}

                              <Separator className="my-2" />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() =>
                                  disconnectMutation.mutate(account.id)
                                }
                                disabled={disconnectingId === account.id}
                              >
                                {disconnectingId === account.id ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="mr-2 h-4 w-4" />
                                )}
                                {t('disconnect')}
                              </Button>
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    ))}

                    {/* Add new account buttons */}
                    <div className="space-y-2 pt-2">
                      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                        {t('add_account')}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 text-center"
                          onClick={() => googleAuthMutation.mutate()}
                          disabled={googleAuthMutation.isPending}
                        >
                          {googleAuthMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Image
                              src="/media/logos/google.svg"
                              alt="Google"
                              width={16}
                              height={16}
                            />
                          )}
                          {t('google')}
                        </Button>
                        {DEV_MODE ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 text-center"
                            onClick={() => microsoftAuthMutation.mutate()}
                            disabled={microsoftAuthMutation.isPending}
                          >
                            {microsoftAuthMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Image
                                src="/media/logos/microsoft.svg"
                                alt="Microsoft"
                                width={16}
                                height={16}
                              />
                            )}
                            {t('outlook')}
                          </Button>
                        ) : (
                          <div className="flex h-8 items-center justify-center gap-2 rounded-md border border-dashed px-2 text-center text-muted-foreground text-xs opacity-60">
                            <Image
                              src="/media/logos/microsoft.svg"
                              alt="Microsoft"
                              width={16}
                              height={16}
                              className="opacity-50"
                            />
                            {t('coming_soon')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <Separator />

            {/* Calendar list grouped by account */}
            <div className="max-h-64 space-y-3 overflow-y-auto">
              {accounts.map((account) => {
                const accountCals = calendarsByAccount[account.id] || [];
                if (accountCals.length === 0) return null;

                return (
                  <div key={account.id} className="space-y-1">
                    <div className="flex items-center gap-2 px-1">
                      <Image
                        src={
                          account.provider === 'google'
                            ? '/media/logos/google.svg'
                            : '/media/logos/microsoft.svg'
                        }
                        alt={account.provider}
                        width={12}
                        height={12}
                      />
                      <span className="truncate text-muted-foreground text-xs">
                        {account.account_email || account.account_name}
                      </span>
                    </div>
                    {accountCals.map((cal) => (
                      <div
                        key={cal.id}
                        className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: cal.color || '#4285f4' }}
                          />
                          <span className="line-clamp-1 max-w-45 break-all text-sm">
                            {cal.calendar_name}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() =>
                            handleToggle(cal.id, cal.is_enabled, {
                              calendar_id: cal.calendar_id,
                              calendar_name: cal.calendar_name,
                              color: cal.color,
                              connectionExists: cal.connectionExists,
                              accountId: cal.accountId,
                            })
                          }
                          disabled={togglingIds.has(cal.id)}
                        >
                          {togglingIds.has(cal.id) ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : cal.is_enabled ? (
                            <Eye className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                );
              })}

              {calendarConnections.length === 0 && (
                <p className="py-4 text-center text-muted-foreground text-sm">
                  {t('no_calendars_synced')}
                </p>
              )}
            </div>

            <Separator />

            {/* Sync actions */}
            <div className="flex items-center justify-between">
              <div
                className={`rounded-full px-2 py-0.5 text-xs ${syncStatusStyles}`}
              >
                {syncStatus.state === 'syncing' && (
                  <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                )}
                {syncStatus.message || t('synced')}
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => syncToTuturuuu()}
                  disabled={isSyncing}
                  title={t('sync_from_google')}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`}
                  />
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
