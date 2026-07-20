'use client';

import { CalendarConnectionsCompact } from './calendar-connections-compact';
import { CalendarConnectionsSettingsContent } from './calendar-connections-settings-content';
import {
  type CalendarConnectionsUnifiedVariant,
  useCalendarConnectionsManager,
} from './use-calendar-connections-manager';

export type { CalendarConnectionsUnifiedVariant };
export { useCalendarConnectionsManager };

export default function CalendarConnectionsUnified({
  wsId,
  variant = 'compact',
  className,
}: {
  wsId: string;
  variant?: CalendarConnectionsUnifiedVariant;
  className?: string;
}) {
  const state = useCalendarConnectionsManager(wsId);

  if (variant === 'settings') {
    return (
      <CalendarConnectionsSettingsContent state={state} className={className} />
    );
  }

  return <CalendarConnectionsCompact state={state} />;
}
