import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CalendarSourceOption,
  getGoogleCalendarAuthUrl,
  getWorkspaceCalendarDefaultSource,
  getWorkspaceCalendarSyncPreferences,
  updateCalendarConnection as updateCalendarConnectionRequest,
  updateWorkspaceCalendarDefaultSource,
  updateWorkspaceCalendarSyncPreferences,
} from '@tuturuuu/internal-api/calendar';
import { createClient } from '@tuturuuu/supabase/next/client';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useCalendarSync } from '../../../../hooks/use-calendar-sync';
import { toast } from '../../sonner';
import type {
  AuthResponse,
  CalendarSyncHealth,
  ConnectedAccount,
  ProviderCalendar,
} from './calendar-types';

interface AccountsResponse {
  accounts: ConnectedAccount[];
  grouped: {
    google: ConnectedAccount[];
    microsoft: ConnectedAccount[];
  };
  total: number;
}

interface WorkspaceCalendar {
  id: string;
  ws_id: string;
  name: string;
  description: string | null;
  color: string | null;
  calendar_type: 'primary' | 'tasks' | 'habits' | 'custom';
  is_system: boolean;
  is_enabled: boolean;
  position: number;
}

interface WorkspaceCalendarsResponse {
  calendars: WorkspaceCalendar[];
  grouped: {
    system: WorkspaceCalendar[];
    custom: WorkspaceCalendar[];
  };
  total: number;
}

interface ManualSyncResponse {
  ok: boolean;
  alreadyRunning?: boolean;
  code?: string;
  error?: string;
  retryAfterSeconds?: number | null;
}

export type CalendarConnectionsUnifiedVariant = 'compact' | 'settings';

function sourceInputFromOption(option: CalendarSourceOption) {
  if (option.provider === 'tuturuuu') {
    return {
      provider: 'tuturuuu' as const,
      workspaceCalendarId: option.workspaceCalendarId,
    };
  }

  return {
    provider: option.provider,
    connectionId: option.connectionId,
  };
}

export function useCalendarConnectionsManager(wsId: string) {
  const t = useTranslations('calendar');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [togglingTuturuuuIds, setTogglingTuturuuuIds] = useState<Set<string>>(
    new Set()
  );
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(
    new Set()
  );
  const [expandedPopoverAccounts, setExpandedPopoverAccounts] = useState<
    Set<string>
  >(
    new Set(['tuturuuu']) // Tuturuuu expanded by default
  );
  const [showCreateCalendarDialog, setShowCreateCalendarDialog] =
    useState(false);
  const [newCalendarName, setNewCalendarName] = useState('');

  const {
    calendarConnections,
    updateCalendarConnection,
    setCalendarConnections,
    syncToTuturuuu,
    isSyncing,
  } = useCalendarSync();

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/calendar/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: 'inbound', source: 'manual' }),
      });

      const result = (await response.json()) as ManualSyncResponse &
        Record<string, unknown>;
      if (!response.ok) {
        throw new Error(
          typeof result.error === 'string'
            ? result.error
            : 'Failed to sync calendars'
        );
      }

      return result;
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: ['calendar-sync-status', wsId],
      });
      await queryClient.invalidateQueries({
        queryKey: ['databaseCalendarEvents', wsId],
        exact: false,
      });

      if (!result.alreadyRunning) {
        toast.success(t('calendar_sync_started') || 'Calendar sync started');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Fetch connected accounts
  const { data: accountsData, isLoading: isLoadingAccounts } = useQuery({
    queryKey: ['calendar-accounts', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/calendar/auth/accounts?wsId=${wsId}`,
        { cache: 'no-store' }
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

  const { data: syncStatusData } = useQuery({
    queryKey: ['calendar-sync-status', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/calendar/sync-status`,
        { cache: 'no-store' }
      );
      if (!response.ok) return null;
      return response.json() as Promise<{
        health: CalendarSyncHealth;
        accountsSummary: { total: number; google: number; microsoft: number };
        connectionsSummary: { total: number; enabled: number };
      }>;
    },
    staleTime: 15_000,
  });

  const { data: defaultSourceData } = useQuery({
    queryKey: ['calendar-default-source', wsId],
    queryFn: () => getWorkspaceCalendarDefaultSource(wsId),
    staleTime: 30_000,
  });

  const { data: syncPreferencesData } = useQuery({
    queryKey: ['calendar-sync-preferences', wsId],
    queryFn: () => getWorkspaceCalendarSyncPreferences(wsId),
    staleTime: 30_000,
  });

  const defaultSourceMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      const option = defaultSourceData?.options.find(
        (candidate) => candidate.id === sourceId
      );
      if (!option) throw new Error('Calendar source is unavailable');

      return updateWorkspaceCalendarDefaultSource(
        wsId,
        sourceInputFromOption(option)
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['calendar-default-source', wsId],
      });
      toast.success(
        t('default_calendar_updated') || 'Default calendar updated'
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update default calendar');
    },
  });

  const syncPreferencesMutation = useMutation({
    mutationFn: (
      payload: Parameters<typeof updateWorkspaceCalendarSyncPreferences>[1]
    ) => updateWorkspaceCalendarSyncPreferences(wsId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['calendar-sync-preferences', wsId],
      });
      toast.success(
        t('calendar_sync_settings_updated') || 'Calendar sync settings updated'
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update calendar sync settings');
    },
  });

  const updateConnectionSyncSettingsMutation = useMutation({
    mutationFn: (
      payload: Parameters<typeof updateCalendarConnectionRequest>[0]
    ) => updateCalendarConnectionRequest(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['calendar-connections', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['provider-calendar-list', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['calendar-sync-preferences', wsId],
      });
      toast.success(
        t('calendar_sync_settings_updated') || 'Calendar sync settings updated'
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update calendar sync settings');
    },
  });

  // Fetch current user's email
  const { data: userEmail } = useQuery({
    queryKey: ['current-user-email'],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user?.email || null;
    },
    staleTime: Infinity, // User email rarely changes
  });

  // Fetch workspace calendars (Tuturuuu native calendars)
  const {
    data: workspaceCalendarsData,
    isLoading: isLoadingWorkspaceCalendars,
  } = useQuery({
    queryKey: ['workspace-calendars', wsId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/calendars`, {
        cache: 'no-store',
      });
      if (!response.ok)
        return { calendars: [], grouped: { system: [], custom: [] }, total: 0 };
      return response.json() as Promise<WorkspaceCalendarsResponse>;
    },
    staleTime: 30_000,
  });

  const isLoadingCalendars = isLoadingAccounts || isLoadingWorkspaceCalendars;

  const workspaceCalendars = workspaceCalendarsData?.calendars || [];
  const systemCalendars = workspaceCalendarsData?.grouped?.system || [];
  const customCalendars = workspaceCalendarsData?.grouped?.custom || [];

  // Calendar color mapping helper
  const getCalendarColor = (color: string): string => {
    const colorMap: Record<string, string> = {
      BLUE: '#3b82f6',
      RED: '#ef4444',
      GREEN: '#22c55e',
      YELLOW: '#eab308',
      ORANGE: '#f97316',
      PURPLE: '#a855f7',
      PINK: '#ec4899',
      CYAN: '#06b6d4',
      GRAY: '#6b7280',
    };
    return colorMap[color.toUpperCase()] || color;
  };

  // Calculate total enabled calendars count
  const tuturuuuEnabledCount = workspaceCalendars.filter(
    (c) => c.is_enabled
  ).length;

  // Toggle workspace calendar visibility
  const toggleWorkspaceCalendarMutation = useMutation({
    mutationFn: async ({
      id,
      is_enabled,
    }: {
      id: string;
      is_enabled: boolean;
    }) => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/calendars`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_enabled }),
      });
      if (!response.ok) throw new Error('Failed to toggle calendar');
      return response.json();
    },
    onMutate: ({ id }) => {
      setTogglingTuturuuuIds((prev) => new Set(prev).add(id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-calendars', wsId],
      });
    },
    onError: () =>
      toast.error(t('calendar_toggle_failed') || 'Failed to toggle calendar'),
    onSettled: (_, __, { id }) => {
      setTogglingTuturuuuIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
  });

  // Create custom calendar
  const createCalendarMutation = useMutation({
    mutationFn: async (data: { name: string; color?: string }) => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/calendars`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create calendar');
      return response.json();
    },
    onSuccess: () => {
      toast.success(t('calendar_created') || 'Calendar created');
      queryClient.invalidateQueries({
        queryKey: ['workspace-calendars', wsId],
      });
    },
    onError: () =>
      toast.error(t('calendar_creation_failed') || 'Failed to create calendar'),
  });

  // Delete custom calendar
  const deleteCalendarMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/calendars?id=${id}`,
        {
          method: 'DELETE',
        }
      );
      if (!response.ok) throw new Error('Failed to delete calendar');
      return response.json();
    },
    onSuccess: () => {
      toast.success(t('calendar_deleted') || 'Calendar deleted');
      queryClient.invalidateQueries({
        queryKey: ['workspace-calendars', wsId],
      });
    },
    onError: () =>
      toast.error(t('calendar_deletion_failed') || 'Failed to delete calendar'),
  });

  // Reset all calendar data
  const resetCalendarDataMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/calendars/reset`,
        { method: 'POST' }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to reset calendar data');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success(
        t('calendar_data_reset') || 'Calendar data reset successfully'
      );
      // Clear the calendar connections immediately
      setCalendarConnections([]);
      // Refetch all calendar-related queries to ensure UI updates
      queryClient.refetchQueries({
        queryKey: ['workspace-calendars', wsId],
      });
      queryClient.refetchQueries({ queryKey: ['calendar-accounts', wsId] });
      queryClient.refetchQueries({
        queryKey: ['databaseCalendarEvents', wsId],
      });
      queryClient.refetchQueries({
        queryKey: ['googleCalendarEvents', wsId],
      });
      queryClient.refetchQueries({
        queryKey: ['calendar-connections'],
      });
      // Refresh the page to reload server data
      router.refresh();
    },
    onError: (error: Error) => {
      toast.error(
        error.message ||
          t('calendar_reset_failed') ||
          'Failed to reset calendar data'
      );
    },
  });

  // Google auth mutation
  const googleAuthMutation = useMutation<AuthResponse, Error, void>({
    mutationKey: ['calendar', 'google-auth', wsId],
    mutationFn: () => getGoogleCalendarAuthUrl(wsId),
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
      const response = await fetch(
        `/api/v1/calendar/auth/accounts?accountId=${accountId}&wsId=${wsId}`,
        { method: 'DELETE' }
      );
      if (!response.ok) throw new Error('Failed to disconnect');
      return response.json();
    },
    onMutate: (accountId) => {
      setDisconnectingId(accountId);
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
      accessRole?: string;
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
            accessRole: calendarData.accessRole,
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
                authTokenId: calendarData.accountId,
                isEnabled: true,
                accessRole: calendarData.accessRole,
              }),
            });

            if (patchResponse.ok) {
              // Update local state immediately
              updateCalendarConnection(calendarId, true);
              queryClient.invalidateQueries({
                queryKey: ['provider-calendar-list', wsId],
              });
              queryClient.invalidateQueries({
                queryKey: ['calendar-connections', wsId],
              });
              toast.success(t('calendar_enabled'));
            } else {
              toast.error(t('toggle_failed'));
            }
          } else {
            toast.error(t('toggle_failed'));
          }
        } else {
          // Update local state immediately
          updateCalendarConnection(calendarId, true);
          // Invalidate queries to refresh the list
          queryClient.invalidateQueries({
            queryKey: ['provider-calendar-list', wsId],
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

  const enabledCount =
    calendarConnections.filter((c) => c.is_enabled).length +
    tuturuuuEnabledCount;
  const syncHealth = syncStatusData?.health;
  const manualSyncDisabled = useMemo(() => {
    if (syncMutation.isPending || isSyncing) {
      return true;
    }

    if (syncHealth?.currentlyRunning) {
      return true;
    }

    if ((syncHealth?.retryAfterSeconds ?? 0) > 0) {
      return true;
    }

    return false;
  }, [
    isSyncing,
    syncHealth?.currentlyRunning,
    syncHealth?.retryAfterSeconds,
    syncMutation.isPending,
  ]);
  const syncStatusStyles =
    syncHealth?.state === 'syncing'
      ? 'bg-dynamic-blue/10 text-dynamic-blue'
      : syncHealth?.state === 'healthy'
        ? 'bg-dynamic-green/10 text-dynamic-green'
        : syncHealth?.state === 'disconnected'
          ? 'bg-muted text-muted-foreground'
          : syncHealth?.state === 'degraded'
            ? 'bg-dynamic-orange/10 text-dynamic-orange'
            : 'bg-dynamic-red/10 text-dynamic-red';

  // Fetch Google calendars from API (must be before any conditional returns)
  const { data: googleCalendarsData } = useQuery({
    queryKey: ['provider-calendar-list', wsId],
    enabled: hasConnectedAccounts,
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/calendar/auth/provider-calendars?wsId=${wsId}`,
        { cache: 'no-store' }
      );
      if (!response.ok) return { calendars: [], byAccount: {} };
      return response.json() as Promise<{
        calendars: ProviderCalendar[];
        byAccount: Record<string, ProviderCalendar[]>;
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
          (conn) =>
            conn.calendar_id === apiCal.id && conn.auth_token_id === account.id
        ) as
          | ((typeof calendarConnections)[number] & {
              sync_delete_enabled?: boolean | null;
              sync_inbound_enabled?: boolean | null;
              sync_outbound_enabled?: boolean | null;
            })
          | undefined;

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
          accessRole: apiCal.accessRole,
          syncDeleteEnabled: existingConnection?.sync_delete_enabled ?? true,
          syncInboundEnabled: existingConnection?.sync_inbound_enabled ?? true,
          syncOutboundEnabled:
            existingConnection?.sync_outbound_enabled ?? false,
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
        accessRole: string;
        syncDeleteEnabled: boolean;
        syncInboundEnabled: boolean;
        syncOutboundEnabled: boolean;
      }>
    >
  );

  // Note: Removed early return - we always show the full UI now so Tuturuuu calendars are visible

  return {
    accounts,
    calendarConnections,
    calendarsByAccount,
    createCalendarMutation,
    customCalendars,
    defaultSourceData,
    defaultSourceMutation,
    deleteCalendarMutation,
    disconnectingId,
    disconnectMutation,
    enabledCount,
    expandedAccounts,
    expandedPopoverAccounts,
    getCalendarColor,
    googleAuthMutation,
    handleToggle,
    hasConnectedAccounts,
    isLoadingCalendars,
    isSyncing,
    manualSyncDisabled,
    microsoftAuthMutation,
    newCalendarName,
    resetCalendarDataMutation,
    setExpandedPopoverAccounts,
    setNewCalendarName,
    setShowCreateCalendarDialog,
    showCreateCalendarDialog,
    syncHealth,
    syncMutation,
    syncPreferencesData,
    syncPreferencesMutation,
    syncStatusStyles,
    syncToTuturuuu,
    systemCalendars,
    t,
    togglingIds,
    togglingTuturuuuIds,
    toggleAccountExpanded,
    toggleWorkspaceCalendarMutation,
    updateConnectionSyncSettingsMutation,
    tuturuuuEnabledCount,
    userEmail,
    workspaceCalendars,
    wsId,
  };
}

export type CalendarConnectionsManagerState = ReturnType<
  typeof useCalendarConnectionsManager
>;
