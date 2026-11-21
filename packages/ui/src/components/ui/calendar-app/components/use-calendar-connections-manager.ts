import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CalendarSyncResult,
  createCalendarConnection,
  createWorkspaceCalendar,
  deleteWorkspaceCalendar,
  disconnectCalendarAccount,
  getGoogleCalendarAuthUrl,
  getMicrosoftCalendarAuthUrl,
  getWorkspaceCalendarDefaultSource,
  getWorkspaceCalendarSyncPreferences,
  listCalendarAccounts,
  listProviderCalendars,
  listWorkspaceCalendars,
  resetWorkspaceCalendars,
  updateCalendarConnection as updateCalendarConnectionRequest,
  updateWorkspaceCalendarDefaultSource,
  updateWorkspaceCalendarSyncPreferences,
  updateWorkspaceCalendar,
} from '@tuturuuu/internal-api/calendar';
import {
  InternalApiError,
  resolveInternalApiUrl,
} from '@tuturuuu/internal-api/client';
import { getCurrentUserProfile } from '@tuturuuu/internal-api/users';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { runCalendarProviderSync } from '../../../../hooks/calendar-provider-sync';
import { useCalendarSync } from '../../../../hooks/use-calendar-sync';
import { toast } from '../../sonner';
import {
  type AccountsResponse,
  getCalendarColor,
  sourceInputFromOption,
} from './calendar-connections-manager-helpers';
import type { AuthResponse } from './calendar-types';
import {
  calendarSyncStatusStyles,
  deriveCalendarSyncStatus,
} from './calendar-sync-status';
import { mergeProviderCalendarsByAccount } from './merge-provider-calendars';
import { calendarSyncStatusQueryOptions } from './refresh-calendar-sync-status';

export type CalendarConnectionsUnifiedVariant =
  | 'compact'
  | 'settings'
  | 'status';

function mountedProviderStart(
  providerPath: '/api/v1/calendar/auth' | '/api/v1/calendar/auth/microsoft',
  wsId: string,
  reconnect = false
): AuthResponse | undefined {
  const path = resolveInternalApiUrl(providerPath);
  if (path !== `/calendar${providerPath}`) return;
  const search = new URLSearchParams({ wsId, navigation: '1' });
  if (reconnect) search.set('reconnect', '1');
  return { authUrl: `${path}?${search}` };
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
    isActiveSyncOn,
    isSyncing,
  } = useCalendarSync();

  const syncMutation = useMutation<CalendarSyncResult>({
    mutationKey: ['calendar-provider-sync', wsId],
    mutationFn: () => runCalendarProviderSync(queryClient, wsId),
    onSuccess: (result) => {
      if (!result.ok) toast.error(t('sync_recovery.partial_failure'));
      else if (result.alreadyRunning) toast.info(t('syncing_calendars'));
      else toast.success(t('sync_recovery.completed'));
    },
    onError: () => toast.error(t('sync_recovery.failed')),
    onSettled: async () => {
      await Promise.all(
        [
          ['calendar-sync-status', wsId],
          ['provider-calendar-list', wsId],
          ['databaseCalendarEvents', wsId],
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
      );
    },
  });

  const pauseFailedCalendarMutation = useMutation({
    mutationFn: (connectionId: string) =>
      updateCalendarConnectionRequest({
        id: connectionId,
        wsId,
        syncInboundEnabled: false,
      }),
    onSuccess: async (_, connectionId) => {
      setCalendarConnections((current) =>
        current.map((connection) =>
          connection.id === connectionId
            ? { ...connection, sync_inbound_enabled: false }
            : connection
        )
      );
      await Promise.all(
        [
          ['calendar-sync-status', wsId],
          ['calendar-connections', wsId],
          ['provider-calendar-list', wsId],
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
      );
      toast.success(t('sync_recovery.calendar_paused'));
    },
    onError: () => toast.error(t('sync_recovery.pause_failed')),
  });

  const accountsQuery = useQuery({
    queryKey: ['calendar-accounts', wsId],
    queryFn: () => listCalendarAccounts(wsId) as Promise<AccountsResponse>,
    staleTime: 30_000,
    retry: 1,
  });
  const accounts = accountsQuery.data?.accounts || [];
  const needsReconnectAccounts = accountsQuery.data?.needsReconnect ?? [];
  const isLoadingAccounts = accountsQuery.isLoading;
  const hasConnectedAccounts = accounts.length > 0;
  const syncStatusQuery = useQuery(
    calendarSyncStatusQueryOptions(
      queryClient,
      wsId,
      isSyncing || !isActiveSyncOn
    )
  );
  const syncStatusData = syncStatusQuery.data;

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

  const { data: userEmail } = useQuery({
    queryKey: ['current-user-email'],
    queryFn: async () => (await getCurrentUserProfile()).email,
    staleTime: Infinity, // User email rarely changes
  });

  // Fetch workspace calendars (Tuturuuu native calendars)
  const {
    data: workspaceCalendarsData,
    isLoading: isLoadingWorkspaceCalendars,
  } = useQuery({
    queryKey: ['workspace-calendars', wsId],
    queryFn: () => listWorkspaceCalendars(wsId),
    staleTime: 30_000,
  });

  const isLoadingCalendars = isLoadingAccounts || isLoadingWorkspaceCalendars;

  const workspaceCalendars = workspaceCalendarsData?.calendars || [];
  const systemCalendars = workspaceCalendarsData?.grouped?.system || [];
  const customCalendars = workspaceCalendarsData?.grouped?.custom || [];

  // Calculate total enabled calendars count
  const tuturuuuEnabledCount = workspaceCalendars.filter(
    (c) => c.is_enabled
  ).length;

  // Toggle workspace calendar visibility
  const toggleWorkspaceCalendarMutation = useMutation({
    mutationFn: (payload: { id: string; is_enabled: boolean }) =>
      updateWorkspaceCalendar(wsId, payload),
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
    mutationFn: (data: { name: string; color?: string }) =>
      createWorkspaceCalendar(wsId, data),
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
    mutationFn: (id: string) => deleteWorkspaceCalendar(wsId, id),
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
    mutationFn: () => resetWorkspaceCalendars(wsId),
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
  const googleAuthMutation = useMutation<
    AuthResponse,
    Error,
    { reconnect?: boolean } | void
  >({
    mutationKey: ['calendar', 'google-auth', wsId],
    mutationFn: async (variables) =>
      mountedProviderStart(
        '/api/v1/calendar/auth',
        wsId,
        variables?.reconnect
      ) ?? getGoogleCalendarAuthUrl(wsId, undefined, !!variables?.reconnect),
    onSuccess: (data) => {
      if (data.authUrl) window.location.href = data.authUrl;
      else toast.error(t('auth_url_invalid'));
    },
    onError: () => toast.error(t('google_auth_failed')),
  });

  // Microsoft auth mutation
  const microsoftAuthMutation = useMutation<AuthResponse, Error, void>({
    mutationKey: ['calendar', 'microsoft-auth', wsId],
    mutationFn: async () =>
      mountedProviderStart('/api/v1/calendar/auth/microsoft', wsId) ??
      getMicrosoftCalendarAuthUrl(wsId),
    onSuccess: (data) => {
      if (data.authUrl) window.location.href = data.authUrl;
      else toast.error(t('auth_url_invalid'));
    },
    onError: () => toast.error(t('microsoft_auth_failed')),
  });

  // Disconnect account mutation
  const disconnectMutation = useMutation({
    mutationFn: (accountId: string) =>
      disconnectCalendarAccount(wsId, accountId),
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

    const create = !!calendarData && !calendarData.connectionExists && newState;
    try {
      if (create) {
        const connection = {
          calendarId: calendarData.calendar_id,
          authTokenId: calendarData.accountId,
          accessRole: calendarData.accessRole,
          isEnabled: true,
        };
        try {
          await createCalendarConnection(wsId, {
            ...connection,
            calendarName: calendarData.calendar_name,
            color: calendarData.color,
          });
        } catch (error) {
          if (!(error instanceof InternalApiError && error.status === 409))
            throw error;
          await updateCalendarConnectionRequest({ ...connection, wsId });
        }
        updateCalendarConnection(calendarId, true);
        queryClient.invalidateQueries({
          queryKey: ['provider-calendar-list', wsId],
        });
        queryClient.invalidateQueries({
          queryKey: ['calendar-connections', wsId],
        });
        toast.success(t('calendar_enabled'));
      } else {
        updateCalendarConnection(calendarId, newState);
        await updateCalendarConnectionRequest({
          id: calendarId,
          isEnabled: newState,
        });
      }
    } catch {
      if (!create) updateCalendarConnection(calendarId, currentState);
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
  const providerCalendarsQuery = useQuery({
    queryKey: ['provider-calendar-list', wsId],
    enabled: hasConnectedAccounts,
    queryFn: () => listProviderCalendars(wsId),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const calendarsByAccountFromAPI =
    providerCalendarsQuery.data?.byAccount || {};
  const providerAccountStatuses =
    providerCalendarsQuery.data?.accountStatuses || {};
  const syncStatusError =
    accountsQuery.isError ||
    syncStatusQuery.isError ||
    providerCalendarsQuery.isError;
  const retrySyncStatus = () =>
    Promise.all([
      accountsQuery.refetch(),
      syncStatusQuery.refetch(),
      providerCalendarsQuery.refetch(),
    ]);
  const syncStatus = deriveCalendarSyncStatus({
    status: syncStatusData,
    queryErrored: syncStatusError,
    accountsLoaded: accountsQuery.isSuccess,
    accounts,
    needsReconnectAccounts,
    providerAccountStatuses,
    syncMutation,
  });

  const calendarsByAccount = mergeProviderCalendarsByAccount({
    accounts,
    calendarConnections,
    liveCalendarsByAccount: calendarsByAccountFromAPI,
    wsId,
  });

  return {
    accounts,
    failedCalendars: syncStatusData?.failedCalendars ?? [],
    pauseFailedCalendarMutation,
    calendarConnections,
    calendarsByAccount,
    providerAccountStatuses,
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
    needsReconnectAccounts,
    newCalendarName,
    resetCalendarDataMutation,
    setExpandedPopoverAccounts,
    setNewCalendarName,
    setShowCreateCalendarDialog,
    showCreateCalendarDialog,
    syncHealth,
    syncStatusError,
    retrySyncStatus,
    syncMutation,
    syncPreferencesData,
    syncPreferencesMutation,
    syncStatus,
    syncStatusStyles: calendarSyncStatusStyles(syncStatus),
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
