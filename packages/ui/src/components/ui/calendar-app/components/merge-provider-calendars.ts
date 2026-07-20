import type { CalendarConnection } from '../../../../hooks/use-calendar-sync';
import type { ConnectedAccount, ProviderCalendar } from './calendar-types';

type SyncableCalendarConnection = CalendarConnection & {
  sync_delete_enabled?: boolean | null;
  sync_inbound_enabled?: boolean | null;
  sync_outbound_enabled?: boolean | null;
};

export type ManagedProviderCalendar = {
  accessRole: string;
  accountId: string;
  calendar_id: string;
  calendar_name: string;
  color: string | null;
  connectionExists: boolean;
  id: string;
  is_enabled: boolean;
  isFromAPI: boolean;
  syncDeleteEnabled: boolean;
  syncInboundEnabled: boolean;
  syncOutboundEnabled: boolean;
  ws_id: string;
};

export function mergeProviderCalendarsByAccount({
  accounts,
  calendarConnections,
  liveCalendarsByAccount,
  wsId,
}: {
  accounts: ConnectedAccount[];
  calendarConnections: CalendarConnection[];
  liveCalendarsByAccount: Record<string, ProviderCalendar[]>;
  wsId: string;
}) {
  return accounts.reduce<Record<string, ManagedProviderCalendar[]>>(
    (result, account) => {
      const liveCalendars = liveCalendarsByAccount[account.id] ?? [];
      const persistedConnections = calendarConnections.filter(
        (connection) => connection.auth_token_id === account.id
      ) as SyncableCalendarConnection[];
      const liveByCalendarId = new Map(
        liveCalendars.map((calendar) => [calendar.id, calendar])
      );
      const calendarIds = new Set([
        ...persistedConnections.map((connection) => connection.calendar_id),
        ...liveCalendars.map((calendar) => calendar.id),
      ]);

      result[account.id] = [...calendarIds].map((calendarId) => {
        const liveCalendar = liveByCalendarId.get(calendarId);
        const connection = persistedConnections.find(
          (candidate) => candidate.calendar_id === calendarId
        );

        return {
          id: connection?.id ?? calendarId,
          ws_id: wsId,
          calendar_id: calendarId,
          calendar_name:
            liveCalendar?.name ?? connection?.calendar_name ?? 'Calendar',
          is_enabled: connection?.is_enabled ?? false,
          color:
            connection?.color ?? liveCalendar?.backgroundColor ?? '#4285f4',
          isFromAPI: !!liveCalendar,
          connectionExists: !!connection,
          accountId: account.id,
          accessRole:
            liveCalendar?.accessRole ?? connection?.access_role ?? 'reader',
          syncDeleteEnabled: connection?.sync_delete_enabled ?? true,
          syncInboundEnabled: connection?.sync_inbound_enabled ?? true,
          syncOutboundEnabled: connection?.sync_outbound_enabled ?? false,
        };
      });

      return result;
    },
    {}
  );
}
