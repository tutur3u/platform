'use client';

import type {
  CalendarConnection,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types';
import { CreateEventButton } from '@tuturuuu/ui/legacy/calendar/create-event-button';
import { useTranslations } from 'next-intl';
import type { E2EEStatus, FixProgress } from '../hooks/use-e2ee';
import CalendarConnections from './calendar-connections';
import { E2EEStatusBadge } from './e2ee-status-badge';
import { SmartScheduleButton } from './smart-schedule-button';

interface CalendarHeaderActionsProps {
  workspaceId: string;
  // E2EE props
  e2eeStatus: E2EEStatus | undefined;
  e2eeLoading: boolean;
  isVerifying: boolean;
  isFixing: boolean;
  isMigrating: boolean;
  isEnabling: boolean;
  fixProgress: FixProgress | null;
  hasUnencryptedEvents: boolean;
  onVerify: () => void;
  onMigrate: () => void;
  onEnable: () => void;
  // Feature flags
  enableSmartScheduling: boolean;
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
  calendarConnections: CalendarConnection[];
}

export function CalendarHeaderActions({
  workspaceId,
  e2eeStatus,
  e2eeLoading,
  isVerifying,
  isFixing,
  isMigrating,
  isEnabling,
  fixProgress,
  hasUnencryptedEvents,
  onVerify,
  onMigrate,
  onEnable,
  enableSmartScheduling,
  experimentalGoogleToken,
  calendarConnections,
}: CalendarHeaderActionsProps) {
  const t = useTranslations('calendar');

  return (
    <div className="grid w-full items-center gap-2 md:flex md:w-auto">
      <E2EEStatusBadge
        status={e2eeStatus}
        isLoading={e2eeLoading}
        isVerifying={isVerifying}
        isFixing={isFixing}
        isMigrating={isMigrating}
        isEnabling={isEnabling}
        fixProgress={fixProgress}
        hasUnencryptedEvents={hasUnencryptedEvents}
        onVerify={onVerify}
        onMigrate={onMigrate}
        onEnable={onEnable}
      />

      <CreateEventButton variant="header" label={t('new-event')} />

      {enableSmartScheduling && <SmartScheduleButton wsId={workspaceId} />}

      <CalendarConnections
        wsId={workspaceId}
        initialConnections={calendarConnections}
        hasGoogleAuth={!!experimentalGoogleToken}
      />
    </div>
  );
}
