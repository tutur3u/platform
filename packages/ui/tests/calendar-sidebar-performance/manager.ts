import { useTranslations } from 'next-intl';
import { useState } from 'react';

const mutation = {
  mutate: () => undefined,
  isPending: false,
  isError: false,
  submittedAt: 0,
};

export function useCalendarConnectionsManager(wsId: string) {
  const t = useTranslations('calendar');
  const [checked, setChecked] = useState(true);
  const [newCalendarName, setNewCalendarName] = useState('');
  const [showCreateCalendarDialog, setShowCreateCalendarDialog] =
    useState(false);
  const query = new URLSearchParams(location.search);
  const empty = query.get('data') === 'empty';
  const calendar = {
    id: 'synthetic-calendar',
    name: 'Synthetic calendar',
    color: 'BLUE',
    is_enabled: checked,
    is_system: true,
    calendar_type: 'primary',
  };

  return {
    wsId,
    t,
    accounts: [],
    calendarsByAccount: {},
    providerAccountStatuses: {},
    needsReconnectAccounts: [],
    failedCalendars: [],
    workspaceCalendars: empty ? [] : [calendar],
    systemCalendars: empty ? [] : [calendar],
    customCalendars: [],
    enabledCount: empty || !checked ? 0 : 1,
    isLoadingCalendars: query.get('data') === 'loading',
    isSyncing: false,
    manualSyncDisabled: false,
    syncStatusError: false,
    togglingIds: new Set<string>(),
    togglingTuturuuuIds: new Set<string>(),
    expandedAccounts: new Set<string>(),
    syncMutation: mutation,
    createCalendarMutation: mutation,
    deleteCalendarMutation: mutation,
    defaultSourceMutation: mutation,
    disconnectMutation: mutation,
    googleAuthMutation: mutation,
    microsoftAuthMutation: mutation,
    resetCalendarDataMutation: mutation,
    syncPreferencesMutation: mutation,
    updateConnectionSyncSettingsMutation: mutation,
    pauseFailedCalendarMutation: mutation,
    toggleWorkspaceCalendarMutation: {
      ...mutation,
      mutate: () => setChecked((value) => !value),
    },
    defaultSourceData: { options: [] },
    newCalendarName,
    setNewCalendarName,
    showCreateCalendarDialog,
    setShowCreateCalendarDialog,
    getCalendarColor: () => 'var(--primary)',
    toggleAccountExpanded: () => undefined,
    handleToggle: () => undefined,
  };
}
